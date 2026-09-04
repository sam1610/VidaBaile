import React from 'react';
import { Badge } from '../components/Badge';

const mockMembers = [
  { name: 'Maria S.', phone: '+1-555-100', tier: 'VIP', status: 'ACTIVE', joined: 'Jun 17, 2021' },
  { name: 'Alex T.', phone: '+1-555-101', tier: 'Gold', status: 'ACTIVE', joined: 'Jan 27, 2022' },
  { name: 'Alex T.', phone: '(834) 600-6601', tier: 'Silver', status: 'ACTIVE', joined: 'Jun 21, 2021' },
  { name: 'Carlos M.', phone: '+1-555-103', tier: 'Gold', status: 'INACTIVE', joined: 'Mar 15, 2021' },
  { name: 'Diana P.', phone: '+1-555-104', tier: 'Standard', status: 'ACTIVE', joined: 'Sep 10, 2022' },
  { name: 'Emma L.', phone: '+1-555-105', tier: 'Gold', status: 'ACTIVE', joined: 'Nov 5, 2021' },
  { name: 'Frank R.', phone: '+1-555-106', tier: 'Silver', status: 'ACTIVE', joined: 'Aug 22, 2022' },
];

const getTierColor = (tier: string) => {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    VIP: 'danger',
    Gold: 'warning',
    Silver: 'info',
    Standard: 'primary',
  };
  return map[tier] || 'primary';
};

const getStatusIcon = (status: string) => {
  return status === 'ACTIVE' ? '✓' : '✕';
};

export const MembersPanel: React.FC = () => {
  return (
    <div className="panel">
      <h3 className="panel-title">👤 ACTIVE MEMBERS</h3>
      <div className="panel-content">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Tier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mockMembers.map((member, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 500 }}>{member.name}</td>
                <td style={{ fontSize: '10px', color: '#666' }}>{member.phone}</td>
                <td>
                  <Badge variant={getTierColor(member.tier) as any} text={member.tier} size="small" />
                </td>
                <td>
                  <span className={member.status === 'ACTIVE' ? 'text-success' : 'text-muted'}>
                    {getStatusIcon(member.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
