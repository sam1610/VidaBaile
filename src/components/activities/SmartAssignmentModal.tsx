import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingBooking {
  sk: string;
  phone?: string;
  memberPhone?: string;
  name?: string;          // WhatsApp profile name — preferred display value
  packageId?: string;
  activityType?: string;
}

interface PendingGroup {
  activityType: string;
  bookings: PendingBooking[];
}

interface Schedule {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
  coachPhone: string;
  facilityId: string;
  activityType: string;
  capacity: number;
  currentOccupancy?: number;
}

interface Coach    { phone: string; name: string; }
interface Facility { facilityId: string; name: string; capacity?: number; }

export interface SmartAssignmentModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  pendingGroup:  PendingGroup | null;
  /** All upcoming schedules in the selected date range — no activityType pre-filter */
  schedules:     Schedule[];
  coaches:       Coach[];
  facilities:    Facility[];
  onMerge:       (scheduleId: string) => void;
  onCreateNew:   (data: { date: string; startTime: string; endTime: string; coachPhone: string; facilityId: string }) => void;
  /** Shows a loading state on action buttons while the DB write is in flight */
  isLoading?:    boolean;
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

function Avatar({ booking }: { booking: PendingBooking }) {
  const hasName = !!booking.name?.trim();
  const seed    = booking.name?.trim() || booking.memberPhone || booking.phone || booking.sk;
  const idx     = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const color   = AVATAR_COLORS[idx];
  // First letter of name when available; generic icon when not.
  const init    = hasName ? booking.name!.trim().charAt(0).toUpperCase() : '\u{1F464}';

  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: hasName ? color : '#e2e8f0',
      color: hasName ? '#fff' : '#64748b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: hasName ? '11px' : '14px',
      fontWeight: '700',
      flexShrink: 0,
    }}>
      {init}
    </div>
  );
}

