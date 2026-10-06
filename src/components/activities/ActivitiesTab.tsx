import { useEffect, useMemo, useState, Fragment } from 'react';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import { ActivityCrudModal } from './ActivityCrudModal';
import { SmartAssignmentModal } from './SmartAssignmentModal';
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

interface PendingBooking {
  sk: string;
  phone?: string;
  memberPhone?: string;
  name?: string;        // WhatsApp profile name — written by vidaBaileWhatsapp handler
  packageId?: string;
  activityType?: string;
  date?: string;
  startTime?: string;
  status?: string;
  bookedAt?: string;
}

interface PendingGroup {
  activityType: string;
  bookings: PendingBooking[];
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

function avatarInit(booking: PendingBooking): string {
  const n = booking.name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  return '\u{1F464}';
}

function avatarLabel(booking: PendingBooking): string {
  return booking.name?.trim() || booking.memberPhone || booking.phone || booking.sk;
}

function avatarColor(booking: PendingBooking): string {
  const seed = booking.name?.trim() || booking.memberPhone || booking.phone || booking.sk;
  const idx  = seed.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ActivitiesTab = () => {
  const { adminSub, loading: adminLoading } = useAdminSub();

  // Date range
  const [startDate, setStartDate] = useState<string>(
    getMonday(new Date()).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(() => {
    const end = new Date(getMonday(new Date()));
    end.setDate(end.getDate() + 6);
    return end.toISOString().split('T')[0];
  });

  const [schedules,           setSchedules]           = useState<Schedule[]>([]);
  const [schedulesLoading,    setSchedulesLoading]    = useState(false);
  const [coaches,             setCoaches]             = useState<Coach[]>([]);
  const [coachesLoading,      setCoachesLoading]      = useState(false);
  const [facilities,          setFacilities]          = useState<Facility[]>([]);
  const [facilitiesLoading,   setFacilitiesLoading]   = useState(false);
  const [pendingBookings,     setPendingBookings]     = useState<PendingBooking[]>([]);
  const [showModal,           setShowModal]           = useState(false);
  const [editingActivity,     setEditingActivity]     = useState<Schedule | null>(null);
  const [isSubmitting,        setIsSubmitting]        = useState(false);
  const [selectedPendingGroup,setSelectedPendingGroup]= useState<PendingGroup | null>(null);
  const [showAssignModal,     setShowAssignModal]     = useState(false);
  const [isAssigning,         setIsAssigning]         = useState(false);

  // Fetch coaches
  useEffect(() => {
    if (!adminSub) return;
    setCoachesLoading(true);
    DatabaseService.queryCoachesForScheduling(adminSub)
      .then((data) =>
        setCoaches(Array.isArray(data) ? data.map((c) => ({ phone: c.phone, name: c.name })) : [])
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
            ? data.map((f) => ({
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

  // Subscribe to pending bookings
  useEffect(() => {
    if (!adminSub) return;
    const unsubscribe = DatabaseService.observePendingBookings(
      adminSub,
      (data: any[]) => {
        setPendingBookings(
          data.map((r) => {
            const resolvedActivity =
              (r.activityType && r.activityType.trim()) ||
              (r.packageId    && `Package: ${r.packageId}`) ||
              'Pending Enrollment';
            return {
              sk:           r.sk          ?? '',
              phone:        r.phone       ?? r.memberPhone ?? '',
              memberPhone:  r.memberPhone ?? r.phone       ?? '',
              // name is written by vidaBaileWhatsapp from the WhatsApp sender profile
              name:         r.name        ?? r.memberName  ?? r.displayName ?? '',
              packageId:    r.packageId,
              activityType: resolvedActivity,
              date:         r.date,
              startTime:    r.startTime,
              status:       r.status,
              bookedAt:     r.bookedAt,
            };
          })
        );
      }
    );
    return () => unsubscribe();
  }, [adminSub]);

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

  const pendingGroups = useMemo((): PendingGroup[] => {
    const map = new Map<string, PendingBooking[]>();
    for (const b of pendingBookings) {
      const key = b.activityType || 'Unknown Activity';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()].map(([activityType, bookings]) => ({ activityType, bookings }));
  }, [pendingBookings]);

  const schedulesByDate = useMemo(() => {
    const grouped: Record<string, SchedulesByDate> = {};
    const current = new Date(startDate);
    const end     = new Date(endDate);
    while (current <= end) {
      const dateStr   = current.toISOString().split('T')[0];
      const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][current.getDay()];
      grouped[dateStr] = { date: dateStr, dayOfWeek, schedules: [] };
      current.setDate(current.getDate() + 1);
    }
    schedules.forEach((s) => { if (grouped[s.date]) grouped[s.date].schedules.push(s); });
    Object.values(grouped).forEach((day) => day.schedules.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return Object.values(grouped);
  }, [schedules, startDate, endDate]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleOpenNewActivity = () => { setEditingActivity(null); setShowModal(true); };
  const handleEditActivity    = (schedule: Schedule) => { setEditingActivity(schedule); setShowModal(true); };

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

  const handleAssign = (group: PendingGroup) => {
    setSelectedPendingGroup(group);
    setShowAssignModal(true);
  };

  // Option A: Merge pending bookings into an existing schedule
  const handleMerge = async (scheduleId: string) => {
    if (!adminSub || !selectedPendingGroup) return;

    const targetSchedule = schedules.find((s) => s.scheduleId === scheduleId);
    if (!targetSchedule) {
      alert('Target schedule not found. It may have been deleted.');
      return;
    }

    const bookingSks = selectedPendingGroup.bookings.map((b) => b.sk).filter(Boolean);
    if (bookingSks.length === 0) return;

    setIsAssigning(true);
    try {
      const assigned = await DatabaseService.batchAssignBookingsToSchedule(
        adminSub,
        bookingSks,
        targetSchedule,
      );
      if (assigned < bookingSks.length) {
        alert(`Assigned ${assigned} of ${bookingSks.length} members. Check console for errors on remaining.`);
      }
      setShowAssignModal(false);
      setSelectedPendingGroup(null);
    } catch (err) {
      alert(`Merge failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsAssigning(false);
    }
  };

  // Option B: Create a new schedule then assign all pending bookings to it
  const handleCreateNew = async (data: {
    date: string;
    startTime: string;
    endTime: string;
    coachPhone: string;
    facilityId: string;
  }) => {
    if (!adminSub || !selectedPendingGroup) return;

    const newScheduleId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bookingSks    = selectedPendingGroup.bookings.map((b) => b.sk).filter(Boolean);

    setIsAssigning(true);
    try {
      const newSchedule = await DatabaseService.createScheduleRecord(adminSub, newScheduleId, {
        date:             data.date,
        startTime:        data.startTime,
        endTime:          data.endTime,
        facilityId:       data.facilityId,
        activityType:     selectedPendingGroup.activityType,
        coachPhone:       data.coachPhone,
        capacity:         30,
        currentOccupancy: 0,
      });

      const targetSchedule = {
        scheduleId:       newScheduleId,
        date:             data.date,
        startTime:        data.startTime,
        endTime:          data.endTime,
        facilityId:       data.facilityId,
        activityType:     selectedPendingGroup.activityType,
        coachPhone:       data.coachPhone,
        capacity:         (newSchedule as any).capacity ?? 30,
        currentOccupancy: 0,
      };

      const assigned = await DatabaseService.batchAssignBookingsToSchedule(
        adminSub,
        bookingSks,
        targetSchedule,
      );

      if (assigned < bookingSks.length) {
        alert(`Class created. Assigned ${assigned} of ${bookingSks.length} members. Check console for errors.`);
      }

      setShowAssignModal(false);
      setSelectedPendingGroup(null);
    } catch (err) {
      alert(`Create & Assign failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsAssigning(false);
    }
  };

  if (adminLoading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>
          Activities & Schedules
        </h2>
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading\u2026</div>
      </div>
    );
  }

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

        {/* LEFT: Pending Enrollments */}
        <div style={{
          width: '300px', flexShrink: 0,
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>
              Pending Enrollments
            </span>
            {pendingBookings.length > 0 && (
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                background: '#fee2e2', color: '#b91c1c', borderRadius: '10px',
              }}>
                {pendingBookings.length}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {pendingGroups.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#bbb', textAlign: 'center', marginTop: '24px', fontStyle: 'italic' }}>
                No pending enrollments
              </p>
            ) : (
              pendingGroups.map((group) => (
                <div key={group.activityType} style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                }}>
                  {/* Group header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', lineHeight: 1.3 }}>
                      {group.activityType}
                    </span>
                    <span style={{
                      fontSize: '10px', fontWeight: '700',
                      background: '#dbeafe', color: '#1d4ed8',
                      borderRadius: '10px', padding: '2px 7px',
                      whiteSpace: 'nowrap', marginLeft: '6px',
                    }}>
                      {group.bookings.length} member{group.bookings.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Member list — shows name if available, phone as fallback */}
                  <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none' }}>
                    {group.bookings.slice(0, 5).map((b) => {
                      const hasName = !!b.name?.trim();
                      const color   = avatarColor(b);
                      const init    = avatarInit(b);
                      const label   = avatarLabel(b);
                      return (
                        <li key={b.sk} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: hasName ? color : '#e2e8f0',
                            color: hasName ? '#fff' : '#64748b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: hasName ? '10px' : '13px', fontWeight: '700', flexShrink: 0,
                          }}>
                            {init}
                          </div>
                          <span style={{ fontSize: '11px', color: '#475569' }}>{label}</span>
                        </li>
                      );
                    })}
                    {group.bookings.length > 5 && (
                      <li style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '31px' }}>
                        +{group.bookings.length - 5} more
                      </li>
                    )}
                  </ul>

                  <button
                    onClick={() => handleAssign(group)}
                    style={{
                      width: '100%',
                      padding: '5px',
                      background: selectedPendingGroup?.activityType === group.activityType ? '#1d4ed8' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    Assign
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Schedule Table */}
        <div style={{ flex: 1, background: '#f9fafb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {schedulesLoading || coachesLoading || facilitiesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading schedules\u2026</div>
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
                    {['Activity','Time','Trainer','Attendees','Location','Level','Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                            <strong>{day.dayOfWeek}</strong> {String.fromCharCode(8212)} {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                        {day.schedules.map((schedule) => {
                          const isDraft = schedule.status === 'DRAFT_PROPOSAL';
                          return (
                            <tr key={schedule.scheduleId}
                              style={isDraft ? { background: '#fffbeb', borderLeft: '3px solid #f59e0b' } : { background: '#fff' }}>
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
                                <button onClick={() => handleEditActivity(schedule)} title="Edit"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '3px 6px', opacity: 0.7 }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}>
                                  Edit
                                </button>
                                <button onClick={() => handleDeleteActivity(schedule)} title="Delete"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '3px 6px', opacity: 0.7, marginLeft: '2px' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}>
                                  Delete
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

      {/* Smart Assignment Modal — ALL schedules passed; no activityType pre-filter */}
      <SmartAssignmentModal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setSelectedPendingGroup(null); }}
        pendingGroup={selectedPendingGroup}
        schedules={schedules}
        coaches={coaches}
        facilities={facilities}
        onMerge={handleMerge}
        onCreateNew={handleCreateNew}
        isLoading={isAssigning}
      />

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
