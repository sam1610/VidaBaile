import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import DatabaseService from '../../services/DatabaseService';
import '../common/Modal.css';

interface Coach {
  phone: string;
  name: string;
}

interface Facility {
  facilityId: string;
  name: string;
  capacity?: number;
  sk?: string;
  id?: string;
}

interface Member {
  phone: string;
  name: string;
  tier?: string;
}

interface ActivityFormData {
  date: string;
  startTime: string;
  endTime: string;
  coachPhone: string;
  facilityId: string;
  level: string;
  capacity: number;
  activityType: string;
  currentOccupancy?: number;
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
  name?: string;
  level?: string;
}

interface ActivityCrudModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ActivityFormData, scheduleId: string, isEdit: boolean) => Promise<void>;
  adminSub: string;
  isLoading?: boolean;
  activity?: Schedule | null;
  facilities?: Facility[];
}

const ACTIVITY_LEVELS = ['Open Level', 'Beginner', 'Intermediate', 'Advanced'];

export function ActivityCrudModal({
  isOpen,
  onClose,
  onSubmit,
  adminSub,
  isLoading = false,
  activity = null,
  facilities = [],
}: ActivityCrudModalProps) {
  const isEditMode = !!activity;
  const [activeTab, setActiveTab] = useState<'activity' | 'enrollment'>('activity');

  // Form state
  const [formData, setFormData] = useState<ActivityFormData>({
    date: new Date().toISOString().split('T')[0],
    startTime: '18:00',
    endTime: '19:30',
    coachPhone: '',
    facilityId: '',
    level: 'Open Level',
    capacity: 45,
    activityType: '',
    currentOccupancy: 0,
  });

  // Dropdown data
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // Enrollment state
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [originalMembers, setOriginalMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // Hydrate form with activity data and load existing members
  useEffect(() => {
    if (isOpen && isEditMode && activity) {
      console.log('[ActivityCrudModal] Loading activity for edit:', activity);
      setFormData({
        date: activity.date || '',
        startTime: activity.startTime || '18:00',
        endTime: activity.endTime || '19:30',
        coachPhone: activity.coachPhone || '',
        facilityId: activity.facilityId || '',
        level: activity.level || 'Open Level',
        capacity: activity.capacity || 45,
        activityType: activity.activityType || '',
      });
      setErrors({});
      setActiveTab('activity');

      // Load existing members for this schedule
      loadExistingMembers();
    } else if (isOpen && !isEditMode) {
      console.log('[ActivityCrudModal] Modal opened in create mode');
      setFormData({
        date: new Date().toISOString().split('T')[0],
        startTime: '18:00',
        endTime: '19:30',
        coachPhone: '',
        facilityId: '',
        level: 'Open Level',
        capacity: 45,
        activityType: '',
      });
      setSelectedMembers([]);
      setOriginalMembers([]);
      setErrors({});
      setActiveTab('activity');
    }
  }, [isOpen, isEditMode, activity]);

  // Load existing members for the schedule
  const loadExistingMembers = async () => {
    if (!isEditMode || !activity) return;

    try {
      const bookings = await DatabaseService.queryBookingsBySchedule(adminSub, activity.scheduleId);
      const memberPhones = bookings
        .filter((b) => b.phone)
        .map((b) => b.phone);
      setSelectedMembers(memberPhones);
      setOriginalMembers(memberPhones);
      console.log('[ActivityCrudModal] Loaded existing members:', memberPhones.length, 'members:', memberPhones);
    } catch (error) {
      console.error('[ActivityCrudModal] Failed to load existing members:', error);
    }
  };

  // Fetch coaches, facilities, and members on modal open
  useEffect(() => {
    if (!isOpen || !adminSub) return;

    const fetchDropdownData = async () => {
      setDataLoading(true);
      try {
        const [coachesData, membersData] = await Promise.all([
          DatabaseService.queryCoachesForScheduling(adminSub),
          DatabaseService.queryActiveMembersRecord(adminSub),
        ]);

        const coachList = Array.isArray(coachesData)
          ? coachesData.map((c) => ({ phone: c.phone || '', name: c.name || '' }))
          : [];

        const memberList = Array.isArray(membersData)
          ? membersData.map((m) => ({ phone: m.phone || '', name: m.name || '', tier: m.tier || 'STANDARD' }))
          : [];

        setCoaches(coachList);
        setMembers(memberList);
        console.log('[ActivityCrudModal] Loaded coaches:', coachList.length, 'members:', memberList.length);
        console.log('[ActivityCrudModal] Member tier data:', memberList.map(m => ({ name: m.name, tier: m.tier })));
      } catch (error) {
        console.error('Error fetching data:', error);
        setErrors({ load: 'Failed to load coaches and members' });
      } finally {
        setDataLoading(false);
      }
    };

    fetchDropdownData();
  }, [isOpen, adminSub]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.activityType.trim()) {
      newErrors.activityType = 'Activity name is required';
    }
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }
    if (!formData.startTime) {
      newErrors.startTime = 'Start time is required';
    }
    if (!formData.endTime) {
      newErrors.endTime = 'End time is required';
    }
    if (formData.startTime >= formData.endTime) {
      newErrors.endTime = 'End time must be after start time';
    }
    if (!formData.coachPhone?.trim()) {
      newErrors.coachPhone = 'Trainer selection is required';
    }
    if (!formData.facilityId?.trim()) {
      newErrors.facilityId = 'Location/Facility selection is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'capacity' ? parseInt(value) || 0 : value,
    });

    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleMemberToggle = (memberPhone: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberPhone)
        ? prev.filter((p) => p !== memberPhone)
        : [...prev, memberPhone]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      console.warn('Form validation failed');
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Create or update schedule
      const scheduleId = isEditMode ? activity!.scheduleId : nanoid();
      
      // Get selected facility to enforce true capacity
      console.log('[ActivityCrudModal] Facilities available:', facilities.map(f => ({ facilityId: f.facilityId, name: f.name, capacity: f.capacity, sk: f.sk })));
      console.log('[ActivityCrudModal] Looking for facilityId:', formData.facilityId);
      
      const selectedFacility = facilities.find((f) => {
        const formId = formData.facilityId?.replace('FACILITY#', '');
        const dbId = f.facilityId || f.sk?.replace('FACILITY#', '');
        console.log('[ActivityCrudModal] Comparing formId:', formId, 'with dbId:', dbId, 'facility name:', f.name);
        return formId === dbId;
      });
      
      const trueCapacity = selectedFacility?.capacity || 0;
      console.log('[ActivityCrudModal] Selected facility:', selectedFacility?.name, 'with capacity:', trueCapacity);
      
      // Add current occupancy count and enforce facility capacity
      const schedulePayload = {
        ...formData,
        capacity: trueCapacity,
        currentOccupancy: selectedMembers.length,
      };
      
      console.log('[ActivityCrudModal] Schedule payload capacity enforced from facility:', trueCapacity);
      console.log('[ActivityCrudModal] FINAL SCHEDULE PAYLOAD BEFORE SUBMIT:', {
        capacity: schedulePayload.capacity,
        currentOccupancy: schedulePayload.currentOccupancy,
        selectedMembers: selectedMembers.length,
        schedulePayload
      });
      await onSubmit(schedulePayload, scheduleId, isEditMode);

      // Step 2: Calculate membership changes
      const membersToAdd = selectedMembers.filter((p) => !originalMembers.includes(p));
      const membersToRemove = originalMembers.filter((p) => !selectedMembers.includes(p));

      console.log('[ActivityCrudModal] Members to add:', membersToAdd);
      console.log('[ActivityCrudModal] Members to remove:', membersToRemove);

      // Step 3: Batch mutations
      const addPromises = membersToAdd.map((memberPhone) =>
        DatabaseService.createBookingRecord(adminSub, nanoid(), memberPhone, {
          scheduleId,
          coachPhone: formData.coachPhone,
          bookedAt: new Date().toISOString(),
          // Denormalize schedule data for fast lookups in enrollments modal (use schema field names)
          activityType: formData.activityType,
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
        })
      );

      const removePromises = membersToRemove.map((memberPhone) => {
        // Find the booking ID for this member/schedule combination
        // For now, we'll need to use a queryBookingsByMember approach or construct from data
        // Since we don't have bookingId readily available, we'll query existing bookings
        return DatabaseService.deleteBookingRecord(adminSub, nanoid(), memberPhone, scheduleId);
      });

      // Wait for all booking mutations
      if (addPromises.length > 0 || removePromises.length > 0) {
        await Promise.all([...addPromises, ...removePromises]);
        console.log('[ActivityCrudModal] Batched enrollment mutations completed');
      }

      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save activity' });
    } finally {
      setIsSubmitting(false);
    }
  };


