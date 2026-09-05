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
}

/**
 * FacilitiesTab: Visual facility scheduling dashboard with timeline grid
 * 
 * Features:
 * - Facility selection cards with occupancy display
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
            level: item.level || 'Open Level',
          }));
        setSchedules(scheduleList);
        setSchedulesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminSub, startDate, endDate]);

  // Assign colors to facilities
  const facilityColorMap = useMemo(() => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const map: Record<string, string> = {};
    facilities.forEach((facility, index) => {
      map[facility.facilityId] = colors[index % colors.length];
    });
    return map;
  }, [facilities]);

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

  // Get occupancy color
  const getOccupancyColor = (percent: number) => {
    if (percent >= 80) return '#e74c3c';
    if (percent >= 50) return '#f39c12';
    return '#27ae60';
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
              const isSelected = selectedFacilities.includes(facility.facilityId);
              const occupancyPercent =
                facility.capacity > 0 ? (facility.currentOccupancy / facility.capacity) * 100 : 0;

              return (
                <div
                  key={facility.facilityId}
                  onClick={() => toggleFacility(facility.facilityId)}
                  style={{
                    border: isSelected ? '2px solid #2196F3' : '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '12px',
                    background: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                    boxShadow: isSelected ? '0 2px 8px rgba(33, 150, 243, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  {/* Selection checkmark */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#2196F3',
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

                  {/* Occupancy Bar */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Occupancy</div>
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
                  <div style={{ fontSize: '10px', color: '#1a1a1a', fontWeight: '500' }}>
                    {facility.currentOccupancy} / {facility.capacity} people
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
                        {cellSchedules.map((schedule) => (
                          <div
                            key={schedule.scheduleId}
                            style={{
                              background: facilityColorMap[schedule.facilityId],
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
                              0 / {schedule.capacity}
                            </div>
                          </div>
                        ))}
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
