import { useState, useEffect } from 'react';
import type { Member } from '../../lib/models';
import './MemberCrudModal.css';

// E.164 phone validation regex: +1-5550001 to +999999999999999
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

export interface MemberCrudModalProps {
  isOpen: boolean;
  member: Member | null;
  onClose: () => void;
  onSave: (member: Partial<Member>) => Promise<void>;
  error?: string | null;
}

/**
 * MemberCrudModal: Modal for creating/editing members
 * 
 * STD Compliance:
 * - Phone is the sort key (MEMBER#{phone}) and cannot be mutated after creation
 * - Phone field is disabled in edit mode
 * - Phone validation enforces E.164 format to prevent SK corruption
 * - All submissions route via DatabaseService wrapper functions
 * - NO DELETE button (members cannot be deleted, use INACTIVE status instead)
 */
export const MemberCrudModal = ({
  isOpen,
  member,
  onClose,
  onSave,
  error: externalError,
}: MemberCrudModalProps) => {
  const [formData, setFormData] = useState<Partial<Member>>({
    name: '',
    phone: '',
    tier: 'STANDARD',
    status: 'ACTIVE',
    email: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Update form data when member prop changes (for edit mode)
  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name || '',
        phone: member.phone || '',
        tier: member.tier || 'STANDARD',
        status: member.status || 'ACTIVE',
        email: member.email || '',
      });
    } else {
      // Reset for add mode
      setFormData({
        name: '',
        phone: '',
        tier: 'STANDARD',
        status: 'ACTIVE',
        email: '',
      });
    }
    setError(null);
    setPhoneError(null);
  }, [member]);

  // Update error when external error changes
  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  if (!isOpen) return null;

  const isEditMode = !!member;
  const title = isEditMode ? 'Edit Member' : 'Add New Member';

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement
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
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await onSave(formData);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      phone: '',
      tier: 'STANDARD',
      status: 'ACTIVE',
      email: '',
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
              placeholder="Member name"
              disabled={saving}
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
              disabled={isEditMode || saving}
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
            {phoneError && (
              <div id="phone-error" className="form-error">{phoneError}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
              placeholder="member@example.com"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="tier">Tier</label>
            <select
              id="tier"
              name="tier"
              value={formData.tier || 'STANDARD'}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="STANDARD">Standard</option>
              <option value="SILVER">Silver</option>
              <option value="GOLD">Gold</option>
              <option value="PLATINUM">Platinum</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status || 'ACTIVE'}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <p className="field-hint">
              💡 To remove a member, set status to Inactive
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-secondary"
            onClick={handleClose}
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
};