/**
 * Tier Icon Mapping
 * Maps member tier to visual icon representation
 */
const getTierIcon = (tier?: string) => {
  const iconProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    style: { cursor: 'help' },
  };

  switch (tier?.toUpperCase()) {
    case 'SILVER':
      return (
        <div title={tier} style={{ display: 'inline-flex', color: '#999' }}>
          <svg {...iconProps}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </div>
      );
    case 'GOLD':
      return (
        <div title={tier} style={{ display: 'inline-flex', color: '#f59e0b' }}>
          <svg {...iconProps}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      );
    case 'PLATINUM':
      return (
        <div title={tier} style={{ display: 'inline-flex', color: '#3b82f6' }}>
          <svg {...iconProps}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </div>
      );
    case 'VIP':
      return (
        <div title={tier} style={{ display: 'inline-flex', color: '#a855f7' }}>
          <svg {...iconProps}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      );
    default:
      return (
        <div
          title={tier || 'Unknown'}
          style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            background: '#e5e7eb',
            borderRadius: '2px',
            cursor: 'help',
          }}
        />
      );
  }
};

  if (!isOpen) {
    return null;
  }

  // Get selected facility for capacity enforcement and display
  const selectedFacility = facilities.find((f) => {
    const formId = formData.facilityId?.replace('FACILITY#', '');
    const dbId = f.facilityId || f.sk?.replace('FACILITY#', '');
    return formId === dbId;
  });
  
  console.log('[ActivityCrudModal Render] selectedFacility:', selectedFacility?.name, 'capacity:', selectedFacility?.capacity, 'selectedMembers:', selectedMembers.length);

  // Filter members by search term
  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>{isEditMode ? 'Edit Activity' : 'Create New Activity'}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '0' }}>
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: activeTab === 'activity' ? '#2e3b50' : '#f5f5f5',
              color: activeTab === 'activity' ? 'white' : '#666',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              borderRadius: activeTab === 'activity' ? '8px 0 0 0' : '0',
              transition: 'all 0.2s ease',
            }}
          >
            Activity Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('enrollment')}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: activeTab === 'enrollment' ? '#2e3b50' : '#f5f5f5',
              color: activeTab === 'enrollment' ? 'white' : '#666',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              borderRadius: activeTab === 'enrollment' ? '0 8px 0 0' : '0',
              transition: 'all 0.2s ease',
            }}
          >
            Members Enrollment ({selectedMembers.length})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form" style={{ marginTop: "16px" }}>
          {dataLoading && (
            <div style={{ padding: '12px', background: '#e3f2fd', borderRadius: '4px', fontSize: '12px', color: '#1976d2', marginBottom: '12px' }}>
              Loading data...
            </div>
          )}

          {/* TAB 1: ACTIVITY */}
          {activeTab === 'activity' && (
            <>
              {/* Activity Name */}
              <div className="form-group">
                <label htmlFor="activityType">Activity Name *</label>
                <input
                  id="activityType"
                  type="text"
                  name="activityType"
                  value={formData.activityType}
                  onChange={handleChange}
                  placeholder='e.g., "Cuban Salsa"'
                  disabled={isLoading || isSubmitting || dataLoading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    minHeight: '40px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#2196F3';
                    e.target.style.boxShadow = '0 0 0 3px rgba(33, 150, 243, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#ddd';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {errors.activityType && <span className="form-error">{errors.activityType}</span>}
              </div>

              {/* Date & Time Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label htmlFor="date">Date *</label>
                  <input
                    id="date"
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    disabled={isLoading || isSubmitting || dataLoading}
                  />
                  {errors.date && <span className="form-error">{errors.date}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="startTime">Start Time *</label>
                  <input
                    id="startTime"
                    type="time"
                    name="startTime"
                    value={formData.startTime}
                    onChange={handleChange}
                    disabled={isLoading || isSubmitting || dataLoading}
                  />
                  {errors.startTime && <span className="form-error">{errors.startTime}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="endTime">End Time *</label>
                  <input
                    id="endTime"
                    type="time"
                    name="endTime"
                    value={formData.endTime}
                    onChange={handleChange}
                    disabled={isLoading || isSubmitting || dataLoading}
                  />
                  {errors.endTime && <span className="form-error">{errors.endTime}</span>}
                </div>
              </div>

              {/* Trainer Dropdown */}
              <div className="form-group">
                <label htmlFor="coachPhone">Trainer (Coach) *</label>
                <select
                  id="coachPhone"
                  name="coachPhone"
                  value={formData.coachPhone}
                  onChange={handleChange}
                  disabled={isLoading || isSubmitting || dataLoading}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    minHeight: '40px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <option value="" disabled>
                    -- Select a trainer --
                  </option>
                  {coaches.map((coach) => (
                    <option key={coach.phone} value={coach.phone}>
                      {coach.name}
                    </option>
                  ))}
                </select>
                {errors.coachPhone && <span className="form-error">{errors.coachPhone}</span>}
              </div>

              {/* Facility Dropdown */}
              <div className="form-group">
                <label htmlFor="facilityId">Location / Facility *</label>
                <select
                  id="facilityId"
                  name="facilityId"
                  value={formData.facilityId}
                  onChange={handleChange}
                  disabled={isLoading || isSubmitting || dataLoading}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    minHeight: '40px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <option value="" disabled>
                    -- Select a facility --
                  </option>
                  {facilities.map((facility) => (
                    <option key={facility.facilityId} value={facility.facilityId}>
                      {facility.name}
                    </option>
                  ))}
                </select>
                {errors.facilityId && <span className="form-error">{errors.facilityId}</span>}
              </div>

              {/* Level & Capacity Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label htmlFor="level">Level *</label>
                  <select
                    id="level"
                    name="level"
                    value={formData.level}
                    onChange={handleChange}
                    disabled={isLoading || isSubmitting || dataLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      minHeight: '40px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {ACTIVITY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Members Selected / Facility Capacity</label>
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#2e3b50',
                      border: '1px solid #ddd',
                      minHeight: '40px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {selectedMembers.length} / {selectedFacility?.capacity || '?'}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: MEMBERS ENROLLMENT */}
          {activeTab === 'enrollment' && (
            <>
              {/* Search Bar */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label htmlFor="memberSearch">Search Members</label>
                <input
                  id="memberSearch"
                  type="text"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={isLoading || isSubmitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    minHeight: '40px',
                  }}
                />
              </div>

              {/* Members Table */}
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd', width: '40px' }}>
                        ✓
                      </th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        Name
                      </th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        Phone
                      </th>

                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '60px' }}>
                        Tier
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                          No members found
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((member) => (
                        <tr key={member.phone} style={{ borderBottom: '1px solid #f0f0f0', background: selectedMembers.includes(member.phone) ? '#f0f8ff' : 'white' }}>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedMembers.includes(member.phone)}
                              onChange={() => handleMemberToggle(member.phone)}
                              disabled={isLoading || isSubmitting}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>
                            <strong>{member.name}</strong>
                          </td>
                          <td style={{ padding: '10px', color: '#666', fontSize: '11px' }}>
                            {member.phone}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: '600' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              {getTierIcon(member.tier)}
                              <span style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                                {member.tier || 'STANDARD'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
              </div>
            </>
          )}

          {/* Errors */}
          {errors.submit && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', padding: '8px', fontSize: '12px', color: '#721c24', marginTop: '12px' }}>
              {errors.submit}
            </div>
          )}
          {errors.load && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', padding: '8px', fontSize: '12px', color: '#721c24', marginTop: '12px' }}>
              {errors.load}
            </div>
          )}

          {/* Action Buttons - Only visible on Activity Details tab */}
          {activeTab === 'activity' && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading || isSubmitting || dataLoading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#e8e8e8',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  cursor: isLoading || isSubmitting || dataLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  opacity: isLoading || isSubmitting || dataLoading ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !isSubmitting && !dataLoading) {
                    e.currentTarget.style.background = '#d8d8d8';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#e8e8e8';
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || isSubmitting || dataLoading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#2e3b50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading || isSubmitting || dataLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  opacity: isLoading || isSubmitting || dataLoading ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !isSubmitting && !dataLoading) {
                    e.currentTarget.style.background = '#1e2836';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2e3b50';
                }}
              >
                {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
