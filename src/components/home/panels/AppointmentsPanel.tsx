import React from 'react';
import { Badge } from '../components/Badge';

const mockCoaches = [
  { name: 'Clara', specialty: 'Salsa Gold', status: 'ACTIVE', phone: '+1-555-001' },
  { name: 'Juan', specialty: 'Bachata Adv', status: 'ACTIVE', phone: '+1-555-002' },
  { name: 'Maria', specialty: 'Merengue', status: 'ACTIVE', phone: '+1-555-003' },
  { name: 'Pedro', specialty: 'Salsa Basics', status: 'INACTIVE', phone: '+1-555-004' },
  { name: 'Sofia', specialty: 'Contemporary', status: 'ACTIVE', phone: '+1-555-005' },
];

export const AppointmentsPanel: React.FC = () => {
  return (
    <div className="panel">
      <h3 className="panel-title">👥 COACHES & TRAINERS</h3>
      <div className="panel-content">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialty</th>
              <th>Status</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {mockCoaches.map((coach) => (
              <tr key={coach.name}>
                <td style={{ fontWeight: 600 }}>{coach.name}</td>
                <td>{coach.specialty}</td>
                <td>
                  <Badge
                    variant={coach.status === 'ACTIVE' ? 'success' : 'warning'}
                    text={coach.status}
                    size="small"
                  />
                </td>
                <td>
                  <a href={`tel:${coach.phone}`} style={{ color: '#2e3b50', textDecoration: 'none', fontSize: '10px' }}>
                    📱 Call
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