function bookingLabel(b: PendingBooking): string {
  return b.name?.trim() || b.memberPhone || b.phone || b.sk;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SmartAssignmentModal({
  isOpen, onClose, pendingGroup, schedules, coaches, facilities,
  onMerge, onCreateNew, isLoading = false,
}: SmartAssignmentModalProps) {

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [newDate,       setNewDate]       = useState('');
  const [newStartTime,  setNewStartTime]  = useState('18:00');
  const [newEndTime,    setNewEndTime]    = useState('19:30');
  const [newCoach,      setNewCoach]      = useState('');
  const [newFacility,   setNewFacility]   = useState('');

  if (!isOpen || !pendingGroup) return null;

  const count    = pendingGroup.bookings.length;
  const activity = pendingGroup.activityType;

  const handleMerge = () => {
    if (!selectedScheduleId || isLoading) return;
    onMerge(selectedScheduleId);
  };

  const handleCreate = () => {
    if (isLoading) return;
    if (!newDate || !newStartTime || !newEndTime || !newCoach || !newFacility) {
      alert('Please fill in all fields before creating a new class.');
      return;
    }
    onCreateNew({ date: newDate, startTime: newStartTime, endTime: newEndTime, coachPhone: newCoach, facilityId: newFacility });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Smart Assignment"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          width: 'min(92vw, 740px)',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '0',
          opacity: isLoading ? 0.75 : 1,
          pointerEvents: isLoading ? 'none' : 'auto',
          transition: 'opacity 0.15s',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 24px 14px',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
              {isLoading ? 'Assigning\u2026' : 'Smart Assignment'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
              You are assigning{' '}
              <strong style={{ color: '#1d4ed8' }}>{count} member{count !== 1 ? 's' : ''}</strong>
              {' to '}
              <strong style={{ color: '#0f172a' }}>{activity}</strong>
            </p>

            {/* Member avatar strip */}
            <div style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
              {pendingGroup.bookings.slice(0, 8).map((b) => (
                <Avatar key={b.sk} booking={b} />
              ))}
              {pendingGroup.bookings.length > 8 && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#e2e8f0', color: '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '700',
                }}>
                  +{pendingGroup.bookings.length - 8}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', fontSize: '22px', lineHeight: 1,
              padding: '0 4px', marginTop: '-2px',
            }}
          >
            x
          </button>
        </div>

        {/* Two-column body */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 0,
          padding: '0 0 20px',
        }}>

          {/* Option A: Merge */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: '#1d4ed8', textTransform: 'uppercase' }}>
                Option A
              </span>
              <h3 style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                Merge into Existing Class
              </h3>
            </div>

            {schedules.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                No classes found in the current date range.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {schedules.map((s) => {
                  const coachName  = coaches.find((c) => c.phone === s.coachPhone)?.name || s.coachPhone;
                  const facName    = facilities.find((f) => f.facilityId === s.facilityId)?.name || s.facilityId;
                  const occ        = s.currentOccupancy ?? 0;
                  const isSelected = selectedScheduleId === s.scheduleId;
                  return (
                    <label key={s.scheduleId} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '10px 12px',
                      background: isSelected ? '#eff6ff' : '#f8fafc',
                      border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
                      <input
                        type="radio"
                        name="mergeTarget"
                        value={s.scheduleId}
                        checked={isSelected}
                        onChange={() => setSelectedScheduleId(s.scheduleId)}
                        style={{ marginTop: '2px', accentColor: '#1d4ed8' }}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                          {s.activityType}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                          {new Date(s.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {' @ '}{s.startTime.slice(0, 5)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Coach {coachName} {String.fromCharCode(183)} {facName}
                        </div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>
                          <span style={{
                            background: occ >= s.capacity ? '#fee2e2' : '#dcfce7',
                            color:      occ >= s.capacity ? '#b91c1c' : '#15803d',
                            borderRadius: '4px', padding: '1px 6px', fontWeight: '600',
                          }}>
                            {occ} / {s.capacity} enrolled
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Member name list */}
            {pendingGroup.bookings.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Members to assign
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {pendingGroup.bookings.map((b) => (
                    <li key={b.sk} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Avatar booking={b} />
                      <span style={{ fontSize: '11px', color: '#475569' }}>{bookingLabel(b)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleMerge}
              disabled={!selectedScheduleId || isLoading}
              style={{
                width: '100%', padding: '10px',
                background: selectedScheduleId && !isLoading ? '#1d4ed8' : '#e2e8f0',
                color: selectedScheduleId && !isLoading ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: '8px',
                fontSize: '12px', fontWeight: '700',
                cursor: selectedScheduleId && !isLoading ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              {isLoading ? 'Assigning\u2026' : `Merge ${count} Member${count !== 1 ? 's' : ''} Here`}
            </button>
          </div>

          {/* Divider */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            <div style={{ width: 1, flex: 1, background: '#e2e8f0' }} />
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#f1f5f9', border: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: '700', color: '#64748b',
              flexShrink: 0, margin: '8px 0',
            }}>
              OR
            </div>
            <div style={{ width: 1, flex: 1, background: '#e2e8f0' }} />
          </div>

          {/* Option B: Create New */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: '#0891b2', textTransform: 'uppercase' }}>
                Option B
              </span>
              <h3 style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                Create New Class
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Date</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Start</label>
                  <input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>End</label>
                  <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Coach</label>
                <select value={newCoach} onChange={(e) => setNewCoach(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="">Select Coach</option>
                  {coaches.map((c) => (
                    <option key={c.phone} value={c.phone}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Facility</label>
                <select value={newFacility} onChange={(e) => setNewFacility(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="">Select Hall</option>
                  {facilities.map((f) => (
                    <option key={f.facilityId} value={f.facilityId}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={isLoading}
              style={{
                width: '100%', padding: '10px',
                background: isLoading ? '#e2e8f0' : '#0891b2',
                color: isLoading ? '#94a3b8' : '#fff',
                border: 'none', borderRadius: '8px',
                fontSize: '12px', fontWeight: '700',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = '#0e7490'; }}
              onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = '#0891b2'; }}
            >
              {isLoading ? 'Assigning\u2026' : 'Create & Assign All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
