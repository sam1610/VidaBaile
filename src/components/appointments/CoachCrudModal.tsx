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

function formatDateTimeRange(isoStart: string, isoEnd: string): string {
  try {
    const start = new Date(isoStart);
    const end   = new Date(isoEnd);
    const dateFmt: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    const startDate = start.toLocaleDateString(undefined, dateFmt);
    const startTime = start.toLocaleTimeString(undefined, timeFmt);
    const endDate   = end.toLocaleDateString(undefined, dateFmt);
    const endTime   = end.toLocaleTimeString(undefined, timeFmt);
    if (startDate === endDate) {
      return `${startDate}  ${startTime} \u2192 ${endTime}`;
    }
    return `${startDate} ${startTime} \u2192 ${endDate} ${endTime}`;
  } catch {
    return `${isoStart} \u2192 ${isoEnd}`;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface UnavailBlock {
  sk: string;
  startDateTime: string;
  endDateTime: string;
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
 *                       gsi1pk=<adminSub>#UNAVAIL#<phone>
 *                       gsi1sk=DATETIME#<isoStart>
 *                       startDateTime=<isoStart>   (explicit field, avoids parsing gsi1sk)
 *                       endDateTime=<isoEnd>        (full ISO — not endTime which is AWSTime only)
 *                       reason=<text>               (absence justification)
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
  const [savingBlock, setSavingBlock]           = useState(false);
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
      const gsi1pk = `${adminSub}#UNAVAIL#${coach.phone}`;
      const skLow  = `DATETIME#${filterStart}T00:00:00.000Z`;
      const skHigh = `DATETIME#${filterEnd}T23:59:59.999Z`;

      const { data: records, errors } = await (client.models as any).ClubRecord.listByGsi1({
        gsi1pk,
        gsi1sk: { between: [skLow, skHigh] },
      });

      if (errors?.length) {
        console.error('[CoachCrudModal] fetchUnavailabilities errors:', errors);
        setError(`Failed to load absences: ${errors[0]?.message ?? 'unknown error'}`);
        setUnavailabilities([]);
        return;
      }

      const blocks: UnavailBlock[] = ((records as any[]) ?? [])
        .map((item: any) => ({
          sk:            item.sk            ?? '',
          // Prefer explicit startDateTime; fall back to deriving from gsi1sk
          startDateTime: item.startDateTime ?? item.gsi1sk?.replace('DATETIME#', '') ?? '',
          endDateTime:   item.endDateTime   ?? '',
          reason:        item.reason        ?? '',
        }))
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));

      setUnavailabilities(blocks);
    } catch (err) {
      console.error('[CoachCrudModal] fetchUnavailabilities failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load absences');
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
    setSavingBlock(true);
    setError(null);
    try {
      const isoStart = new Date(newBlock.start).toISOString();
      const isoEnd   = new Date(newBlock.end).toISOString();

      if (isoEnd <= isoStart) {
        setError('End time must be after start time.');
        return;
      }

      const client = generateClient<Schema>();
      const { errors } = await (client.models as any).ClubRecord.create({
        pk:            adminSub,
        sk:            `UNAVAIL#${coach.phone}#${isoStart}`,
        entityType:    'COACH_UNAVAILABILITY',
        gsi1pk:        `${adminSub}#UNAVAIL#${coach.phone}`,
        gsi1sk:        `DATETIME#${isoStart}`,
        startDateTime: isoStart,
        endDateTime:   isoEnd,
        reason:        newBlock.reason.trim() || undefined,
      });

      if (errors?.length) {
        const msg = errors.map((e: any) => e.message).join('; ');
        console.error('[CoachCrudModal] handleSaveNewBlock errors:', errors);
        setError(`Failed to save absence: ${msg}`);
        return;
      }

      setNewBlock({ start: '', end: '', reason: '' });
      setIsAddingUnavail(false);
      await fetchUnavailabilities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save absence block');
      console.error('[CoachCrudModal] handleSaveNewBlock failed:', err);
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleDeleteBlock(sk: string) {
    if (!adminSub) return;
    if (!window.confirm('Delete this absence block?')) return;
    try {
      const client = generateClient<Schema>();
      const { errors } = await (client.models as any).ClubRecord.delete({ pk: adminSub, sk });
      if (errors?.length) {
        setError(`Failed to delete absence: ${errors[0]?.message ?? 'unknown error'}`);
        return;
      }
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
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close">\u2715</button>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-body">

          <div className="form-row-2col">
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
                Phone *{isEditMode && <span className="field-note"> (locked)</span>}
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
          </div>

          <div className="form-row-2col">
            <div className="form-group">
              <label htmlFor="specialty">Specialty *</label>
              <input id="specialty" type="text" name="specialty"
                value={formData.specialty || ''}
                onChange={handleChange}
                placeholder="e.g., Salsa, Bachata"
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

              {/* Absence table */}
              {loadingUnavail ? (
                <p className="unavail-loading">Loading absences\u2026</p>
              ) : unavailabilities.length === 0 ? (
                <p className="unavail-empty">No absences in this date range.</p>
              ) : (
                <table className="unavail-table" aria-label="Absence blocks">
                  <thead>
                    <tr>
                      <th>Interval</th>
                      <th>Reason</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unavailabilities.map((block) => (
                      <tr key={block.sk}>
                        <td className="unavail-col-interval">
                          {formatDateTimeRange(block.startDateTime, block.endDateTime)}
                        </td>
                        <td className="unavail-col-reason">
                          {block.reason || <span className="unavail-no-reason">\u2014</span>}
                        </td>
                        <td className="unavail-col-actions">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteBlock(block.sk)}
                            aria-label="Delete absence block"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <div className="unavail-datetime-row">
                    <div className="form-group">
                      <label htmlFor="unavail-start">Start *</label>
                      <input
                        id="unavail-start"
                        type="datetime-local"
                        value={newBlock.start}
                        onChange={(e) => setNewBlock((p) => ({ ...p, start: e.target.value }))}
                        disabled={savingBlock}
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
                        disabled={savingBlock}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="unavail-reason">Reason</label>
                    <input
                      id="unavail-reason"
                      type="text"
                      value={newBlock.reason}
                      onChange={(e) => setNewBlock((p) => ({ ...p, reason: e.target.value }))}
                      placeholder="e.g., travelling, personal leave"
                      disabled={savingBlock}
                    />
                  </div>
                  <div className="unavail-add-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveNewBlock}
                      disabled={savingBlock}
                    >
                      {savingBlock ? 'Saving\u2026' : 'Save Block'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setIsAddingUnavail(false);
                        setNewBlock({ start: '', end: '', reason: '' });
                      }}
                      disabled={savingBlock}
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
