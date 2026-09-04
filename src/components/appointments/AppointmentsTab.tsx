import { useState, useEffect, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../hooks/useAppSync';
import { Badge } from '../home/components/Badge';
import { CoachCrudModal } from './CoachCrudModal';
import { useAdminSub } from '../../hooks';
import { isCoach, createCoach, type Coach } from '../../lib/models';
import { observeCoaches } from '../../services/DatabaseService';
import './AppointmentsTab.css';

/**
 * AppointmentsTab: Coaches & Trainers management with STD backend
 *
 * Architecture:
 * - useAdminSub() gets tenant partition key (adminSub)
 * - Auth lifecycle guard: Don't subscribe until adminSub exists
 * - DatabaseService.observeCoaches() provides real-time updates
 * - Automatic cleanup on unmount
 *
 * Features:
 * - Real-time coach sync via AppSync subscriptions
 * - Multi-tenant isolation via pk=adminSub
 * - Add/Edit/Delete coaches with modal forms
 * - Icon-based actions with tooltips
 */
export const AppointmentsTab = () => {
  // Fetch admin's Cognito SUB (partition key) with auth guard
  const { adminSub, loading: adminLoading, error: adminError } = useAdminSub();

  // State for coaches data
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);

  /**
   * AUTH LIFECYCLE GUARD: Only subscribe when adminSub is available
   * This prevents queries like "undefined#COACHES"
   */
  useEffect(() => {
    // Guard: Wait for adminSub to be resolved
    if (!adminSub) {
      console.log('[AppointmentsTab] Waiting for adminSub...');
      setLoading(true);
      setCoaches([]);
      return;
    }

    console.log('[AppointmentsTab] adminSub resolved:', adminSub);
    setLoading(true);
    setError(null);

    // Subscribe to real-time coach updates
    const unsubscribe = observeCoaches(adminSub, (data: Coach[]) => {
      console.log('[AppointmentsTab] Received coach data:', data.length, 'items');
      
      // Filter by entityType and sort by name
      const filtered = data.filter(isCoach).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '')
      );
      
      setCoaches(filtered);
      setLoading(false);
    });

    // Cleanup on unmount
    return () => {
      console.log('[AppointmentsTab] Cleaning up coach subscription');
      unsubscribe();
    };
  }, [adminSub]);

  /**
   * Show toast notification
   */
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  /**
   * Handle add coach
   */
  const handleAddCoach = () => {
    if (!adminSub) {
      setSaveError('Admin user not authenticated. Please wait...');
      return;
    }
    setSelectedCoach(null);
    setModalOpen(true);
  };

  /**
   * Handle edit coach
   */
  const handleEditCoach = (coach: Coach) => {
    setSelectedCoach(coach);
    setModalOpen(true);
  };

  /**
   * Handle save coach (create or update)
   */
  const handleSaveCoach = async (formData: Partial<Coach>) => {
    if (!adminSub) {
      setSaveError('Admin user not authenticated');
      return;
    }

    try {
      setSaveError(null);
      const client = generateClient<Schema>();

      if (selectedCoach) {
        // Update existing coach
        const updatedCoach = createCoach(adminSub, formData.phone || '', {
          name: formData.name || '',
          specialty: formData.specialty || '',
          status: formData.status || 'ACTIVE',
          email: formData.email || '',
          bio: formData.bio || '',
        });
        await (client.models as any).ClubRecord.update(updatedCoach);
        showToast('Coach updated successfully');
      } else {
        // Create new coach
        const newCoach = createCoach(adminSub, formData.phone || '', {
          name: formData.name || '',
          specialty: formData.specialty || '',
          status: formData.status || 'ACTIVE',
          email: formData.email || '',
          bio: formData.bio || '',
        });
        await (client.models as any).ClubRecord.create(newCoach);
        showToast('Coach created successfully');
      }

      setSaveError(null);
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save coach';
      console.error('Failed to save coach:', err);
      setSaveError(message);
      throw err;
    }
  };

  /**
   * Handle delete coach
   */
  const handleDeleteCoach = async (coach: Coach) => {
    if (!adminSub) {
      setSaveError('Admin user not authenticated');
      return;
    }

    try {
      setSaveError(null);
      const client = generateClient<Schema>();
      await (client.models as any).ClubRecord.delete({
        pk: adminSub,
        sk: `COACH#${coach.phone}`,
      });

      showToast('Coach deleted successfully');
      setSaveError(null);
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete coach';
      console.error('Failed to delete coach:', err);
      setSaveError(message);
      throw err;
    }
  };

  /**
   * Handle close modal
   */
  const closeModal = () => {
    setModalOpen(false);
    setSelectedCoach(null);
  };

  // If auth is still loading, show skeleton
  if (adminLoading || !adminSub) {
    return (
      <div className="appointments-container">
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
          Initializing authentication... Please wait.
        </div>
      </div>
    );
  }

  // If auth failed, show error
  if (adminError) {
    return (
      <div className="appointments-container">
        <div className="error-banner">
          Authentication error: {adminError.message}
        </div>
      </div>
    );
  }

  // If subscription failed, show error
  if (error) {
    return (
      <div className="appointments-container">
        <div className="error-banner">
          Failed to load coaches: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="appointments-container">
      <div className="appointments-header">
        <h2>👥 Coaches & Trainers</h2>
        <button className="btn-add-coach" onClick={handleAddCoach} disabled={loading || !adminSub || adminLoading}>
          + Add New Coach
        </button>
      </div>

      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
          Loading coaches...
        </div>
      ) : (
        <div className="table-wrapper">
          <div ref={tableBodyRef} className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Specialty</th>
                  <th>Status</th>
                  <th>Phone</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coaches.length > 0 ? (
                  coaches.map((coach: Coach) => (
                    <tr key={coach.phone} className="data-row">
                      <td className="cell-name">{coach.name || '—'}</td>
                      <td className="cell-specialty">{coach.specialty || '—'}</td>
                      <td className="cell-status">
                        <Badge
                          variant={coach.status === 'ACTIVE' ? 'success' : coach.status === 'SUSPENDED' ? 'warning' : 'primary'}
                          text={coach.status || 'ACTIVE'}
                        />
                      </td>
                      <td className="cell-phone">
                        <a href={`tel:${coach.phone}`} className="phone-link">
                          {coach.phone || '—'}
                        </a>
                      </td>
                      <td className="cell-actions">
                        <button
                          className="icon-button edit-btn"
                          onClick={() => handleEditCoach(coach)}
                          title="Edit coach"
                          aria-label={`Edit ${coach.name}`}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-button delete-btn"
                          onClick={() => handleDeleteCoach(coach)}
                          title="Delete coach"
                          aria-label={`Delete ${coach.name}`}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row">
                    <td colSpan={5} className="empty-state">
                      No coaches found. Add your first coach to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CoachCrudModal
        isOpen={modalOpen}
        coach={selectedCoach}
        onClose={closeModal}
        onSave={handleSaveCoach}
        onDelete={handleDeleteCoach}
        error={saveError}
      />
    </div>
  );
};
