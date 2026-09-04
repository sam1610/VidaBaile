import { FacilityCard } from './FacilityCard';
import type { Facility } from '../../lib/models';
import './FacilitiesGrid.css';

interface FacilitiesGridProps {
  facilities: Facility[];
  onEdit: (facility: Facility) => void;
  adminSub: string;
}

/**
 * FacilitiesGrid: Responsive grid layout for facility cards
 */
export function FacilitiesGrid({ facilities, onEdit, adminSub }: FacilitiesGridProps) {
  return (
    <div className="facilities-grid">
      {facilities.map((facility) => (
        <FacilityCard
          key={facility.sk}
          facility={facility}
          onEdit={onEdit}
          adminSub={adminSub}
        />
      ))}
    </div>
  );
}
