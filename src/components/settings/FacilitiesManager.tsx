import { useState, useEffect } from 'react';
import { useAdminSub } from '../../hooks';
import { observeFacilitiesRecord } from '../../services/DatabaseService';
import type { Facility } from '../../lib/models';
import { FacilitiesGrid } from './FacilitiesGrid';
import { FacilityModal } from './FacilityModal';
import './FacilitiesManager.css';

/**
 * FacilitiesManager: Dancing Halls Management Component
 *
 * Architecture:
 * - Real-time subscription via observeFacilitiesRecord (GSI1, no table scan)
 * - Responsive grid layout with occupancy visualization
 * - Create/Edit/Delete operations with validation
 * - Multi-tenant isolation via adminSub
 */
export function FacilitiesManager() {
  const { adminSub, loading: adminLoading, error: adminError } = useAdminSub();
  
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  // Subscribe to real-time facility updates (INDEX-BASED: GSI1)
  useEffect(() => {
    if (!adminSub) {
      console.log('[FacilitiesManager] Waiting for adminSub...');
      setLoading(true);
      return;
    }

    console.log('[FacilitiesManager] Starting facility subscription for:', adminSub);
    setLoading(true);

    const unsubscribe = observeFacilitiesRecord(adminSub, (data) => {
      console.log('[FacilitiesManager] Received facilities:', data.length);
      const sorted = [...data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setFacilities(sorted);
      setLoading(false);
    });

    return () => {
      console.log('[FacilitiesManager] Cleanup: unsubscribing');
      unsubscribe();
    };
  }, [adminSub]);

  if (adminLoading || !adminSub) {
    return (
      <div className="facilities-container">
        <div className="loading-message">Loading facilities...</div>
      </div>
    );
  }

  if (adminError) {
    return (
      <div className="facilities-container">
        <div className="error-message">Authentication error: {adminError.message}</div>
      </div>
    );
  }

  const handleAddFacility = () => {
    setSelectedFacility(null);
    setModalOpen(true);
  };

  const handleEditFacility = (facility: Facility) => {
    setSelectedFacility(facility);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedFacility(null);
  };

  return (
    <div className="facilities-container">
      <div className="facilities-header">
        <h3>🏛️ Dancing Halls & Facilities</h3>
        <button className="btn-add-facility" onClick={handleAddFacility} disabled={loading}>
          + Add Facility
        </button>
      </div>


      {loading ? (
        <div className="loading-message">Loading facilities...</div>
      ) : facilities.length === 0 ? (
        <div className="empty-message">No facilities yet. Add one to get started.</div>
      ) : (
        <FacilitiesGrid 
          facilities={facilities} 
          onEdit={handleEditFacility}
          adminSub={adminSub}
        />
      )}

      <FacilityModal
        isOpen={modalOpen}
        facility={selectedFacility}
        onClose={handleCloseModal}
        adminSub={adminSub}
      />
    </div>
  );
}
