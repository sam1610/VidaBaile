import { useState } from 'react';
import { Badge } from '../home/components/Badge';

const mockCampaigns = [
  {
    id: 1,
    title: 'Salsa Weekend Special',
    message: 'Join us for an exclusive Salsa workshop! 20% off first class.',
    status: 'Sent',
    reach: 234,
    open: 98,
    click: 45,
    date: '2 days ago',
  },
  {
    id: 2,
    title: 'Tango Beginners - New Class',
    message: 'Learn Tango from scratch! New beginner class starts Monday.',
    status: 'Sent',
    reach: 156,
    open: 67,
    click: 23,
    date: '5 days ago',
  },
  {
    id: 3,
    title: 'Member Exclusive Offer',
    message: 'Free trial class for all members with Silver tier or higher.',
    status: 'Sent',
    reach: 189,
    open: 112,
    click: 56,
    date: '1 week ago',
  },
];

export const PRMarketingTab = () => {
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);

  return (
    <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 350px', gap: '16px' }}>
      {/* Campaign List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>📢 MARKETING CAMPAIGNS</h2>
          <button
            style={{
              padding: '8px 16px',
              background: '#2e3b50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            + New Campaign
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mockCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => setSelectedCampaign(campaign.id)}
              style={{
                padding: '14px',
                background: selectedCampaign === campaign.id ? '#e3f2fd' : 'white',
                border: selectedCampaign === campaign.id ? '2px solid #2e3b50' : '1px solid #e0e0e0',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedCampaign !== campaign.id) {
                  e.currentTarget.style.background = '#f9f9f9';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCampaign !== campaign.id) {
                  e.currentTarget.style.background = 'white';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                    {campaign.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{campaign.message}</div>
                </div>
                <Badge variant="success" text="Sent" size="small" />
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#666' }}>
                <span>📊 {campaign.reach} reach</span>
                <span>👁️ {campaign.open} opens</span>
                <span>🔗 {campaign.click} clicks</span>
                <span>{campaign.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Sidebar */}
      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: '700', color: '#2e3b50' }}>CAMPAIGN STATS</h3>
        <div
          style={{
            background: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {selectedCampaign ? (
            <>
              {mockCampaigns
                .filter((c) => c.id === selectedCampaign)
                .map((campaign) => (
                  <div key={campaign.id}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '8px', textTransform: 'uppercase' }}>
                      {campaign.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Reach</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#2e3b50' }}>{campaign.reach}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Open Rate</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#2e3b50' }}>
                          {Math.round((campaign.open / campaign.reach) * 100)}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Click Rate</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#2e3b50' }}>
                          {Math.round((campaign.click / campaign.reach) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </>
          ) : (
            <div style={{ fontSize: '11px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
              Select a campaign to see details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
