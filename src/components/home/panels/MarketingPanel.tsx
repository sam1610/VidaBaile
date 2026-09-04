import React from 'react';

const mockCampaigns = [
  { id: 1, preview: 'Salsa Weekend Special - 20% Off!', sent: '2 days ago', reach: 125, open: '42%', status: 'Sent' },
  { id: 2, preview: 'Tango Beginners Class - New Enrollment', sent: '5 days ago', reach: 89, open: '35%', status: 'Sent' },
  { id: 3, preview: 'Member Exclusive: Free Trial Class', sent: '1 week ago', reach: 234, open: '58%', status: 'Sent' },
];

export const MarketingPanel: React.FC = () => {
  return (
    <div className="panel">
      <h3 className="panel-title">📢 MARKETING & CAMPAIGNS</h3>
      <div className="panel-content">
        <div style={{ marginBottom: '8px' }}>
          <button
            style={{
              padding: '6px 12px',
              background: '#2e3b50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            + New Broadcast
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {mockCampaigns.map((campaign) => (
            <div key={campaign.id} style={{ padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>{campaign.preview}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666' }}>
                <span>{campaign.sent}</span>
                <span>📊 {campaign.reach} reach • {campaign.open} open</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
