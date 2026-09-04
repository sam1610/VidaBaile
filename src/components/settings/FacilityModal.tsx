import { useState, useEffect } from 'react';
import { createFacilityRecord, updateFacilityRecord } from '../../services/DatabaseService';
import type { Facility } from '../../lib/models';
import { nanoid } from 'nanoid';
import './FacilityModal.css';

interface FacilityModalProps {
  isOpen: boolean;
  facility: Facility | null;
  onClose: () => void;
  adminSub: string;
}

/**
 * FacilityModal: Create/Edit facility form
 */
export function FacilityModal({ isOpen, facility, onClose, adminSub }: FacilityModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    capacity: 20,
    location: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE',
    currentOccupancy: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (facility) {
      setFormData({
        name: facility.name || '',
        capacity: facility.capacity || 20,
        location: facility.location || '',
        description: facility.description || '',
        status: (facility.status || 'ACTIVE') as any,
        currentOccupancy: facility.currentOccupancy || 0,
      });
    } else {
      setFormData({
        name: '',
        capacity: 20,
        location: '',
        description: '',
        status: 'ACTIVE',
        currentOccupancy: 0,
      });
    }
    setError(null);
  }, [facility]);

  if (!isOpen) return null;

  const isEdit = !!facility;
  const title = isEdit ? 'Edit Facility' : 'Add New Facility';

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'capacity' || name === 'currentOccupancy' 
        ? parseInt(value) || 0 
        : value,
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Facility name is required');
      return false;
    }
    if (formData.capacity < 1) {
      setError('Capacity must be at least 1');
      return false;
    }
    if (!formData.location.trim()) {
      setError('Location is required');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (isEdit && facility) {
        // Update existing facility
        const facilityId = facility.sk?.replace('FACILITY#', '');
        if (facilityId) {
          await updateFacilityRecord(adminSub, facilityId, formData);
        }
      } else {
        // Create new facility
        const facilityId = nanoid();
        await createFacilityRecord(adminSub, {
          facilityId,
          name: formData.name,
          capacity: formData.capacity,
          location: formData.location,
          description: formData.description,
          status: formData.status,
          currentOccupancy: formData.currentOccupancy,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save facility');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="name">Facility Name *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., La Vida Hall"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="capacity">Capacity (people) *</label>
            <input
              id="capacity"
              type="number"
              name="capacity"
              value={formData.capacity}
              onChange={handleChange}
              min="1"
              max="1000"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="location">Location *</label>
            <input
              id="location"
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Downtown Studio, 3rd Floor"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="e.g., Main dance floor with professional sound system"
              rows={3}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Under Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="currentOccupancy">Current Occupancy</label>
            <input
              id="currentOccupancy"
              type="number"
              name="currentOccupancy"
              value={formData.currentOccupancy}
              onChange={handleChange}
              min="0"
              max={formData.capacity}
              disabled={saving}
            />
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
