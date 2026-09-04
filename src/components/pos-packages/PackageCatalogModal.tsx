import { useState, useEffect } from 'react';
import '../common/Modal.css';

interface CatalogTemplate {
  packageId?: string;
  name: string;
  totalCredits: number;
  price: number;
  validFrom: string;
  validUntil: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  description?: string;
}

interface CatalogSubmitData {
  name: string;
  totalCredits: number;
  price: number;
  validFrom: string;
  validUntil: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  description?: string;
}

interface PackageCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CatalogSubmitData, packageId?: string) => Promise<void>;
  initialData?: CatalogTemplate;
  isLoading?: boolean;
}

/**
 * PackageCatalogModal: Form for creating/editing package templates
 * 
 * Features:
 * - Create new CATALOG entities
 * - Edit existing catalogs
 * - Real-time form validation
 * - Currency formatting
 * - Status tracking (ACTIVE, INACTIVE, DEPRECATED)
 * - AI context description for agent
 */
export function PackageCatalogModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}: PackageCatalogModalProps) {
  // Default empty form state for NEW packages
  const getDefaultForm = (): CatalogTemplate => ({
    name: '',
    totalCredits: 0,
    price: 0,
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'ACTIVE',
    description: '',
  });

  const [formData, setFormData] = useState<CatalogTemplate>(getDefaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When modal opens/closes or initialData changes, reset form
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // EDIT mode: pre-populate with existing data
        setFormData(initialData);
      } else {
        // CREATE mode: start with empty form
        setFormData(getDefaultForm());
      }
      setErrors({});
    }
  }, [isOpen, initialData]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Package name is required';
    }
    if (formData.totalCredits <= 0) {
      newErrors.totalCredits = 'Credits must be greater than 0';
    }
    if (formData.price < 0) {
      newErrors.price = 'Price cannot be negative';
    }
    if (!formData.validFrom) {
      newErrors.validFrom = 'Valid from date is required';
    }
    if (!formData.validUntil) {
      newErrors.validUntil = 'Valid until date is required';
    }
    if (formData.validFrom >= formData.validUntil) {
      newErrors.validUntil = 'Valid until must be after valid from';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'totalCredits' ? parseInt(value) || 0 : name === 'price' ? parseFloat(value) || 0 : value,
    });
    // Clear error for this field
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData, initialData?.packageId);
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save package' });
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
          <h3>{initialData ? 'Edit Package Template' : 'Create New Package Template'}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Package Name */}
          <div className="form-group">
            <label htmlFor="name">Package Name *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder='e.g., "10 Sessions", "Monthly Unlimited"'
              disabled={isLoading || isSubmitting}
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          {/* Price & Credits Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Price */}
            <div className="form-group">
              <label htmlFor="price">Price ($) *</label>
              <input
                id="price"
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="99.99"
                step="0.01"
                disabled={isLoading || isSubmitting}
              />
              {errors.price && <span className="form-error">{errors.price}</span>}
            </div>

            {/* Total Credits */}
            <div className="form-group">
              <label htmlFor="totalCredits">Total Credits *</label>
              <input
                id="totalCredits"
                type="number"
                name="totalCredits"
                value={formData.totalCredits}
                onChange={handleChange}
                placeholder="10"
                min="1"
                disabled={isLoading || isSubmitting}
              />
              {errors.totalCredits && <span className="form-error">{errors.totalCredits}</span>}
            </div>
          </div>

          {/* Valid From & Until Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Valid From */}
            <div className="form-group">
              <label htmlFor="validFrom">Valid From *</label>
              <input
                id="validFrom"
                type="date"
                name="validFrom"
                value={formData.validFrom}
                onChange={handleChange}
                disabled={isLoading || isSubmitting}
              />
              {errors.validFrom && <span className="form-error">{errors.validFrom}</span>}
            </div>

            {/* Valid Until */}
            <div className="form-group">
              <label htmlFor="validUntil">Valid Until *</label>
              <input
                id="validUntil"
                type="date"
                name="validUntil"
                value={formData.validUntil}
                onChange={handleChange}
                disabled={isLoading || isSubmitting}
              />
              {errors.validUntil && <span className="form-error">{errors.validUntil}</span>}
            </div>
          </div>

          {/* Status */}
          <div className="form-group">
            <label htmlFor="status">Status *</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              disabled={isLoading || isSubmitting}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
          </div>

          {/* Description / AI Context */}
          <div className="form-group">
            <label htmlFor="description">Description (AI Context)</label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              placeholder="Instructions for the AI agent (e.g., 'Recommended for beginners')"
              rows={3}
              disabled={isLoading || isSubmitting}
            />
            <span style={{ fontSize: '11px', color: '#999' }}>
              This description is used by the WhatsApp agent to provide context when recommending this package.
            </span>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', padding: '8px', fontSize: '12px', color: '#721c24' }}>
              {errors.submit}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || isSubmitting}
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
              disabled={isLoading || isSubmitting}
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
                opacity: isLoading || isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update Package' : 'Create Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
