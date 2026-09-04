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
  activity?: Schedule | null; // For edit mode
}

const ACTIVITY_LEVELS = ['Open Level', 'Beginner', 'Intermediate', 'Advanced'];

export function ActivityCrudModal({
  isOpen,
  onClose,
  onSubmit,
  adminSub,
  isLoading = false,
  activity = null,
}: ActivityCrudModalProps) {
  const isEditMode = !!activity;

  const [formData, setFormData] = useState<ActivityFormData>({
    date: new Date().toISOString().split('T')[0],
    startTime: '18:00',
    endTime: '19:30',
    coachPhone: '',
    facilityId: '',
    level: 'Open Level',
    capacity: 45,
    activityType: '',
  });

  // Initialize as empty arrays (NOT null)
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // Hydrate form with activity data when in edit mode
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
    } else if (isOpen && !isEditMode) {
      // Reset form for create mode
      console.log('[ActivityCrudModal] Modal opened in create mode, resetting form');
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
      setErrors({});
    }
  }, [isOpen, isEditMode, activity]);

  // Fetch coaches and facilities on modal open
  useEffect(() => {
    if (!isOpen || !adminSub) return;

    const fetchDropdownData = async () => {
      setDataLoading(true);
      try {
        const [coachesData, facilitiesData] = await Promise.all([
          DatabaseService.queryCoachesForScheduling(adminSub),
          DatabaseService.queryFacilitiesForScheduling(adminSub),
        ]);

        console.log('[ActivityCrudModal] Raw coaches data:', coachesData);
        console.log('[ActivityCrudModal] Raw facilities data:', facilitiesData);

        const coachList = Array.isArray(coachesData)
          ? coachesData.map((c) => ({ phone: c.phone || '', name: c.name || '' }))
          : [];

        const facilityList = Array.isArray(facilitiesData)
          ? facilitiesData
              .filter((f) => f.entityType === 'FACILITY')
              .map((f) => {
                const fId = f.facilityId || (f.sk ? f.sk.replace(/^FACILITY#/, '') : '');
                return {
                  facilityId: fId,
                  name: f.name || f.location || 'Unnamed Facility',
                };
              })
          : [];

        console.log('[ActivityCrudModal] Parsed coaches list:', coachList);
        console.log('[ActivityCrudModal] Parsed facilities list:', facilityList);

        setCoaches(coachList);
        setFacilities(facilityList);
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
        setErrors({ load: 'Failed to load coaches and facilities' });
        setCoaches([]);
        setFacilities([]);
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
    if (!formData.coachPhone || formData.coachPhone.trim() === '') {
      newErrors.coachPhone = 'Trainer selection is required';
    }
    if (!formData.facilityId || formData.facilityId.trim() === '') {
      newErrors.facilityId = 'Location/Facility selection is required';
    }
    if (formData.capacity <= 0) {
      newErrors.capacity = 'Capacity must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'facilityId') {
      console.log('[ActivityCrudModal] Facility dropdown changed:', { name, value });
    }

    setFormData({
      ...formData,
      [name]: name === 'capacity' ? parseInt(value) || 0 : value,
    });

    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      console.warn('Form validation failed. Errors:', errors);
      return;
    }

    if (!formData.coachPhone?.trim()) {
      alert('Please select a Trainer from the dropdown.');
      return;
    }
    if (!formData.facilityId?.trim()) {
      alert('Please select a Location/Facility from the dropdown.');
      return;
    }
    if (!formData.date || !formData.startTime || !formData.endTime) {
      alert('Please fill in all required date and time fields.');
      return;
    }

    console.log('[ActivityCrudModal] Submitting with:', formData, 'Edit mode:', isEditMode);

    setIsSubmitting(true);
    try {
      const scheduleId = isEditMode ? activity!.scheduleId : nanoid();
      await onSubmit(formData, scheduleId, isEditMode);
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save activity' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditMode ? 'Edit Activity' : 'Create New Activity'}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {dataLoading && (
            <div style={{ padding: '12px', background: '#e3f2fd', borderRadius: '4px', fontSize: '12px', color: '#1976d2' }}>
              Loading coaches and facilities...
            </div>
          )}

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
            >
              <option value="" disabled>
                -- Select a trainer --
              </option>

              {coaches.length > 0 ? (
                coaches.map((coach, idx) => (
                  <option key={coach.phone || `coach-${idx}`} value={coach.phone}>
                    {coach.name}
                  </option>
                ))
              ) : (
                dataLoading && <option disabled>Loading...</option>
              )}
            </select>
            {errors.coachPhone && <span className="form-error">{errors.coachPhone}</span>}
            {!dataLoading && coaches.length === 0 && (
              <span style={{ fontSize: '11px', color: '#e74c3c' }}>
                No active coaches available. Create coaches in Settings first.
              </span>
            )}
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
            >
              <option value="" disabled>
                -- Select a facility --
              </option>

              {facilities.length > 0 ? (
                facilities.map((facility, idx) => {
                  console.log(`[ActivityCrudModal] Rendering facility option:`, facility);
                  return (
                    <option
                      key={facility.facilityId || `facility-${idx}`}
                      value={facility.facilityId}
                    >
                      {facility.name}
                    </option>
                  );
                })
              ) : (
                dataLoading && <option disabled>Loading...</option>
              )}
            </select>
            {errors.facilityId && <span className="form-error">{errors.facilityId}</span>}
            {!dataLoading && facilities.length === 0 && (
              <span style={{ fontSize: '11px', color: '#e74c3c' }}>
                No facilities available. Create facilities in Settings first.
              </span>
            )}
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
              >
                {ACTIVITY_LEVELS.map((level, idx) => (
                  <option key={`level-${idx}`} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="capacity">Capacity *</label>
              <input
                id="capacity"
                type="number"
                name="capacity"
                value={formData.capacity}
                onChange={handleChange}
                min="1"
                max="200"
                disabled={isLoading || isSubmitting || dataLoading}
              />
              {errors.capacity && <span className="form-error">{errors.capacity}</span>}
            </div>
          </div>

          {/* Activity Type / Description */}
          <div className="form-group">
            <label htmlFor="activityType">Activity Type / Description</label>
            <input
              id="activityType"
              type="text"
              name="activityType"
              value={formData.activityType}
              onChange={handleChange}
              placeholder='e.g., "Salsa Basics", "Partner Work"'
              disabled={isLoading || isSubmitting || dataLoading}
            />
          </div>

          {/* Errors */}
          {errors.submit && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', padding: '8px', fontSize: '12px', color: '#721c24' }}>
              {errors.submit}
            </div>
          )}
          {errors.load && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', padding: '8px', fontSize: '12px', color: '#721c24' }}>
              {errors.load}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || isSubmitting || dataLoading}
              style={{
                flex: 1,
                padding: '10px',
                background: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isSubmitting || dataLoading}
              style={{
                flex: 1,
                padding: '10px',
                background: '#2e3b50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12px',
                opacity: isLoading || isSubmitting || dataLoading ? 0.6 : 1,
              }}
            >
              {isSubmitting ? (isEditMode ? 'Saving Changes...' : 'Creating Activity...') : (isEditMode ? 'Save Changes' : 'Create Activity')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
