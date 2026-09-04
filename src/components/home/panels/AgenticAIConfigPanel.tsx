import React from 'react';
import { Badge } from '../components/Badge';

const intents = [
  { name: 'BOOK_COACH', description: 'Book a coaching session', enabled: true },
  { name: 'PAY_PACKAGE', description: 'Purchase or renew membership', enabled: true },
  { name: 'POSTPONE_SESSION', description: 'Reschedule a booking', enabled: true },
  { name: 'QUERY_MEMBERSHIP', description: 'Check membership status', enabled: true },
];

export const AgenticAIConfigPanel: React.FC = () => {
  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 className="panel-title" style={{ margin: 0 }}>
          🤖 AGENTIC AI CONFIG
        </h3>
        <Badge variant="success" text="ONLINE" size="small" />
      </div>
      <div className="panel-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {intents.map((intent) => (
            <div
              key={intent.name}
              style={{
                padding: '8px',
                background: '#f9f9f9',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '11px', marginBottom: '2px' }}>{intent.name}</div>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>{intent.description}</div>
              <Badge variant={intent.enabled ? 'success' : 'warning'} text={intent.enabled ? 'Enabled' : 'Disabled'} size="small" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
