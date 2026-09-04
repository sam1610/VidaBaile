import { useEffect, useState } from 'react';
import { getAdminSub } from '../../lib/auth-utils';
import { observeFacilitiesRecord } from '../../services/DatabaseService';
import './FacilitiesTab.css';

interface Facility {
  facilityId: string;
  name: string;
  capacity: number;
  currentOccupancy: number;
  location: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
}

const getOccupancyColor = (percent: number) => {
  if (percent >= 80) return '#e74c3c';
  if (percent >= 50) return '#f39c12';
  return '#27ae60';
};

/**
 * Determine availability based on occupancy
 * UNAVAILABLE if occupancy >= 90% of capacity
 * AVAILABLE otherwise
 */
const isAvailable = (occupancy: number, capacity: number): boolean => {
  const occupancyPercent = (occupancy / capacity) * 100;
  return occupancyPercent < 90;
};

export const FacilitiesTab = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const initializeSubscription = async () => {
      try {
        const adminSub = await getAdminSub();
        if (!adminSub) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Subscribe to real-time facility updates (GSI1 - NO TABLE SCAN)
        unsubscribe = observeFacilitiesRecord(adminSub, (data: any[]) => {
          // Filter to only FACILITY entities
          const facilityList = data
            .filter((item) => item.entityType === 'FACILITY' && item.sk?.startsWith('FACILITY#'))
            .map((item) => ({
              facilityId: item.facilityId || item.sk.replace(/^FACILITY#/, ''),
              name: item.name,
              capacity: item.capacity || 0,
              currentOccupancy: item.currentOccupancy || 0,
              location: item.location || '',
              description: item.description || '',
              status: item.status || 'ACTIVE',
            }));

          setFacilities(facilityList);
          setLoading(false);
        });
      } catch (err) {
        console.error('Failed to initialize facility subscription:', err);
        setError(err instanceof Error ? err.message : 'Failed to load facilities');
        setLoading(false);
      }
    };

    initializeSubscription();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>🏛️ FACILITIES & ROOMS</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading facilities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>🏛️ FACILITIES & ROOMS</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#e74c3c' }}>{error}</div>
      </div>
    );
  }

  if (facilities.length === 0) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>🏛️ FACILITIES & ROOMS</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          No facilities configured. Go to Settings to add facilities.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>🏛️ FACILITIES & ROOMS</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {facilities.map((facility) => {
          const occupancyPercent = facility.capacity > 0 ? (facility.currentOccupancy / facility.capacity) * 100 : 0;
          const available = isAvailable(facility.currentOccupancy, facility.capacity);

          return (
            <div
              key={facility.facilityId}
              style={{
                background: 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                padding: '16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                position: 'relative',
              }}
            >
              {/* Availability Status Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#2e3b50' }}>{facility.name}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: available ? '#27ae60' : '#e74c3c',
                    padding: '4px 8px',
                    borderRadius: '3px',
                    background: available ? '#f0f8f4' : '#fef5f5',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{available ? '✓' : '✗'}</span>
                  <span>{available ? 'Available' : 'Unavailable'}</span>
                </div>
              </div>

              {/* Location & Description */}
              {facility.location && (
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                  <strong>Location:</strong> {facility.location}
                </div>
              )}
              {facility.description && (
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                  <strong>Description:</strong> {facility.description}
                </div>
              )}

              {/* Capacity Info */}
              <div style={{ fontSize: '12px', color: '#2e3b50', marginBottom: '12px', fontWeight: '500' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Capacity:</strong> {facility.capacity} people
                </div>
              </div>

              {/* Occupancy Bar */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ color: '#666', fontWeight: '500' }}>Occupancy</span>
                  <span style={{ fontWeight: '600', color: getOccupancyColor(occupancyPercent) }}>
                    {Math.round(occupancyPercent)}%
                  </span>
                </div>
                <div
                  style={{
                    height: '8px',
                    background: '#e0e0e0',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${occupancyPercent}%`,
                      background: getOccupancyColor(occupancyPercent),
                      transition: 'width 0.3s',
                    }}
                  ></div>
                </div>
              </div>

              {/* Current Occupancy */}
              <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: '500', marginBottom: '8px' }}>
                {facility.currentOccupancy} / {facility.capacity} people
              </div>

              {/* Status Badge */}
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  background: facility.status === 'ACTIVE' ? '#f0f8f4' : facility.status === 'INACTIVE' ? '#f5f5f5' : '#fef5f5',
                  color: facility.status === 'ACTIVE' ? '#27ae60' : facility.status === 'INACTIVE' ? '#666' : '#e74c3c',
                  textTransform: 'uppercase',
                }}
              >
                {facility.status}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
