import { useEffect, useMemo, useState } from 'react';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import './FacilitiesTab.css';

interface Facility {
  facilityId: string;
  id?: string;
  sk?: string;
  name: string;
  capacity: number;
  currentOccupancy: number;
  location: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  themeColor?: string; // Hex color assigned to this facility
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
  currentOccupancy?: number; // Enrollment count for this schedule
  level?: string;
}

/**
 * Visual state of a facility card based on selection and date-range utilization
 */
type FacilityCardState = 'deselected' | 'selected-empty' | 'selected-utilized';

/**
 * FacilitiesTab: Visual facility scheduling dashboard with timeline grid
 * 
 * Features:
 * - Facility selection cards with three visual states (deselected, selected-empty, selected-utilized)
 * - Facility-driven color themes (colors stored on Facility, inherited by schedule blocks)
 * - CURRENT-HOUR occupancy display with live temporal binding
 * - Date range picker
 * - Timeline grid (Hours × Dates) with color-coded schedules
 * - Real-time facility and schedule updates
 * - Interactive facility selection
 */
export const FacilitiesTab = () => {
  const { adminSub, loading: adminLoading } = useAdminSub();

  // Facility data
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  // Schedule data
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  // UI State
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>(getMonday(new Date()).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => {
    const end = new Date(getMonday(new Date()));
    end.setDate(end.getDate() + 6);
    return end.toISOString().split('T')[0];
  });

  // Fetch facilities on mount
  useEffect(() => {
    if (!adminSub) return;

    const fetchFacilities = async () => {
      setFacilitiesLoading(true);
      try {
        const facilityData = await DatabaseService.queryFacilitiesForScheduling(adminSub);
        const mapped = Array.isArray(facilityData)
          ? facilityData.map((f) => ({
              facilityId: f.facilityId || f.id || f.sk?.replace('FACILITY#', ''),
              id: f.id,
              sk: f.sk,
              name: f.name || 'Unknown',
              capacity: f.capacity || 0,
              currentOccupancy: f.currentOccupancy || 0,
              location: f.location || '',
              description: f.description || '',
              status: f.status || 'ACTIVE',
              themeColor: f.themeColor, // Assigned facility color
            }))
          : [];
        setFacilities(mapped);
        // Auto-select all facilities on first load
        if (selectedFacilities.length === 0 && mapped.length > 0) {
          setSelectedFacilities(mapped.map((f) => f.facilityId));
        }
      } catch (error) {
        console.error('Error fetching facilities:', error);
        setFacilities([]);
      } finally {
        setFacilitiesLoading(false);
      }
    };

    fetchFacilities();
  }, [adminSub]);

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
            currentOccupancy: item.currentOccupancy || 0, // Enrollment count
            level: item.level || 'Open Level',
          }));
        setSchedules(scheduleList);
        setSchedulesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminSub, startDate, endDate]);

  /**
   * Helper: Get current time in HH:MM format (24-hour)
   */
  const getCurrentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  /**
   * Helper: Compare times in HH:MM format
   * Returns: -1 if time1 < time2, 0 if equal, 1 if time1 > time2
   */
  const compareTime = (time1: string, time2: string): number => {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    const mins1 = h1 * 60 + m1;
    const mins2 = h2 * 60 + m2;
    return mins1 < mins2 ? -1 : mins1 > mins2 ? 1 : 0;
  };

  /**
   * Helper: Check if a schedule is currently ACTIVE
   * (today's date AND currentTime is within [startTime, endTime])
   */
  const isScheduleActive = (schedule: Schedule): boolean => {
    const today = new Date().toISOString().split('T')[0];
    if (schedule.date !== today) return false;

    const currentTime = getCurrentTime();
    return (
      compareTime(currentTime, schedule.startTime) >= 0 &&
      compareTime(currentTime, schedule.endTime) <= 0
    );
  };

  /**
   * Determine the visual state of a facility card
   * - deselected: not selected
   * - selected-empty: selected but no schedules in date range
   * - selected-utilized: selected and has schedules in date range
   */
  const getFacilityCardState = (facilityId: string): FacilityCardState => {
    const isSelected = selectedFacilities.includes(facilityId);
    if (!isSelected) return 'deselected';

    // Check if facility has any schedules in the selected date range
    const hasSchedules = schedules.some((s) => s.facilityId === facilityId);
    return hasSchedules ? 'selected-utilized' : 'selected-empty';
  };

  /**
   * Calculate current-hour occupancy for each facility
   * If an active schedule exists NOW, show its occupancy.
   * Otherwise, show 0.
   */
  const currentHourOccupancy = useMemo(() => {
    const occupancyMap: Record<string, { occupancy: number; capacity: number }> = {};

    facilities.forEach((facility) => {
      occupancyMap[facility.facilityId] = { occupancy: 0, capacity: facility.capacity };
    });

    // Find active schedules and sum their occupancy
    schedules.forEach((schedule) => {
      if (isScheduleActive(schedule) && occupancyMap[schedule.facilityId]) {
        occupancyMap[schedule.facilityId].occupancy += schedule.currentOccupancy || 0;
      }
    });

    return occupancyMap;
  }, [facilities, schedules]);

  /**
   * Get the display color for a facility based on its theme
   * Falls back to default palette if themeColor not set
   */
  const getFacilityColor = (facility: Facility): string => {
    if (facility.themeColor) {
      return facility.themeColor;
    }
    // Fallback to default palette
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = facilities.findIndex((f) => f.facilityId === facility.facilityId);
    return colors[index % colors.length];
  };

  /**
   * Get the CSS opacity and background for a facility card state
   */
  const getFacilityCardStyle = (facility: Facility, state: FacilityCardState) => {
    const color = getFacilityColor(facility);

    if (state === 'deselected') {
      // Deselected: 50% opacity, original color
      return {
        borderColor: color,
        backgroundColor: `${color}15`, // 15% opacity
        opacity: 0.5,
      };
    } else if (state === 'selected-empty') {
      // Selected but empty: Gray (neutral)
      return {
        borderColor: '#999',
        backgroundColor: '#f5f5f5',
      };
    } else {
      // Selected and utilized: Full opacity, original color
      return {
        borderColor: color,
        backgroundColor: `${color}10`, // 10% opacity for subtle background
      };
    }
  };

  /**
   * Get occupancy color based on utilization percentage
   */
  const getOccupancyColor = (percent: number): string => {
    if (percent >= 80) return '#e74c3c';
    if (percent >= 50) return '#f39c12';
    return '#27ae60';
  };

  // Filter schedules by selected facilities
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => selectedFacilities.includes(s.facilityId));
  }, [schedules, selectedFacilities]);

  // Generate date columns
  const dateColumns = useMemo(() => {
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  // Generate time slots (8:00 - 22:00 hourly)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let hour = 8; hour < 22; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
    }
    return slots;
  }, []);

  // Toggle facility selection
  const toggleFacility = (facilityId: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(facilityId) ? prev.filter((id) => id !== facilityId) : [...prev, facilityId]
    );
  };

  // Get schedules for a specific time slot and date
  const getSchedulesForCell = (date: string, timeSlot: string) => {
    const hour = parseInt(timeSlot.split(':')[0]);
    return filteredSchedules.filter(
      (schedule) => schedule.date === date && parseInt(schedule.startTime.split(':')[0]) === hour
    );
  };

  if (adminLoading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>🏛️ FACILITIES & ROOMS</h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <h2 style={{ margin: '0', fontSize: '14px', fontWeight: '700', color: '#2e3b50' }}>
        🏛️ FACILITIES & ROOMS
      </h2>

      {/* Facility Selection Cards */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50', marginBottom: '12px' }}>
          SELECT FACILITIES
        </div>
        {facilitiesLoading ? (
          <div style={{ color: '#999', fontSize: '12px' }}>Loading facilities...</div>
        ) : facilities.length === 0 ? (
          <div style={{ color: '#999', fontSize: '12px' }}>No facilities available</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {facilities.map((facility) => {
              const state = getFacilityCardState(facility.facilityId);
              const cardStyle = getFacilityCardStyle(facility, state);
              const isSelected = selectedFacilities.includes(facility.facilityId);

              // Use current-hour occupancy if available, otherwise 0
              const currentHour = currentHourOccupancy[facility.facilityId];
              const displayOccupancy = currentHour?.occupancy || 0;
              const displayCapacity = currentHour?.capacity || facility.capacity;
              const occupancyPercent = displayCapacity > 0 ? (displayOccupancy / displayCapacity) * 100 : 0;

              return (
                <div
                  key={facility.facilityId}
                  onClick={() => toggleFacility(facility.facilityId)}
                  style={{
                    border: `2px solid ${cardStyle.borderColor}`,
                    borderRadius: '4px',
                    padding: '12px',
                    background: cardStyle.backgroundColor,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                    boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                    opacity: cardStyle.opacity !== undefined ? cardStyle.opacity : 1,
                  }}
                >
                  {/* Selection checkmark */}
                  {isSelected && state !== 'deselected' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: state === 'selected-empty' ? '#666' : getFacilityColor(facility),
                        color: 'white',
                        width: '20px',
                        height: '20px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      ✓
                    </div>
                  )}

                  {/* Facility Name */}
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50', marginBottom: '8px' }}>
                    {facility.name}
                  </div>

                  {/* Details */}
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                    <strong>Location:</strong> {facility.location || 'N/A'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                    <strong>Capacity:</strong> {facility.capacity}
                  </div>

                  {/* Status Message for Empty Cards */}
                  {state === 'selected-empty' && (
                    <div style={{ fontSize: '10px', color: '#999', fontStyle: 'italic', marginBottom: '8px' }}>
                      No activities scheduled
                    </div>
                  )}

                  {/* Occupancy Bar */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                      Occupancy (Now)
                    </div>
                    <div
                      style={{
                        height: '6px',
                        background: '#e0e0e0',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${occupancyPercent}%`,
                          background: getOccupancyColor(occupancyPercent),
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>

                  {/* Occupancy Number */}
                  <div style={{ fontSize: '10px', color: state === 'selected-empty' ? '#999' : '#1a1a1a', fontWeight: '500' }}>
                    {displayOccupancy} / {displayCapacity} people
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date Range Picker */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50' }}>From:</label>
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
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#2e3b50' }}>To:</label>
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
      </div>

      {/* Timeline Grid */}
      <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: '4px', background: 'white' }}>
        <table className="timeline-grid-table">
          <thead>
            <tr>
              <th style={{ width: '80px', minWidth: '80px' }}>Time</th>
              {dateColumns.map((date) => (
                <th
                  key={date}
                  style={{
                    minWidth: '150px',
                    padding: '8px 4px',
                    textAlign: 'center',
                    borderRight: '1px solid #e0e0e0',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#2e3b50' }}>
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedulesLoading ? (
              <tr>
                <td colSpan={dateColumns.length + 1} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                  Loading schedules...
                </td>
              </tr>
            ) : timeSlots.map((timeSlot) => (
              <tr key={timeSlot}>
                <td
                  style={{
                    padding: '12px 8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#2e3b50',
                    background: '#f9f9f9',
                    borderRight: '1px solid #e0e0e0',
                  }}
                >
                  {timeSlot}
                </td>
                {dateColumns.map((date) => {
                  const cellSchedules = getSchedulesForCell(date, timeSlot);
                  return (
                    <td
                      key={`${date}-${timeSlot}`}
                      style={{
                        minWidth: '150px',
                        padding: '8px 4px',
                        borderRight: '1px solid #e0e0e0',
                        borderBottom: '1px solid #e0e0e0',
                        background: '#fafafa',
                        verticalAlign: 'top',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {cellSchedules.map((schedule) => {
                          // Get the facility's theme color
                          const facility = facilities.find((f) => f.facilityId === schedule.facilityId);
                          const blockColor = facility ? getFacilityColor(facility) : '#999';

                          return (
                            <div
                              key={schedule.scheduleId}
                              style={{
                                background: blockColor,
                                color: 'white',
                                padding: '6px 8px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: '500',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                              }}
                            >
                              <div style={{ fontWeight: '600' }}>{schedule.activityType}</div>
                              <div style={{ fontSize: '10px', opacity: 0.9 }}>
                                {schedule.startTime} - {schedule.endTime}
                              </div>
                              <div style={{ fontSize: '10px', opacity: 0.85 }}>
                                {schedule.currentOccupancy || 0} / {schedule.capacity}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {selectedFacilities.length === 0 && (
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
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>No facilities selected</div>
          <div style={{ fontSize: '12px' }}>Select at least one facility above to view the schedule timeline</div>
        </div>
      )}
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
