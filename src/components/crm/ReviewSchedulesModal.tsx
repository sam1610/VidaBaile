import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../hooks/useAppSync';
import './ReviewSchedulesModal.css';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A DRAFT_PROPOSAL SCHEDULE record as returned from AppSync.
 * Fields are nullable because ClubRecord is a wide single-table model.
 */
interface DraftSchedule {
  pk: string;
  sk: string;
  activityType:     string | null;
  date:             string | null;  // YYYY-MM-DD
  startTime:        string | null;  // HH:MM:SS
  endTime:          string | null;  // HH:MM:SS
  facilityId:       string | null;
  capacity:         number | null;
  currentOccupancy: number | null;
  coachPhone:       string | null;
  status:           string | null;
}

interface CoachOption {
  phone:     string;
  name:      string;
  specialty: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ReviewSchedulesModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  adminSub: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format YYYY-MM-DD + HH:MM:SS into a readable "30/09/2026  18:00" string */
function formatDateAndTime(date: string | null, time: string | null): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  const datePart = `${d}/${m}/${y}`;
  if (!time) return datePart;
  const timePart = time.slice(0, 5); // HH:MM
  return `${datePart}  ${timePart}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ReviewSchedulesModal = ({
  isOpen,
  onClose,
  adminSub,
}: ReviewSchedulesModalProps) => {

  const [drafts, setDrafts]             = useState<DraftSchedule[]>([]);
  const [coaches, setCoaches]           = useState<CoachOption[]>([]);
  const [loading, setLoading]           = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !adminSub) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const client = generateClient<Schema>();

        // ── Fetch DRAFT_PROPOSAL schedules via GSI1 ──────────────────────
        // gsi1pk = <adminSub>#SCHEDULES
        // gsi1sk begins_with STATUS#DRAFT_PROPOSAL
        const { data: scheduleRecords, errors: scheduleErrors } =
          await (client.models as any).ClubRecord.listByGsi1({
            gsi1pk: `${adminSub}#SCHEDULES`,
            gsi1sk: { beginsWith: 'STATUS#DRAFT_PROPOSAL' },
          });

        if (scheduleErrors?.length) {
          console.error('[ReviewSchedulesModal] schedule fetch errors:', scheduleErrors);
          throw new Error(scheduleErrors[0]?.message ?? 'Failed to fetch schedules');
        }

        const fetchedDrafts: DraftSchedule[] = ((scheduleRecords as any[]) ?? [])
          .filter((r: any) => r.entityType === 'SCHEDULE' && r.status === 'DRAFT_PROPOSAL')
          .map((r: any): DraftSchedule => ({
            pk:               r.pk               ?? adminSub,
            sk:               r.sk               ?? '',
            activityType:     r.activityType     ?? null,
            date:             r.date             ?? null,
            startTime:        r.startTime        ?? null,
            endTime:          r.endTime          ?? null,
            facilityId:       r.facilityId       ?? null,
            capacity:         r.capacity         ?? null,
            currentOccupancy: r.currentOccupancy ?? null,
            coachPhone:       r.coachPhone       ?? 'UNASSIGNED',
            status:           r.status           ?? null,
          }))
          .sort((a, b) => {
            // Sort by date asc, then startTime asc
            const dateCompare = (a.date ?? '').localeCompare(b.date ?? '');
            if (dateCompare !== 0) return dateCompare;
            return (a.startTime ?? '').localeCompare(b.startTime ?? '');
          });

        // ── Fetch active coaches via GSI1 ────────────────────────────────
        // gsi1pk = <adminSub>#COACHES
        const { data: coachRecords, errors: coachErrors } =
          await (client.models as any).ClubRecord.listByGsi1({
            gsi1pk: `${adminSub}#COACHES`,
          });

        if (coachErrors?.length) {
          console.error('[ReviewSchedulesModal] coach fetch errors:', coachErrors);
          // Non-fatal: continue with empty coach list
        }

        const fetchedCoaches: CoachOption[] = ((coachRecords as any[]) ?? [])
          .filter((r: any) => r.entityType === 'COACH' && r.status === 'ACTIVE')
          .map((r: any): CoachOption => ({
            phone:     r.phone     ?? (r.sk ?? '').replace('COACH#', ''),
            name:      r.name      ?? 'Unknown',
            specialty: r.specialty ?? '',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setDrafts(fetchedDrafts);
          setCoaches(fetchedCoaches);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load data';
          console.error('[ReviewSchedulesModal] fetchData failed:', err);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [isOpen, adminSub]);

  // ── Action handlers ──────────────────────────────────────────────────────

  /** Update the coachPhone on a specific draft row in local state */
  function handleCoachChange(scheduleSk: string, newCoachPhone: string) {
    setDrafts(prev =>
      prev.map(d => d.sk === scheduleSk ? { ...d, coachPhone: newCoachPhone } : d)
    );
  }

  /** Confirm a draft: update status to CONFIRMED, remove from list */
  async function handleValidate(draft: DraftSchedule) {
    if (!adminSub) return;
    setProcessingId(draft.sk);
    setError(null);

    try {
      const client = generateClient<Schema>();

      const { errors } = await (client.models as any).ClubRecord.update({
        pk:         adminSub,
        sk:         draft.sk,
        status:     'CONFIRMED',
        // Update gsi1sk so it no longer appears in DRAFT_PROPOSAL queries
        gsi1sk:     'STATUS#CONFIRMED',
        coachPhone: draft.coachPhone,
        updatedAt:  new Date().toISOString(),
      });

      if (errors?.length) {
        const msg = errors.map((e: any) => e.message).join('; ');
        console.error('[ReviewSchedulesModal] handleValidate errors:', errors);
        setError(`Failed to confirm schedule: ${msg}`);
        return;
      }

      // Optimistic removal from local state
      setDrafts(prev => prev.filter(d => d.sk !== draft.sk));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm schedule';
      console.error('[ReviewSchedulesModal] handleValidate failed:', err);
      setError(msg);
    } finally {
      setProcessingId(null);
    }
  }

  // ── Early exit ───────────────────────────────────────────────────────────

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true"
         aria-labelledby="review-schedules-title">
      <div
        className="modal-content rs-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="review-schedules-title">Pending Schedule Proposals</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="modal-error-banner" role="alert">{error}</div>
        )}

        {/* Body */}
        <div className="modal-body rs-body">

          {loading ? (
            <p className="rs-state-msg">Loading draft proposals…</p>

          ) : drafts.length === 0 ? (
            <p className="rs-state-msg rs-empty">
              No pending schedules require validation.
            </p>

          ) : (
            <div className="rs-table-wrapper">
              <table className="rs-table" aria-label="Draft schedule proposals">
                <thead>
                  <tr>
                    <th>Package / Dance Session</th>
                    <th>Starting Date &amp; Time</th>
                    <th>Facility</th>
                    <th>Capacity</th>
                    <th>Coach Assignment</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map(draft => {
                    const isProcessing = processingId === draft.sk;
                    const isUnassigned = !draft.coachPhone || draft.coachPhone === 'UNASSIGNED';

                    return (
                      <tr key={draft.sk} className={isUnassigned ? 'rs-row-warn' : ''}>

                        {/* Package / Dance Session */}
                        <td className="rs-col-activity">
                          {draft.activityType ?? 'Custom Session'}
                        </td>

                        {/* Date & Time */}
                        <td className="rs-col-datetime">
                          {formatDateAndTime(draft.date, draft.startTime)}
                        </td>

                        {/* Facility */}
                        <td className="rs-col-facility">
                          {draft.facilityId && draft.facilityId !== 'UNASSIGNED'
                            ? draft.facilityId
                            : <span className="rs-unassigned">Unassigned</span>
                          }
                        </td>

                        {/* Capacity */}
                        <td className="rs-col-capacity">
                          {draft.currentOccupancy ?? '?'}&nbsp;/&nbsp;{draft.capacity ?? '?'}
                        </td>

                        {/* Coach Assignment dropdown */}
                        <td className="rs-col-coach">
                          <select
                            value={draft.coachPhone ?? 'UNASSIGNED'}
                            onChange={e => handleCoachChange(draft.sk, e.target.value)}
                            disabled={isProcessing}
                            className="rs-coach-select"
                            aria-label="Select coach"
                          >
                            <option value="UNASSIGNED">-- Select Coach --</option>
                            {coaches.map(c => (
                              <option key={c.phone} value={c.phone}>
                                {c.name}{c.specialty ? ` — ${c.specialty}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Validate action */}
                        <td className="rs-col-action">
                          <button
                            className="btn btn-primary rs-validate-btn"
                            onClick={() => handleValidate(draft)}
                            disabled={isProcessing || isUnassigned}
                            aria-busy={isProcessing}
                          >
                            {isProcessing ? 'Saving…' : 'Validate'}
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <span className="rs-footer-hint">
            {drafts.length > 0
              ? `${drafts.length} proposal${drafts.length !== 1 ? 's' : ''} pending`
              : 'All proposals resolved'}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
