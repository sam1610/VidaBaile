import { View, Heading } from '@aws-amplify/ui-react';
import { DataSeeder } from '../dev/DataSeeder';
import { Badge } from '../home/components/Badge';
import { FacilitiesManager } from './FacilitiesManager';

const intents = [
  { name: 'BOOK_COACH', description: 'Book a coaching session', enabled: true },
  { name: 'PAY_PACKAGE', description: 'Purchase or renew membership', enabled: true },
  { name: 'POSTPONE_SESSION', description: 'Reschedule a booking', enabled: true },
  { name: 'QUERY_MEMBERSHIP', description: 'Check membership status', enabled: true },
];

export function SettingsTab() {
  return (
    <View padding="medium" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Facilities Management */}
      <div>
        <FacilitiesManager />
      </div>

      {/* Agent AI Config & Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Left: Agent AI Config */}
        <div>
          <Heading level={3}>🤖 Agentic AI Configuration</Heading>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Status:</span>
            <Badge variant="success" text="ONLINE" size="small" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {intents.map((intent) => (
              <div
                key={intent.name}
                style={{
                  padding: '12px',
                  background: '#f9f9f9',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '4px', color: '#2e3b50' }}>
                  {intent.name}
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>{intent.description}</div>
                <Badge variant={intent.enabled ? 'success' : 'warning'} text={intent.enabled ? 'Enabled' : 'Disabled'} size="small" />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Reports */}
        <div>
          <Heading level={3}>📊 Performance Reports</Heading>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>ATTENDANCE RATE</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#27ae60' }}>85%</div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>This Week</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>RETENTION RATE</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#27ae60' }}>92%</div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>This Month</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>AVG CLASSES/MEMBER</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#2e3b50' }}>3.2</div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>Per Week</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>POPULAR ACTIVITY</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#2e3b50' }}>Salsa</div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>35 bookings</div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Width: Data Seeder */}
      <div>
        <Heading level={3}>🌱 Development Tools</Heading>
        <DataSeeder />
      </div>
    </View>
  );
}
