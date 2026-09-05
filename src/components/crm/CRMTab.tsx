import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../hooks/useAppSync';
import { CrmDashboard } from './CrmDashboard';
import { MemberCrudModal } from './MemberCrudModal';
import { MemberEnrollmentsModal } from './MemberEnrollmentsModal';
import { useAdminSub } from '../../hooks';
import { createMember, type Member } from '../../lib/models';
import { observeSchedulesByDateRange, observeCoaches } from '../../services/DatabaseService';
import './CRMTab.css';

/**
 * CRMTab: Real-time member management with CRUD operations
 *
 * Features:
 * - Real-time member table (CrmDashboard)
 * - Add new member (modal)
 * - Edit member (modal)
 * - NO delete button (strict guardrail)
 * - Members removed via status = INACTIVE
 */
export const CRMTab = () => {
  const { adminSub } = useAdminSub();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [enrollmentsModalOpen, setEnrollmentsModalOpen] = useState(false);
  const [selectedMemberForEnrollments, setSelectedMemberForEnrollments] = useState<Member | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);


  // Fetch schedules and coaches for the enrollments modal
  useEffect(() => {
    if (!adminSub) return;

    // Get date range: 180 days back to 365 days forward
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 180);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 365);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const unsubscribeSchedules = observeSchedulesByDateRange(adminSub, startDateStr, endDateStr, (data: any[]) => {
      setSchedules(data.filter((item) => item.entityType === 'SCHEDULE') || []);
    });

    const unsubscribeCoaches = observeCoaches(adminSub, (data: any[]) => {
      setCoaches(data.filter((item) => item.entityType === 'COACH') || []);
    });

    return () => {
      unsubscribeSchedules();
      unsubscribeCoaches();
    };
  }, [adminSub]);

    const handleAddMember = () => {
    setSelectedMember(null);
    setSaveError(null);
    setModalOpen(true);
  };

  const handleEditMember = (member: Member) => {
    setSelectedMember(member);
    setSaveError(null);
    setModalOpen(true);
  };


  const handleViewEnrollments = (member: Member) => {
    setSelectedMemberForEnrollments(member);
    setEnrollmentsModalOpen(true);
  };

  const closeEnrollmentsModal = () => {
    setEnrollmentsModalOpen(false);
    setSelectedMemberForEnrollments(null);
  };

    const closeModal = () => {
    setModalOpen(false);
    setSelectedMember(null);
    setSaveError(null);
  };

  const handleSaveMember = async (formData: Partial<Member>) => {
    if (!adminSub) {
      setSaveError('Admin user not authenticated');
      return;
    }

    try {
      setSaveError(null);
      const client = generateClient<Schema>();

      if (selectedMember) {
        // Update existing member
        const updatedMember = createMember(adminSub, formData.phone || '', {
          name: formData.name || '',
          status: formData.status || 'ACTIVE',
          tier: formData.tier || 'STANDARD',
          email: formData.email || '',
        });
        await (client.models as any).ClubRecord.update(updatedMember);
      } else {
        // Create new member
        const newMember = createMember(adminSub, formData.phone || '', {
          name: formData.name || '',
          status: formData.status || 'ACTIVE',
          tier: formData.tier || 'STANDARD',
          email: formData.email || '',
        });
        await (client.models as any).ClubRecord.create(newMember);
      }

      setSaveError(null);
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save member';
      console.error('Failed to save member:', err);
      setSaveError(message);
      throw err;
    }
  };

  return (
    <div className="crm-tab-container">
      <div className="crm-tab-header">
        <button className="btn-add-member" onClick={handleAddMember}>
          + Add New Member
        </button>
      </div>
      <CrmDashboard onEditMember={handleEditMember} onViewEnrollments={handleViewEnrollments} />
      <MemberCrudModal
        isOpen={modalOpen}
        member={selectedMember}
        onClose={closeModal}
        onSave={handleSaveMember}
        error={saveError}
      />
      <MemberEnrollmentsModal
        isOpen={enrollmentsModalOpen}
        onClose={closeEnrollmentsModal}
        member={selectedMemberForEnrollments}
        schedules={schedules}
        coaches={coaches}
      />
    </div>
  );
};
