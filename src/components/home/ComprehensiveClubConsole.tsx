import { useState } from 'react';
import { Badge } from './components/Badge';
import { AgentAIDock } from './dock/AgentAIDock';
import './ComprehensiveClubConsole.css';

// Quick stats for Home dashboard
const quickStats = {
  activeMembers: 42,
  upcomingClasses: 8,
  bookingsToday: 12,
  totalRevenue: '$12.5k',
};

export const ComprehensiveClubConsole: React.FC = () => {
  const [selectedClub, setSelectedClub] = useState('club-001');
  const [searchQuery, setSearchQuery] = useState('');

  const handleRefresh = () => {
    console.log('Refreshing data...');
  };

  return (
    <div className="home-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="header-title">🎵 La Vida Dance Studio</h1>
          <div className="header-branch-selector">
            <label htmlFor="club-select">Multi-Branches:</label>
            <select id="club-select" value={selectedClub} onChange={(e) => setSelectedClub(e.target.value)}>
              <option value="club-001">Main Branch</option>
              <option value="club-002">Branch B</option>
              <option value="club-003">Branch C</option>
            </select>
          </div>
        </div>

        <div className="header-center">
          <input
            type="text"
            placeholder="Search Clients & Bookings"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="header-search"
          />
        </div>

        <div className="header-right">
          <button className="header-refresh" onClick={handleRefresh}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {/* Quick Stats Grid */}
        <div className="quick-stats-grid">
          <div className="stat-card">
            <div className="stat-label">Active Members</div>
            <div className="stat-value">{quickStats.activeMembers}</div>
            <Badge variant="success" text="Growing" size="small" />
          </div>

          <div className="stat-card">
            <div className="stat-label">Upcoming Classes</div>
            <div className="stat-value">{quickStats.upcomingClasses}</div>
            <Badge variant="primary" text="This Week" size="small" />
          </div>

          <div className="stat-card">
            <div className="stat-label">Bookings Today</div>
            <div className="stat-value">{quickStats.bookingsToday}</div>
            <Badge variant="info" text="On Track" size="small" />
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">{quickStats.totalRevenue}</div>
            <Badge variant="success" text="+12%" size="small" />
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="dashboard-layout">
          {/* Left: Main Content */}
          <div className="dashboard-main">
            <div className="dashboard-section">
              <h2 className="section-title">📊 Overview</h2>
              <p style={{ color: '#666', fontSize: '12px' }}>
                Select a tab above to view detailed information about Activities, Facilities, Appointments, Packages, Members, and Marketing campaigns.
              </p>
            </div>

            <div className="dashboard-section">
              <h2 className="section-title">🔄 Recent Activity</h2>
              <div style={{ fontSize: '12px', color: '#666' }}>
                <ul style={{ lineHeight: 1.8 }}>
                  <li>Maria S. booked Salsa Gold with Coach Clara</li>
                  <li>New member Alex T. joined Silver tier</li>
                  <li>Bachata Beginners class is 85% full</li>
                  <li>Marketing campaign reached 234 members</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right: Agent AI Dock */}
          <div className="dashboard-sidebar">
            <AgentAIDock />
          </div>
        </div>
      </div>
    </div>
  );
};
