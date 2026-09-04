import React from 'react';

const mockFacilities = [
  { name: 'La Vida Hall', capacity: 40, occupancy: 28, occupancyPercent: 70 },
  { name: 'Hall 2', capacity: 25, occupancy: 12, occupancyPercent: 48 },
  { name: 'Hall 3', capacity: 30, occupancy: 24, occupancyPercent: 80 },
];

export const FacilitiesPanel: React.FC = () => {
  const getOccupancyColor = (percent: number) => {
    if (percent >= 80) return 'critical';
    if (percent >= 50) return 'warning';
    return 'normal';
  };

  return (
    <div className="panel">
      <h3 className="panel-title">🏛️ FACILITIES & ROOMS</h3>
      <div className="panel-content">
        <div className="facilities-grid">
          {mockFacilities.map((facility) => (
            <div key={facility.name} className="facility-card">
              <div className="facility-name">{facility.name}</div>
              <div className="occupancy-bar">
                <div
                  className={`occupancy-fill ${getOccupancyColor(facility.occupancyPercent)}`}
                  style={{ width: `${facility.occupancyPercent}%` }}
                ></div>
              </div>
              <div className="occupancy-text">
                {facility.occupancy}/{facility.capacity} ({facility.occupancyPercent}%)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
