import { useState } from 'react';
import { deleteFacilityRecord } from '../../services/DatabaseService';
import type { Facility } from '../../lib/models';
import './FacilityCard.css';

interface FacilityCardProps {
  facility: Facility;
  onEdit: (facility: Facility) => void;
  adminSub: string;
}

/**
 * FacilityCard: Individual facility card with occupancy visualization
 */
export function FacilityCard({ facility, onEdit, adminSub }: FacilityCardProps) {
  const [deleting, setDeleting] = useState(false);

  const occupancyPercent = facility.capacity 
    ? Math.round(((facility.currentOccupancy || 0) / facility.capacity) * 100)
    : 0;

  const occupancyColor = 
    occupancyPercent <= 50 ? '#27ae60' :
    occupancyPercent <= 75 ? '#f39c12' :
    '#e74c3c';

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${facility.name}"? This cannot be undone.`)) return;
    
    setDeleting(true);
    try {
      const facilityId = facility.sk?.replace('FACILITY#', '');
      if (facilityId) {
        await deleteFacilityRecord(adminSub, facilityId);
        console.log('[FacilityCard] Facility deleted:', facility.name);
      }
    } catch (error) {
      console.error('[FacilityCard] Delete failed:', error);
      alert('Failed to delete facility');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="facility-card">
      <div className="card-header">
        <h4>{facility.name}</h4>
        <div className="card-actions">
          <button
            className="icon-btn edit-btn"
            onClick={() => onEdit(facility)}
            title="Edit facility"
            disabled={deleting}
          >
            ✏️
          </button>
          <button
            className="icon-btn delete-btn"
            onClick={handleDelete}
            title="Delete facility"
            disabled={deleting}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="card-body">
        <div className="facility-info">
          <div className="info-row">
            <span className="label">Capacity:</span>
            <span className="value">{facility.capacity} people</span>
          </div>
          <div className="info-row">
            <span className="label">Location:</span>
            <span className="value">{facility.location}</span>
          </div>
          {facility.description && (
            <div className="info-row">
              <span className="label">Description:</span>
              <span className="value">{facility.description}</span>
            </div>
          )}
        </div>

        <div className="occupancy-section">
          <div className="occupancy-header">
            <span className="label">Occupancy</span>
            <span className="percentage" style={{ color: occupancyColor }}>
              {occupancyPercent}%
            </span>
          </div>
          <div className="occupancy-bar">
            <div
              className="occupancy-fill"
              style={{
                width: `${occupancyPercent}%`,
                backgroundColor: occupancyColor,
              }}
            />
          </div>
          <div className="occupancy-text">
            {facility.currentOccupancy || 0} / {facility.capacity} people
          </div>
        </div>

        <div className="status-badge" style={{
          backgroundColor: facility.status === 'ACTIVE' ? '#d4edda' : 
                          facility.status === 'MAINTENANCE' ? '#fff3cd' : '#f8f9fa',
          color: facility.status === 'ACTIVE' ? '#155724' : 
                 facility.status === 'MAINTENANCE' ? '#856404' : '#666',
        }}>
          {facility.status}
        </div>
      </div>
    </div>
  );
}
