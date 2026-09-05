import { useEffect, useMemo, useState } from 'react';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import { ActivityCrudModal } from './ActivityCrudModal';
import './ActivitiesTab.css';

interface Coach {
  phone: string;
  name: string;
}


interface Facility {
  facilityId: string;
  id?: string;
  sk?: string;
  name: string;
  capacity?: number;
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
  level?: string;
  currentOccupancy?: number;
}

interface SchedulesByDate {
  date: string;
  dayOfWeek: string;
  schedules: Schedule[];
}

/**
 * ActivitiesTab: Schedule dashboard for dance activities
 * 
 * Features:
 * - Custom date range picker
 * - Real-time schedule updates
 * - Coach phone to name mapping
 * - Facility ID to name mapping
 * - Create, Edit, Delete activities
 * - Strict relational dropdowns
 * - Group schedules by date
 */
export const ActivitiesTab = () => {
  const { adminSub, loading: adminLoading } = useAdminSub();

  // Date range state
  const [startDate, setStartDate] = useState<string>(getMonday(new Date()).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => {
    const end = new Date(getMonday(new Date()));
    end.setDate(end.getDate() + 6);
    return end.toISOString().split('T')[0];
  });

  // Schedules state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  // Coaches for name mapping
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);

  // Facilities for name mapping
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Schedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch coaches for name mapping
  useEffect(() => {
    if (!adminSub) return;

    const fetchCoaches = async () => {
      setCoachesLoading(true);
      try {
        const coachData = await DatabaseService.queryCoachesForScheduling(adminSub);
        setCoaches(
          Array.isArray(coachData)
            ? coachData.map((c) => ({ phone: c.phone, name: c.name }))
            : []
        );
      } catch (error) {
        console.error('Error fetching coaches:', error);
        setCoaches([]);
      } finally {
        setCoachesLoading(false);
      }
    };

    fetchCoaches();
  }, [adminSub]);

  // Fetch facilities for name mapping
  useEffect(() => {
    if (!adminSub) return;

    const fetchFacilities = async () => {
      setFacilitiesLoading(true);
      try {
        const facilityData = await DatabaseService.queryFacilitiesForScheduling(adminSub);
        setFacilities(
          Array.isArray(facilityData)
            ? facilityData.map((f) => ({
                facilityId: f.facilityId || f.id || f.sk?.replace('FACILITY#', ''),
                id: f.id || f.facilityId || f.sk?.replace('FACILITY#', ''),
                sk: f.sk,
                name: f.name || f.location || 'Unknown Facility',
                capacity: f.capacity || 0,
              }))
            : []
        );
      } catch (error) {
        console.error('Error fetching facilities:', error);
        setFacilities([]);
      } finally {
        setFacilitiesLoading(false);
      }
    };

    fetchFacilities();
  }, [adminSub]);

  // Create coach phone -> name lookup map
  const coachMap = useMemo(() => {
    const map: Record<string, string> = {};
    coaches.forEach((coach) => {
      map[coach.phone] = coach.name;
    });
    return map;
  }, [coaches]);

  // Create facility ID -> name lookup map
  const facilityMap = useMemo(() => {
    const map: Record<string, string> = {};
    facilities.forEach((facility) => {
      const id = facility.facilityId || facility.id || facility.sk?.replace('FACILITY#', '');
      if (id) {
        map[id] = facility.name;
      }
    });
    return map;
  }, [facilities]);

  // Subscribe to schedules for the date range
  useEffect(() => {
    if (!adminSub || !startDate || !endDate) return;

    setSchedulesLoading(true);
    const unsubscribe = DatabaseService.observeSchedulesByDateRange(
      adminSub,
      startDate,
      endDate,
      (data: any[]) => {
        const scheduleList = data
          .filter((item) => item.entityType === 'SCHEDULE' && item.sk?.startsWith('SCHEDULE#'))
          .map((item) => ({
            scheduleId: item.scheduleId || item.sk.replace(/^SCHEDULE#/, ''),
            date: item.date,
            startTime: item.startTime,
            endTime: item.endTime,
            coachPhone: item.coachPhone,
            facilityId: item.facilityId,
            activityType: item.activityType || '',
            capacity: item.capacity || 30,
            level: item.level || 'Open Level',
            currentOccupancy: item.currentOccupancy || 0,
          }));
        setSchedules(scheduleList);
        setSchedulesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminSub, startDate, endDate]);

  // Group schedules by date
  const schedulesByDate = useMemo(() => {
    const grouped: Record<string, SchedulesByDate> = {};

    // Initialize all days in the range
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
        current.getDay()
      ];
      grouped[dateStr] = {
        date: dateStr,
        dayOfWeek,
        schedules: [],
      };
      current.setDate(current.getDate() + 1);
    }

    // Populate schedules
    schedules.forEach((schedule) => {
      if (grouped[schedule.date]) {
        grouped[schedule.date].schedules.push(schedule);
      }
    });

    // Sort schedules by start time
    Object.values(grouped).forEach((day) => {
      day.schedules.sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return Object.values(grouped);
  }, [schedules, startDate, endDate]);

  const handleOpenNewActivity = () => {
    setEditingActivity(null);
    setShowModal(true);
  };

  const handleEditActivity = (schedule: Schedule) => {
    console.log('[ActivitiesTab] Editing activity:', schedule);
    setEditingActivity(schedule);
    setShowModal(true);
  };

  const handleDeleteActivity = async (schedule: Schedule) => {
    if (!window.confirm(`Are you sure you want to delete "${schedule.activityType || 'Unnamed Activity'}"? This action cannot be undone.`)) {
      return;
    }

    console.log('[ActivitiesTab] Deleting activity:', schedule.scheduleId);

    try {
      await DatabaseService.deleteScheduleRecord(adminSub!, schedule.scheduleId);
      console.log('[ActivitiesTab] Activity deleted successfully');
      // Subscription will automatically update the table
    } catch (error) {
      console.error('Error deleting activity:', error);
      alert(`Error deleting activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleModalSubmit = async (data: any, scheduleId: string, isEdit: boolean) => {
    setIsSubmitting(true);
    try {
      const payload = {
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        facilityId: data.facilityId,
        activityType: data.activityType,
        coachPhone: data.coachPhone,
        capacity: data.capacity,
        currentOccupancy: data.currentOccupancy || 0,
      };
      
      console.log('[ActivitiesTab] Received modal data with currentOccupancy:', data.currentOccupancy, 'Payload:', payload);

      if (isEdit) {
        // Update existing activity
        console.log('[ActivitiesTab] Updating activity:', scheduleId);
        await DatabaseService.updateScheduleRecord(adminSub!, scheduleId, payload);
        console.log('[ActivitiesTab] Activity updated successfully');
      } else {
        // Create new activity
        console.log('[ActivitiesTab] Creating new activity:', scheduleId);
        await DatabaseService.createScheduleRecord(adminSub!, scheduleId, payload);
        console.log('[ActivitiesTab] Activity created successfully');
      }
      
      setShowModal(false);
      setEditingActivity(null);
    } catch (error) {
      console.error('Error saving activity:', error);
      alert(`Error saving activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (adminLoading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>
          📅 ACTIVITIES & SCHEDULES
        </h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          Loading schedule data...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 140px)', 
      gap: '0',
      backgroundColor: '#ffffff'
    }}>
      {/* Top Controls Section - Fixed Height */}
      <div style={{ flexShrink: 0, padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700', color: '#2e3b50' }}>
          📅 ACTIVITIES & SCHEDULES
        </h2>
        {/* Date Range Picker */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50' }}>
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50' }}>
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          />
        </div>

        <button
          onClick={handleOpenNewActivity}
          style={{
            padding: '6px 12px',
            background: '#2e3b50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            marginLeft: 'auto',
          }}
        >
          + New Activity
        </button>
        </div>
      </div>
      {/* End Top Controls Section */}

      {/* Schedule Table - Scrollable Section */}
      {schedulesLoading || coachesLoading || facilitiesLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          Loading schedules...
        </div>
      ) : schedulesByDate.every((day) => day.schedules.length === 0) ? (
        <div
          style={{
            background: '#f9f9f9',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#999',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            No activities scheduled in this date range
          </div>
          <button
            onClick={handleOpenNewActivity}
            style={{
              padding: '6px 12px',
              background: '#2e3b50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Schedule First Activity
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
          <table className="activities-table">
            <thead style={{ 
              position: 'sticky',
              top: 0,
              backgroundColor: '#f9fafb',
              zIndex: 10
            }}>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Activity</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Time</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Trainer</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Attendees</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Location</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Level</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedulesByDate.map((day) =>
                day.schedules.length > 0 ? (
                  <React.Fragment key={day.date}>
                    {/* Date Header Row (7 columns now) */}
                    <tr className="date-header-row">
                      <td colSpan={7} className="date-header">
                        <strong>{day.dayOfWeek}</strong> — {new Date(day.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>

                    {/* Schedule Rows */}
                    {day.schedules.map((schedule) => (
                      <tr key={schedule.scheduleId}>
                        <td>
                          <div style={{ fontWeight: '600', fontSize: '12px', color: '#2e3b50' }}>
                            {schedule.activityType}
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
                        <td style={{ fontSize: '12px', color: '#666' }}>
                          {schedule.level}
                        </td>
                        <td style={{ fontSize: '12px', color: '#666', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleEditActivity(schedule)}
                            title="Edit Activity"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '4px 8px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteActivity(schedule)}
                            title="Delete Activity"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '4px 8px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s',
                              marginLeft: '4px',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <ActivityCrudModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingActivity(null);
        }}
        onSubmit={handleModalSubmit}
        adminSub={adminSub!}
        isLoading={isSubmitting}
        activity={editingActivity}
        facilities={facilities}
      />
    </div>
  );
};

/**
 * Get Monday of the current week
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

import React from 'react';
