import React from 'react';
import { KPIBox } from '../components/KPIBox';

export const ReportsPanel: React.FC = () => {
  return (
    <div className="panel">
      <h3 className="panel-title">📊 REPORTS & ANALYTICS</h3>
      <div className="panel-content">
        <div className="kpi-grid">
          <KPIBox title="Attendance Rate" value="85%" unit="This Week" trend="up" trendPercent={3} color="success" />
          <KPIBox title="Retention Rate" value="92%" unit="This Month" trend="neutral" color="primary" />
          <KPIBox title="Avg Classes per Member" value="3.2" unit="per week" trend="up" trendPercent={5} color="success" />
          <KPIBox title="Popular Activity" value="Salsa" unit="35 bookings" trend="neutral" color="primary" />
        </div>
      </div>
    </div>
  );
};
