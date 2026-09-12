/**
 * PackageCatalogModal — Simple product catalog builder.
 *
 * Single-form modal. No tabs, no targeting, no dates.
 * Fields: Package Name, Price, Total Credits, Base Description.
 *
 * All campaign-specific logic (validity dates, status, targeting, AI context
 * overrides, launch scheduling) lives in the PR/Marketing Campaign modal.
 */
import { useState, useEffect } from 'react';
import '../common/Modal.css';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface CatalogSubmitData {
  name: string;
  price: number;
  totalCredits: number;
  packageKnowledgeBase: string; // Base description surfaced to campaigns
}

interface CatalogTemplate {
  packageId?: string;
  name: string;
  price: number;
  totalCredits: number;
  packageKnowledgeBase?: string;
}

export interface PackageCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CatalogSubmitData, packageId?: string) => Promise<void>;
  initialData?: CatalogTemplate;
  isLoading?: boolean;
}

export function PackageCatalogModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}: PackageCatalogModalProps) {

  const getDefault = (): CatalogTemplate => ({
    name: '',
    price: 0,
    totalCredits: 0,
    packageKnowledgeBase: '',
  });

  const [form, setForm]             = useState<CatalogTemplate>(getDefault());
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setForm(
      initialData
        ? {
            ...initialData,
            packageKnowledgeBase:
              initialData.packageKnowledgeBase ??
              (initialData as any).description ??
              '',
          }
        : getDefault()
    );
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())      errs.name         = 'Package name is required';
    if (form.price < 0)         errs.price        = 'Price cannot be negative';
    if (form.totalCredits <= 0) errs.totalCredits = 'Credits must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]:
        name === 'price'        ? parseFloat(value) || 0 :
        name === 'totalCredits' ? parseInt(value)   || 0 :
        value,
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          name:                 form.name,
          price:                form.price,
          totalCredits:         form.totalCredits,
          packageKnowledgeBase: form.packageKnowledgeBase ?? '',
        },
        initialData?.packageId,
      );
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to save package' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const disabled = isLoading || isSubmitting;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3>{initialData ? 'Edit Package' : 'Create New Package'}</h3>
          <button className="modal-close" onClick={onClose} type="button">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">

          {/* Package Name */}
          <div className="form-group">
            <label htmlFor="name">Package Name *</label>
            <input id="name" type="text" name="name"
              value={form.name} onChange={change}
              placeholder='"Rumba Season", "Monthly Unlimited"'
              disabled={disabled} />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          {/* Price & Credits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label htmlFor="price">Price ($) *</label>
              <input id="price" type="number" name="price"
                value={form.price} onChange={change}
                placeholder="99.99" step="0.01" min="0" disabled={disabled} />
              {errors.price && <span className="form-error">{errors.price}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="totalCredits">Total Credits *</label>
              <input id="totalCredits" type="number" name="totalCredits"
                value={form.totalCredits} onChange={change}
                placeholder="10" min="1" disabled={disabled} />
              {errors.totalCredits && <span className="form-error">{errors.totalCredits}</span>}
            </div>
          </div>

          {/* Base Description */}
          <div className="form-group">
            <label htmlFor="packageKnowledgeBase">Description</label>
            <textarea id="packageKnowledgeBase" name="packageKnowledgeBase"
              value={form.packageKnowledgeBase ?? ''}
              onChange={change} rows={4} disabled={disabled}
              placeholder='"10 sessions of pure Latin rhythm…"'
              style={{ resize: 'vertical' }} />
            <span style={{ fontSize: '11px', color: '#888' }}>
              Base description — campaigns can override this with campaign-specific AI context.
            </span>
          </div>

          {errors.submit && (
            <div style={{ background:'#f8d7da', border:'1px solid #f5c6cb',
                          borderRadius:'4px', padding:'8px', fontSize:'12px', color:'#721c24' }}>
              {errors.submit}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} disabled={disabled}
              style={{ flex:1, padding:'10px', background:'#f0f0f0', border:'1px solid #ddd',
                       borderRadius:'4px', cursor:'pointer', fontWeight:600, fontSize:'12px' }}>
              Cancel
            </button>
            <button type="submit" disabled={disabled}
              style={{ flex:1, padding:'10px', background:'#2e3b50', color:'white',
                       border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:600,
                       fontSize:'12px', opacity: disabled ? 0.6 : 1 }}>
              {isSubmitting ? 'Saving…' : initialData ? 'Update Package' : 'Create Package'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
