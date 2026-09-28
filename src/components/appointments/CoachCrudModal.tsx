import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../hooks/useAppSync';
import type { Coach } from '../../lib/models';
import './CoachCrudModal.css';

const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return toDateString(new Date());
}

function thirtyDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toDateString(d);
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface UnavailBlock {
  sk: string;
  gsi1sk: string;
  endTime: string;
  reason: string;
}

interface NewBlock {
  start: string;
  end: string;
  reason: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CoachCrudModalProps {
  isOpen: boolean;
  coach: Coach | null;
  onClose: () => void;
  onSave: (coach: Partial<Coach>) => Promise<void>;
  onDelete: (coach: Coach) => Promise<void>;
  error?: string | null;
  adminSub: string | null;
}

/**
 * CoachCrudModal — create/edit coaches + manage unavailability blocks.
 *
 * STD key shapes:
 *   COACH record:       pk=adminSub, sk=COACH#<phone>
 *   UNAVAILABILITY:     pk=adminSub, sk=UNAVAIL#<phone>#<isoStart>
 *                       gsi1pk=adminSub#UNAVAIL#<phone>
 *                       gsi1sk=DATETIME#<isoStart>
 *
 * The unavailability section only renders in edit mode (coach !== null).
 */
export const CoachCrudModal = ({
  isOpen,
  coach,
  onClose,
  onSave,
  onDelete,
  error: externalError,
  adminSub,
}: CoachCrudModalProps) => {

  // ── Coach form state ─────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Partial<Coach>>({
    name: '', phone: '', specialty: '', email: '', bio: '', status: 'ACTIVE',
  });
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // ── Unavailability state ──────────────────────────────────────────────────
  const [filterStart, setFilterStart]           = useState(todayStr);
  const [filterEnd, setFilterEnd]               = useState(thirtyDaysFromNow);
  const [unavailabilities, setUnavailabilities] = useState<UnavailBlock[]>([]);
  const [loadingUnavail, setLoadingUnavail]     = useState(false);
  const [isAddingUnavail, setIsAddingUnavail]   = useState(false);
  const [newBlock, setNewBlock]                 = useState<NewBlock>({ start: '', end: '', reason: '' });

  // ── Sync form when coach changes ──────────────────────────────────────────
  useEffect(() => {
    if (coach) {
      setFormData({
        name: coach.name || '', phone: coach.phone || '',
        specialty: coach.specialty || '', email: coach.email || '',
        bio: coach.bio || '', status: coach.status || 'ACTIVE',
      });
    } else {
      setFormData({ name: '', phone: '', specialty: '', email: '', bio: '', status: 'ACTIVE' });
    }
    setError(null);
    setPhoneError(null);
    setIsAddingUnavail(false);
    setNewBlock({ start: '', end: '', reason: '' });
  }, [coach]);

  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  // ── Auto-fetch unavailabilities ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen && coach && adminSub) fetchUnavailabilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, coach, adminSub, filterStart, filterEnd]);

  if (!isOpen) return null;

  const isEditMode = !!coach;
  const title = isEditMode ? 'Edit Coach' : 'Add New Coach';

  // ── Unavailability CRUD ───────────────────────────────────────────────────

  async function fetchUnavailabilities() {
    if (!adminSub || !coach?.phone) return;
    setLoadingUnavail(true);
    try {
      const client = generateClient<Schema>();
      const gsi1pk = adminSub + '#UNAVAIL#' + coach.phone;
      const skLow  = 'DATETIME#' + filterStart + 'T00:00:00.000Z';
      const skHigh = 'DATETIME#' + filterEnd   + 'T23:59:59.999Z';
      const { data, errors } = await (client.models as any).ClubRecord.listByGsi1({
        gsi1pk,
        gsi1sk: { between: [skLow, skHigh] },
      });
      if (errors?.length) console.error('[CoachCrudModal] fetchUnavailabilities errors:', errors);
      const blocks: UnavailBlock[] = ((data as any[]) ?? [])
        .map((item: any) => ({
          sk:      item.sk      ?? '',
          gsi1sk:  item.gsi1sk  ?? '',
          endTime: item.endTime ?? '',
          reason:  item.reason  ?? '',
        }))
        .sort((a, b) => a.gsi1sk.localeCompare(b.gsi1sk));
      setUnavailabilities(blocks);
    } catch (err) {
      console.error('[CoachCrudModal] fetchUnavailabilities failed:', err);
    } finally {
      setLoadingUnavail(false);
    }
  }

  async function handleSaveNewBlock() {
    if (!adminSub || !coach?.phone) return;
    if (!newBlock.start || !newBlock.end) {
      setError('Start and end times are required for the absence block.');
      return;
    }
    const isoStart = new Date(newBlock.start).toISOString();
    const isoEnd   = new Date(newBlock.end).toISOString();
    try {
      const client = generateClient<Schema>();
      await (client.models as any).ClubRecord.create({
        pk:         adminSub,
        sk:         'UNAVAIL#' + coach.phone + '#' + isoStart,
        entityType: 'COACH_UNAVAILABILITY',
        gsi1pk:     adminSub + '#UNAVAIL#' + coach.phone,
        gsi1sk:     'DATETIME#' + isoStart,
        endTime:    isoEnd,
        reason:     newBlock.reason,
      });
      setNewBlock({ start: '', end: '', reason: '' });
      setIsAddingUnavail(false);
      await fetchUnavailabilities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save absence block');
      console.error('[CoachCrudModal] handleSaveNewBlock failed:', err);
    }
  }

  async function handleDeleteBlock(sk: string) {
    if (!adminSub) return;
    if (!window.confirm('Delete this absence block?')) return;
    try {
      const client = generateClient<Schema>();
      await (client.models as any).ClubRecord.delete({ pk: adminSub, sk });
      await fetchUnavailabilities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete absence block');
      console.error('[CoachCrudModal] handleDeleteBlock failed:', err);
    }
  }

  // ── Coach form helpers ────────────────────────────────────────────────────

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setPhoneError(value && !PHONE_REGEX.test(value)
        ? 'Phone must be in E.164 format (e.g., +1-555-0001)'
        : null);
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateForm = () => {
    if (!formData.name?.trim())        { setError('Name is required');      return false; }
    if (!formData.phone?.trim())       { setError('Phone is required');     return false; }
    if (!PHONE_REGEX.test(formData.phone!)) {
      setError('Phone must be in E.164 format (e.g., +1-555-0001)');
      setPhoneError('Phone must be in E.164 format (e.g., +1-555-0001)');
      return false;
    }
    if (!formData.specialty?.trim())   { setError('Specialty is required'); return false; }
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
    setFormData({ name: '', phone: '', specialty: '', email: '', bio: '', status: 'ACTIVE' });
    setError(null);
    setPhoneError(null);
    setIsAddingUnavail(false);
    setNewBlock({ start: '', end: '', reason: '' });
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-body">

          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input id="name" type="text" name="name"
              value={formData.name || ''}
              onChange={handleChange}
              placeholder="Coach name"
              disabled={saving || deleting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">
              Phone *{isEditMode && <span className="field-note"> (Cannot be changed)</span>}
            </label>
            <input id="phone" type="tel" name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              placeholder="+1-555-0001"
              disabled={isEditMode || saving || deleting}
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
            {phoneError && <div id="phone-error" className="form-error">{phoneError}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="specialty">Specialty *</label>
            <input id="specialty" type="text" name="specialty"
              value={formData.specialty || ''}
              onChange={handleChange}
              placeholder="e.g., Salsa Gold, Bachata"
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" name="email"
              value={formData.email || ''}
              onChange={handleChange}
              placeholder="coach@example.com"
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" name="bio"
              value={formData.bio || ''}
              onChange={handleChange}
              placeholder="Brief biography"
              rows={3}
              disabled={saving || deleting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select id="status" name="status"
              value={formData.status || 'ACTIVE'}
              onChange={handleChange}
              disabled={saving || deleting}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>

          {/* ── Manage Unavailability (edit mode only) ────────────────────── */}
          {isEditMode && (
            <div className="unavail-section">
              <h3 className="unavail-title">Manage Unavailability</h3>

              {/* Date range filter */}
              <div className="unavail-filter">
                <span className="unavail-filter-label">Filter:</span>
                <input
                  type="date"
                  value={filterStart}
                  min="2020-01-01"
                  onChange={(e) => setFilterStart(e.target.value)}
                  aria-label="Filter start date"
                  className="unavail-date-input"
                />
                <span className="unavail-filter-sep">to</span>
                <input
                  type="date"
                  value={filterEnd}
                  min={filterStart}
                  onChange={(e) => setFilterEnd(e.target.value)}
                  aria-label="Filter end date"
                  className="unavail-date-input"
                />
              </div>

              {/* Absence list */}
              {loadingUnavail ? (
                <p className="unavail-loading">Loading absences…</p>
              ) : unavailabilities.length === 0 ? (
                <p className="unavail-empty">No absences in this date range.</p>
              ) : (
                <ul className="unavail-list">
                  {unavailabilities.map((block) => {
                    const isoStart = block.gsi1sk.replace('DATETIME#', '');
                    return (
                      <li key={block.sk} className="unavail-item">
                        <div className="unavail-item-times">
                          <span className="unavail-item-start">{formatDateTime(isoStart)}</span>
                          <span className="unavail-item-arrow">&rarr;</span>
                          <span className="unavail-item-end">{formatDateTime(block.endTime)}</span>
                        </div>
                        {block.reason && (
                          <span className="unavail-item-reason">{block.reason}</span>
                        )}
                        <button
                          className="btn btn-danger unavail-delete-btn"
                          onClick={() => handleDeleteBlock(block.sk)}
                          aria-label="Delete absence block"
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add absence inline form */}
              {!isAddingUnavail ? (
                <button
                  className="btn btn-secondary unavail-add-btn"
                  onClick={() => setIsAddingUnavail(true)}
                >
                  + Add Absence
                </button>
              ) : (
                <div className="unavail-add-form">
                  <div className="form-group">
                    <label htmlFor="unavail-start">Start *</label>
                    <input
                      id="unavail-start"
                      type="datetime-local"
                      value={newBlock.start}
                      onChange={(e) => setNewBlock((p) => ({ ...p, start: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="unavail-end">End *</label>
                    <input
                      id="unavail-end"
                      type="datetime-local"
                      value={newBlock.end}
                      min={newBlock.start}
                      onChange={(e) => setNewBlock((p) => ({ ...p, end: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="unavail-reason">Reason</label>
                    <input
                      id="unavail-reason"
                      type="text"
                      value={newBlock.reason}
                      onChange={(e) => setNewBlock((p) => ({ ...p, reason: e.target.value }))}
                      placeholder="e.g., Personal leave"
                    />
                  </div>
                  <div className="unavail-add-form-actions">
                    <button className="btn btn-primary" onClick={handleSaveNewBlock}>
                      Save Block
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setIsAddingUnavail(false);
                        setNewBlock({ start: '', end: '', reason: '' });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end modal-body */}

        <div className="modal-footer">
          {isEditMode && (
            <button
              className="btn btn-danger"
              onClick={handleDeleteClick}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Coach'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={handleClose} disabled={saving || deleting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || deleting}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  );
};
