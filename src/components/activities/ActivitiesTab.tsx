import { useEffect, useMemo, useState, Fragment } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import { ActivityCrudModal } from './ActivityCrudModal';
import './ActivitiesTab.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Coach    { phone: string; name: string; }
interface Facility { facilityId: string; id?: string; sk?: string; name: string; capacity?: number; }

interface Schedule {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
  coachPhone: string;
  facilityId: string;
  activityType: string;
  capacity: number;
  level?: string;
  currentOccupancy?: number;
  status?: string;
}

interface SchedulesByDate { date: string; dayOfWeek: string; schedules: Schedule[]; }

interface Booking {
  sk: string;
  phone?: string;
  memberPhone?: string;
  name?: string;
  packageId?: string;
  activityType?: string;
  scheduleId?: string;   // present when already assigned
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  bookedAt?: string;
}

interface BookingGroup {
  activityType: string;
  bookings: Booking[];
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function avatarInit(b: Booking): string {
  const n = b.name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  return '\u{1F464}';
}

function avatarLabel(b: Booking): string {
  return b.name?.trim() || b.memberPhone || b.phone || b.sk;
}

function avatarColor(b: Booking): string {
  const seed = b.name?.trim() || b.memberPhone || b.phone || b.sk;
  const idx  = seed.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ActivitiesTab = () => {
  const { adminSub, loading: adminLoading } = useAdminSub();

  const [startDate, setStartDate] = useState<string>(
    getMonday(new Date()).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(() => {
    const end = new Date(getMonday(new Date()));
    end.setDate(end.getDate() + 6);
    return end.toISOString().split('T')[0];
  });

  const [schedules,          setSchedules]          = useState<Schedule[]>([]);
  const [schedulesLoading,   setSchedulesLoading]   = useState(false);
  const [coaches,            setCoaches]            = useState<Coach[]>([]);
  const [coachesLoading,     setCoachesLoading]     = useState(false);
  const [facilities,         setFacilities]         = useState<Facility[]>([]);
  const [facilitiesLoading,  setFacilitiesLoading]  = useState(false);

  // ALL bookings in the date range (pending + assigned)
  const [allBookings,        setAllBookings]        = useState<Booking[]>([]);

  const [showModal,          setShowModal]          = useState(false);
  const [editingActivity,    setEditingActivity]    = useState<Schedule | null>(null);
  const [isSubmitting,       setIsSubmitting]       = useState(false);

  // Drag and drop state
  const [draggedBooking,    setDraggedBooking]    = useState<Booking | null>(null);
  const [dropTargetId,      setDropTargetId]      = useState<string | null>(null);

  // Expanded assignment detail card (sk of the booking whose detail is shown)
  const [expandedBookingSk, setExpandedBookingSk] = useState<string | null>(null);

  // Fetch coaches
  useEffect(() => {
    if (!adminSub) return;
    setCoachesLoading(true);
    DatabaseService.queryCoachesForScheduling(adminSub)
      .then((data) =>
        setCoaches(Array.isArray(data) ? data.map((c: any) => ({ phone: c.phone, name: c.name })) : [])
      )
      .catch(() => setCoaches([]))
      .finally(() => setCoachesLoading(false));
  }, [adminSub]);

  // Fetch facilities
  useEffect(() => {
    if (!adminSub) return;
    setFacilitiesLoading(true);
    DatabaseService.queryFacilitiesForScheduling(adminSub)
      .then((data) =>
        setFacilities(
          Array.isArray(data)
            ? data.map((f: any) => ({
                facilityId: f.facilityId || f.id || f.sk?.replace('FACILITY#', ''),
                id:         f.id || f.facilityId || f.sk?.replace('FACILITY#', ''),
                sk:         f.sk,
                name:       f.name || f.location || 'Unknown Facility',
                capacity:   f.capacity || 0,
              }))
            : []
        )
      )
      .catch(() => setFacilities([]))
      .finally(() => setFacilitiesLoading(false));
  }, [adminSub]);

  // Subscribe to schedules
  useEffect(() => {
    if (!adminSub || !startDate || !endDate) return;
    setSchedulesLoading(true);
    const unsubscribe = DatabaseService.observeSchedulesByDateRange(
      adminSub, startDate, endDate,
      (data: any[]) => {
        setSchedules(
          data
            .filter((item) => item.entityType === 'SCHEDULE' && item.sk?.startsWith('SCHEDULE#'))
            .map((item) => ({
              scheduleId:       item.scheduleId || item.sk.replace(/^SCHEDULE#/, ''),
              date:             item.date,
              startTime:        item.startTime,
              endTime:          item.endTime,
              coachPhone:       item.coachPhone,
              facilityId:       item.facilityId,
              activityType:     item.activityType || '',
              capacity:         item.capacity || 30,
              level:            item.level || 'Open Level',
              currentOccupancy: item.currentOccupancy || 0,
              status:           item.status || undefined,
            }))
        );
        setSchedulesLoading(false);
      }
    );
    return () => unsubscribe();
  }, [adminSub, startDate, endDate]);

  // Subscribe to ALL bookings for this admin, filter by date range client-side
  useEffect(() => {
    if (!adminSub) return;
    const client = generateClient<Schema>();

    const subscription = (client.models as any).ClubRecord.observeQuery({
      filter: {
        and: [
          { pk:         { eq: adminSub } },
          { entityType: { eq: 'BOOKING' } },
        ],
      },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const filtered = items
          .filter((r: any) => {
            if (r?.entityType !== 'BOOKING') return false;
            // Keep bookings whose date falls in the selected range,
            // OR bookings with no date (pending, unscheduled)
            if (!r.date) return true;
            return r.date >= startDate && r.date <= endDate;
          })
          .map((r: any) => ({
            sk:           r.sk          ?? '',
            phone:        r.phone       ?? r.memberPhone ?? '',
            memberPhone:  r.memberPhone ?? r.phone       ?? '',
            name:         r.name        ?? r.memberName  ?? r.displayName ?? '',
            packageId:    r.packageId,
            activityType: (r.activityType && r.activityType.trim())
                            || (r.packageId && `Package: ${r.packageId}`)
                            || 'Pending Enrollment',
            scheduleId:   r.scheduleId  ?? '',
            date:         r.date        ?? '',
            startTime:    r.startTime   ?? '',
            endTime:      r.endTime     ?? '',
            status:       r.status      ?? '',
            bookedAt:     r.bookedAt    ?? '',
          }));

        setAllBookings(filtered);
      },
      error: (err: Error) => {
        console.error('[ActivitiesTab] bookings subscription error:', err);
      },
    });

    return () => subscription.unsubscribe();
  }, [adminSub, startDate, endDate]);

  // ── Derived maps ──────────────────────────────────────────────────────────

  const coachMap = useMemo(() => {
    const map: Record<string, string> = {};
    coaches.forEach((c) => { map[c.phone] = c.name; });
    return map;
  }, [coaches]);

  const facilityMap = useMemo(() => {
    const map: Record<string, string> = {};
    facilities.forEach((f) => {
      const id = f.facilityId || f.id || f.sk?.replace('FACILITY#', '');
      if (id) map[id] = f.name;
    });
    return map;
  }, [facilities]);

  // scheduleId -> Schedule (for quick lookup when building assignment detail)
  const scheduleMap = useMemo(() => {
    const map: Record<string, Schedule> = {};
    schedules.forEach((s) => { map[s.scheduleId] = s; });
    return map;
  }, [schedules]);

  // Group ALL bookings by activityType
  const bookingGroups = useMemo((): BookingGroup[] => {
    const map = new Map<string, Booking[]>();
    for (const b of allBookings) {
      const key = b.activityType || 'Unknown Activity';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()].map(([activityType, bookings]) => ({ activityType, bookings }));
  }, [allBookings]);

  const schedulesByDate = useMemo(() => {
    const grouped: Record<string, SchedulesByDate> = {};
    const current = new Date(startDate + 'T12:00');
    const end     = new Date(endDate   + 'T12:00');
    while (current <= end) {
      const dateStr   = current.toISOString().split('T')[0];
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][current.getDay()];
      grouped[dateStr] = { date: dateStr, dayOfWeek, schedules: [] };
      current.setDate(current.getDate() + 1);
    }
    schedules.forEach((s) => { if (grouped[s.date]) grouped[s.date].schedules.push(s); });
    Object.values(grouped).forEach((day) =>
      day.schedules.sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    return Object.values(grouped);
  }, [schedules, startDate, endDate]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleOpenNewActivity = () => { setEditingActivity(null); setShowModal(true); };
  const handleEditActivity    = (s: Schedule) => { setEditingActivity(s); setShowModal(true); };

  const handleDeleteActivity = async (schedule: Schedule) => {
    if (!window.confirm(`Delete "${schedule.activityType || 'Unnamed Activity'}"?`)) return;
    try {
      await DatabaseService.deleteScheduleRecord(adminSub!, schedule.scheduleId);
    } catch (err) {
      alert(`Error deleting: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleModalSubmit = async (data: any, scheduleId: string, isEdit: boolean) => {
    setIsSubmitting(true);
    try {
      const payload = {
        date:             data.date,
        startTime:        data.startTime,
        endTime:          data.endTime,
        facilityId:       data.facilityId,
        activityType:     data.activityType,
        coachPhone:       data.coachPhone,
        capacity:         data.capacity,
        currentOccupancy: data.currentOccupancy || 0,
        ...(data.status ? { status: data.status } : {}),
      };
      if (isEdit) await DatabaseService.updateScheduleRecord(adminSub!, scheduleId, payload);
      else        await DatabaseService.createScheduleRecord(adminSub!, scheduleId, payload);
      setShowModal(false);
      setEditingActivity(null);
    } catch (err) {
      alert(`Error saving: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Drag and Drop handlers ────────────────────────────────────────────────

  const handleDragStart = (booking: Booking) => {
    setDraggedBooking(booking);
    setExpandedBookingSk(null);
  };

  const handleDragEnd = () => {
    setDraggedBooking(null);
    setDropTargetId(null);
  };

  const handleDragOver = (e: React.DragEvent, scheduleId: string) => {
    e.preventDefault();
    setDropTargetId(scheduleId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we are leaving the row entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetSchedule: Schedule) => {
    e.preventDefault();
    setDropTargetId(null);

    const booking = draggedBooking;
    setDraggedBooking(null);

    if (!booking || !adminSub) return;

    // No-op if dropped onto the same schedule it's already in
    if (booking.scheduleId === targetSchedule.scheduleId) return;

    const client = generateClient<Schema>();
    const now    = new Date().toISOString();

    try {
      // 1. Update the booking record in-place
      // Strip any accidental SCHEDULE# prefix so gsi2pk is never double-prefixed
      const cleanScheduleId = targetSchedule.scheduleId.replace('SCHEDULE#', '');
      const gsi2pkValue     = `${adminSub}#SCHEDULE#${cleanScheduleId}`;
      const gsi2skValue     = `DATETIME#${booking.bookedAt || now}`;

      const { errors } = await (client.models as any).ClubRecord.update({
        pk:           adminSub,
        sk:           booking.sk,
        scheduleId:   targetSchedule.scheduleId,
        activityType: targetSchedule.activityType,
        status:       'CONFIRMED',
        gsi1sk:       'STATUS#CONFIRMED',
        gsi2pk:       gsi2pkValue,
        gsi2sk:       gsi2skValue,
        date:         targetSchedule.date,
        startTime:    targetSchedule.startTime,
        endTime:      targetSchedule.endTime,
        updatedAt:    now,
      });

      if (errors?.length) {
        console.error('[ActivitiesTab] drop update error:', errors);
        alert('Assignment failed: ' + errors[0]?.message);
        return;
      }

      // 2. If moving from a previous schedule, decrement its occupancy
      const prevScheduleId = booking.scheduleId;
      if (prevScheduleId && prevScheduleId !== targetSchedule.scheduleId) {
        const prevSchedule = scheduleMap[prevScheduleId];
        if (prevSchedule) {
          await DatabaseService.updateScheduleRecord(adminSub, prevScheduleId, {
            date:             prevSchedule.date,
            startTime:        prevSchedule.startTime,
            endTime:          prevSchedule.endTime,
            facilityId:       prevSchedule.facilityId,
            activityType:     prevSchedule.activityType,
            coachPhone:       prevSchedule.coachPhone,
            capacity:         prevSchedule.capacity,
            currentOccupancy: Math.max(0, (prevSchedule.currentOccupancy ?? 0) - 1),
            ...(prevSchedule.status ? { status: prevSchedule.status } : {}),
          }).catch((err: unknown) =>
            console.error('[ActivitiesTab] decrement occupancy failed:', err)
          );
        }
      }

      // 3. Increment occupancy on the target schedule
      await DatabaseService.updateScheduleRecord(adminSub, targetSchedule.scheduleId, {
        date:             targetSchedule.date,
        startTime:        targetSchedule.startTime,
        endTime:          targetSchedule.endTime,
        facilityId:       targetSchedule.facilityId,
        activityType:     targetSchedule.activityType,
        coachPhone:       targetSchedule.coachPhone,
        capacity:         targetSchedule.capacity,
        currentOccupancy: (targetSchedule.currentOccupancy ?? 0) + 1,
        ...(targetSchedule.status ? { status: targetSchedule.status } : {}),
      }).catch((err: unknown) =>
        console.error('[ActivitiesTab] increment occupancy failed:', err)
      );

    } catch (err) {
      console.error('[ActivitiesTab] handleDrop threw:', err);
      alert('Assignment failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (adminLoading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>
          Activities & Schedules
        </h2>
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading...</div>
      </div>
    );
  }

  const pendingCount = allBookings.filter((b) => !b.scheduleId || b.status !== 'CONFIRMED').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', backgroundColor: '#ffffff' }}>

      {/* Top bar */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#2e3b50' }}>
            Activities & Schedules
          </h2>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50', marginLeft: 'auto' }}>From:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50' }}>To:</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
          <button onClick={handleOpenNewActivity} style={{
            padding: '6px 12px', background: '#2e3b50', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
          }}>
            + New Activity
          </button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: All Bookings */}
        <div style={{
          width: '300px', flexShrink: 0,
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Column header */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>
              Enrollments
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {pendingCount > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                  background: '#fee2e2', color: '#b91c1c', borderRadius: '10px',
                }}>
                  {pendingCount} pending
                </span>
              )}
              {allBookings.length > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                  background: '#f1f5f9', color: '#64748b', borderRadius: '10px',
                }}>
                  {allBookings.length} total
                </span>
              )}
            </div>
          </div>

          {/* Drag hint */}
          {allBookings.length > 0 && (
            <div style={{
              padding: '6px 14px', background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              fontSize: '10px', color: '#94a3b8', fontStyle: 'italic',
            }}>
              Drag a member card onto a class row to assign
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {bookingGroups.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#bbb', textAlign: 'center', marginTop: '24px', fontStyle: 'italic' }}>
                No enrollments in this date range
              </p>
            ) : (
              bookingGroups.map((group) => (
                <div key={group.activityType} style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                }}>
                  {/* Group header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', lineHeight: 1.3 }}>
                      {group.activityType}
                    </span>
                    <span style={{
                      fontSize: '10px', fontWeight: '700',
                      background: '#dbeafe', color: '#1d4ed8',
                      borderRadius: '10px', padding: '2px 7px',
                      whiteSpace: 'nowrap', marginLeft: '6px',
                    }}>
                      {group.bookings.length}
                    </span>
                  </div>

                  {/* Member cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {group.bookings.map((b) => {
                      const hasName    = !!b.name?.trim();
                      const color      = avatarColor(b);
                      const init       = avatarInit(b);
                      const label      = avatarLabel(b);
                      const isAssigned = !!(b.scheduleId && b.status === 'CONFIRMED');
                      const isExpanded = expandedBookingSk === b.sk;
                      const assignedSched = isAssigned ? scheduleMap[b.scheduleId!] : null;

                      return (
                        <div key={b.sk}>
                          {/* Draggable card */}
                          <div
                            draggable
                            onDragStart={() => handleDragStart(b)}
                            onDragEnd={handleDragEnd}
                            onClick={() => {
                              if (isAssigned) {
                                setExpandedBookingSk(isExpanded ? null : b.sk);
                              }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '7px',
                              padding: '5px 6px',
                              background: '#fff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              cursor: isAssigned ? 'pointer' : 'grab',
                              opacity: isAssigned ? 0.5 : 1,
                              transition: 'opacity 0.15s, border-color 0.15s',
                              userSelect: 'none',
                            }}
                          >
                            {/* Avatar */}
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: hasName ? color : '#e2e8f0',
                              color: hasName ? '#fff' : '#64748b',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: hasName ? '9px' : '12px', fontWeight: '700', flexShrink: 0,
                            }}>
                              {init}
                            </div>

                            {/* Name / phone */}
                            <span style={{ fontSize: '11px', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {label}
                            </span>

                            {/* Status badge */}
                            {isAssigned ? (
                              <span style={{ fontSize: '9px', fontWeight: '700', color: '#15803d', background: '#dcfce7', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>
                                Assigned
                              </span>
                            ) : (
                              <span style={{ fontSize: '9px', fontWeight: '700', color: '#b45309', background: '#fef3c7', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>
                                Pending
                              </span>
                            )}
                          </div>

                          {/* Inline assignment detail (click to expand) */}
                          {isAssigned && isExpanded && (
                            <div style={{
                              marginTop: '2px', padding: '6px 8px',
                              background: '#f0fdf4', border: '1px solid #bbf7d0',
                              borderRadius: '6px', fontSize: '10px', color: '#166534',
                            }}>
                              {assignedSched ? (
                                <>
                                  {/* Class name — single column */}
                                  <div style={{ marginBottom: '3px' }}>
                                    <strong>Class:</strong> {assignedSched.activityType}
                                  </div>

                                  {/* Date row — assigned on left, member-selected on right */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
                                    <span><strong>Date:</strong> {assignedSched.date}</span>
                                    {b.date && b.date !== assignedSched.date && (
                                      <span style={{ fontSize: '9px', color: '#3b82f6', whiteSpace: 'nowrap' }}>
                                        Selected: {b.date}
                                      </span>
                                    )}
                                  </div>

                                  {/* Time row — assigned on left, member-selected on right */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                                    <span><strong>Time:</strong> {assignedSched.startTime} - {assignedSched.endTime}</span>
                                    {b.startTime && b.startTime !== assignedSched.startTime && (
                                      <span style={{ fontSize: '9px', color: '#3b82f6', whiteSpace: 'nowrap' }}>
                                        Selected: {b.startTime}
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div>Schedule ID: {b.scheduleId}</div>
                              )}
                              <div style={{ marginTop: '4px', fontSize: '9px', color: '#64748b', fontStyle: 'italic' }}>
                                Drag to a different row to reassign
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Schedule Table */}
        <div style={{ flex: 1, background: '#f9fafb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Drop-mode banner when a drag is in flight */}
          {draggedBooking && (
            <div style={{
              flexShrink: 0,
              padding: '8px 16px',
              background: '#0891b2',
              color: '#fff',
              fontSize: '12px', fontWeight: '600',
            }}>
              Drop onto a class row to assign {avatarLabel(draggedBooking)}
            </div>
          )}

          {schedulesLoading || coachesLoading || facilitiesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading schedules...</div>
          ) : schedulesByDate.every((day) => day.schedules.length === 0) ? (
            <div style={{
              margin: '24px', background: '#fff', border: '1px solid #e0e0e0',
              borderRadius: '6px', padding: '40px', textAlign: 'center', color: '#999',
            }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '10px' }}>
                No activities in this date range
              </div>
              <button onClick={handleOpenNewActivity} style={{
                padding: '6px 14px', background: '#2e3b50', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              }}>
                Schedule First Activity
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              <table className="activities-table">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f1f5f9', zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['Activity', 'Time', 'Trainer', 'Attendees', 'Location', 'Level', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '11px', fontWeight: '700', color: '#475569',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedulesByDate.map((day) =>
                    day.schedules.length > 0 ? (
                      <Fragment key={day.date}>
                        <tr className="date-header-row">
                          <td colSpan={7} className="date-header">
                            <strong>{day.dayOfWeek}</strong> &mdash; {new Date(day.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                        {day.schedules.map((schedule) => {
                          const isDraft    = schedule.status === 'DRAFT_PROPOSAL';
                          const isDropTarget = dropTargetId === schedule.scheduleId;

                          let rowBg = isDraft ? '#fffbeb' : '#fff';
                          if (isDropTarget) rowBg = '#e0f2fe';

                          return (
                            <tr
                              key={schedule.scheduleId}
                              onDragOver={(e) => handleDragOver(e, schedule.scheduleId)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, schedule)}
                              style={{
                                background: rowBg,
                                ...(isDraft && !isDropTarget ? { borderLeft: '3px solid #f59e0b' } : {}),
                                ...(isDropTarget ? { outline: '2px dashed #0891b2' } : {}),
                                cursor: draggedBooking ? 'copy' : 'default',
                                transition: 'background 0.1s',
                              }}
                            >
                              <td>
                                <div style={{ fontWeight: '600', fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {schedule.activityType}
                                  {isDraft && (
                                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#1565c0', background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '3px', padding: '1px 5px', lineHeight: '1.4' }}>
                                      Auto-generated
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ fontSize: '12px', fontWeight: '500', color: '#1a1a1a' }}>
                                {schedule.startTime} - {schedule.endTime}
                              </td>
                              <td style={{ fontSize: '12px', color: '#666' }}>
                                {coachMap[schedule.coachPhone] || schedule.coachPhone}
                              </td>
                              <td style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
                                {schedule.currentOccupancy || 0} / {schedule.capacity}
                              </td>
                              <td style={{ fontSize: '12px', color: '#666' }}>
                                {facilityMap[schedule.facilityId] || schedule.facilityId}
                              </td>
                              <td style={{ fontSize: '12px', color: '#666' }}>{schedule.level}</td>
                              <td style={{ fontSize: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleEditActivity(schedule); }}
                                  title="Edit"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '3px 6px', opacity: 0.7 }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteActivity(schedule); }}
                                  title="Delete"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '3px 6px', opacity: 0.7, marginLeft: '2px' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ) : null
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Activity CRUD Modal */}
      <ActivityCrudModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingActivity(null); }}
        onSubmit={handleModalSubmit}
        adminSub={adminSub!}
        isLoading={isSubmitting}
        activity={editingActivity}
        facilities={facilities}
      />
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
