import { useState, useEffect } from 'react';
import type { Coach } from '../../lib/models';
import './CoachCrudModal.css';

// E.164 phone validation regex: +1-5550001 to +999999999999999
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

export interface CoachCrudModalProps {
  isOpen: boolean;
  coach: Coach | null;
  onClose: () => void;
  onSave: (coach: Partial<Coach>) => Promise<void>;
  onDelete: (coach: Coach) => Promise<void>;
  error?: string | null;
}

/**
 * CoachCrudModal: Modal for creating/editing coaches
 * 
 * STD Compliance:
 * - Phone is the sort key (COACH#{phone}) and cannot be mutated after creation
 * - Phone field is disabled in edit mode
 * - Phone validation enforces E.164 format to prevent SK corruption
 * - All submissions route via DatabaseService wrapper functions
 */
export const CoachCrudModal = ({
  isOpen,
  coach,
  onClose,
  onSave,
  onDelete,
  error: externalError,
}: CoachCrudModalProps) => {
  const [formData, setFormData] = useState<Partial<Coach>>({
    name: '',
    phone: '',
    specialty: '',
    email: '',
    bio: '',
    status: 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Update form data when coach prop changes (for edit mode)
  useEffect(() => {
    if (coach) {
      setFormData({
        name: coach.name || '',
        phone: coach.phone || '',
        specialty: coach.specialty || '',
        email: coach.email || '',
        bio: coach.bio || '',
        status: coach.status || 'ACTIVE',
      });
    } else {
      // Reset for add mode
      setFormData({
        name: '',
        phone: '',
        specialty: '',
        email: '',
        bio: '',
        status: 'ACTIVE',
      });
    }
    setError(null);
    setPhoneError(null);
  }, [coach]);

  // Update error when external error changes
  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  if (!isOpen) return null;

  const isEditMode = !!coach;
  const title = isEditMode ? 'Edit Coach' : 'Add New Coach';

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    
    // Validate phone in real-time when user types
    if (name === 'phone') {
      if (value && !PHONE_REGEX.test(value)) {
        setPhoneError('Phone must be in E.164 format (e.g., +1-555-0001)');
      } else {
        setPhoneError(null);
      }
    }
    
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateForm = () => {
    if (!formData.name?.trim()) {
      setError('Name is required');
      return false;
    }
    if (!formData.phone?.trim()) {
      setError('Phone is required');
      return false;
    }
    // Hard-block submission for invalid phone format
    if (!PHONE_REGEX.test(formData.phone)) {
      setError('Phone must be in E.164 format (e.g., +1-555-0001)');
      setPhoneError('Phone must be in E.164 format (e.g., +1-555-0001)');
      return false;
    }
    if (!formData.specialty?.trim()) {
      setError('Specialty is required');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await onSave(formData);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save coach');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!coach) return;
    if (!window.confirm('Are you sure you want to delete this coach?')) return;

    setDeleting(true);
    try {
      await onDelete(coach);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete coach');
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      phone: '',
      specialty: '',
      email: '',
      bio: '',
      status: 'ACTIVE',
    });
    setError(null);
    setPhoneError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name || ''}
              onChange={handleChange}
              placeholder="Coach name"
              disabled={saving || deleting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">
              Phone * {isEditMode && <span className="field-note">(Cannot be changed)</span>}
            </label>
            <input
              id="phone"
              type="tel"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              placeholder="+1-555-0001"
              disabled={isEditMode || saving || deleting}
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
            {phoneError && (
              <div id="phone-error" className="form-error">{phoneError}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="specialty">Specialty *</label>
            <input
              id="specialty"
              type="text"
              name="specialty"
              value={formData.specialty || ''}
              onChange={handleChange}
              placeholder="e.g., Salsa Gold, Bachata"
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
              placeholder="coach@example.com"
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio || ''}
              onChange={handleChange}
              placeholder="Brief biography"
              rows={3}
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status || 'ACTIVE'}
              onChange={handleChange}
              disabled={saving || deleting}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          {isEditMode && (
            <button
              className="btn btn-danger"
              onClick={handleDeleteClick}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting...' : '🗑️ Delete'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={saving || deleting}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || deleting}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
