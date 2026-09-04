import React from 'react';
import { KPIBox } from '../components/KPIBox';

export const FinancialsPanel: React.FC = () => {
  return (
    <div className="panel">
      <h3 className="panel-title">💰 FINANCIALS & POS</h3>
      <div className="panel-content">
        <div className="kpi-grid">
          <KPIBox title="Total Revenue" value="$12.5k" unit="This Month" trend="up" trendPercent={12} color="success" />
          <KPIBox title="Active Packages" value="42" unit="Active" trend="neutral" color="primary" />
          <KPIBox title="Avg Credits Left" value="8.3" unit="per Package" trend="down" trendPercent={5} color="warning" />
          <KPIBox
            title="Expiring This Week"
            value="5"
            unit="Packages"
            trend="down"
            trendPercent={2}
            color="danger"
          />
        </div>
      </div>
    </div>
  );
};
