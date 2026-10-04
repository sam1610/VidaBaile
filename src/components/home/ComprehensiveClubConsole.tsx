import { useEffect, useState } from 'react';
import React from 'react';
import { Badge } from './components/Badge';
import { AgentAIDock } from './dock/AgentAIDock';
import DatabaseService from '../../services/DatabaseService';
import { useAdminSub } from '../../hooks';
import './ComprehensiveClubConsole.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  text: string;
  ts: string;     // ISO — used for sort
  icon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns the YYYY-MM-DD seven days from today */
function sevenDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

/** Format ISO timestamp as "Sep 17, 2026 · 14:30" */
function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ComprehensiveClubConsole: React.FC = () => {
  const { adminSub } = useAdminSub();

  // ── Metric state ────────────────────────────────────────────────────────────
  const [activeMembers,   setActiveMembers]   = useState<number | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<number | null>(null);
  const [bookingsToday,   setBookingsToday]   = useState<number | null>(null);
  const [loadingMetrics,  setLoadingMetrics]  = useState(true);

  // ── Recent activity feed ────────────────────────────────────────────────────
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedClub, setSelectedClub] = useState('club-001');
  const [searchQuery,  setSearchQuery]  = useState('');

  const today = todayStr();

  // ── Active members (one-shot query) ─────────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.queryActiveMembersRecord(adminSub)
      .then((members) => {
        setActiveMembers(members.length);
      })
      .catch((err) => {
        console.error('[Home] queryActiveMembersRecord failed:', err);
        setActiveMembers(0);
      });
  }, [adminSub]);

  // ── Schedules subscription → upcoming classes + bookings today + activity ────
  useEffect(() => {
    if (!adminSub) return;

    setLoadingMetrics(true);

    // Subscribe to schedules over the next 7 days
    const unsubscribe = DatabaseService.observeSchedulesByDateRange(
      adminSub,
      today,
      sevenDaysFromNow(),
      (scheduleItems: any[]) => {
        const schedules = scheduleItems.filter(
          (s: any) => s.entityType === 'SCHEDULE' && s.sk?.startsWith('SCHEDULE#')
        );

        // Upcoming = all schedules with date >= today
        const upcoming = schedules.filter(
          (s: any) => s.date && s.date >= today
        );
        setUpcomingClasses(upcoming.length);

        // Bookings today = schedules whose date equals today
        const todayClasses = schedules.filter((s: any) => s.date === today);
        setBookingsToday(todayClasses.length);

        // Build activity items from recently-created schedules
        const scheduleActivity: ActivityItem[] = schedules
          .filter((s: any) => s.createdAt)
          .map((s: any) => ({
            id:   s.sk,
            text: `New class "${s.activityType || 'Activity'}" scheduled for ${s.date ?? '—'}`,
            ts:   s.createdAt,
            icon: '📅',
          }));

        setRecentActivity((prev) => mergeActivity(prev, scheduleActivity, 'schedule'));
        setLoadingMetrics(false);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSub, today]);

  // ── Members subscription → recent joins in activity feed ────────────────────
  useEffect(() => {
    if (!adminSub) return;

    const unsubscribe = DatabaseService.observeMembers(
      adminSub,
      (members: any[]) => {
        const joinActivity: ActivityItem[] = members
          .filter((m: any) => m.createdAt)
          .map((m: any) => ({
            id:   m.sk,
            text: `New member ${m.name || m.phone || 'Unknown'} joined ${m.tier ?? 'STANDARD'} tier`,
            ts:   m.createdAt,
            icon: '👤',
          }));

        setRecentActivity((prev) => mergeActivity(prev, joinActivity, 'member'));
      }
    );

    return () => unsubscribe();
  }, [adminSub]);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const handleRefresh = () => {
    // Force refetch by clearing and letting effects re-run on next adminSub cycle
    setActiveMembers(null);
    setUpcomingClasses(null);
    setBookingsToday(null);
    setRecentActivity([]);
    if (adminSub) {
      DatabaseService.queryActiveMembersRecord(adminSub)
        .then((m) => setActiveMembers(m.length))
        .catch(() => setActiveMembers(0));
    }
  };

  // Top-10 most recent items, sorted descending by timestamp
  const topActivity = [...recentActivity]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 10);

  return (
    <div className="home-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="header-title">🎵 La Vida Dance Studio</h1>
          <div className="header-branch-selector">
            <label htmlFor="club-select">Multi-Branches:</label>
            <select
              id="club-select"
              value={selectedClub}
              onChange={(e) => setSelectedClub(e.target.value)}
            >
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
        {/* Quick Stats Grid — 3 columns, no Revenue card */}
        <div className="quick-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Active Members</div>
            <div className="stat-value">
              {loadingMetrics || activeMembers === null ? '…' : activeMembers}
            </div>
            <Badge variant="success" text="Live" size="small" />
          </div>

          <div className="stat-card">
            <div className="stat-label">Upcoming Classes</div>
            <div className="stat-value">
              {loadingMetrics || upcomingClasses === null ? '…' : upcomingClasses}
            </div>
            <Badge variant="primary" text="Next 7 days" size="small" />
          </div>

          <div className="stat-card">
            <div className="stat-label">Classes Today</div>
            <div className="stat-value">
              {loadingMetrics || bookingsToday === null ? '…' : bookingsToday}
            </div>
            <Badge variant="info" text="Today" size="small" />
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="dashboard-layout">
          {/* Left: Main Content */}
          <div className="dashboard-main">
            <div className="dashboard-section">
              <h2 className="section-title">📊 Overview</h2>
              <p style={{ color: '#666', fontSize: '12px' }}>
                Select a tab above to view Activities, Facilities, Appointments, Packages,
                Members, and Marketing campaigns.
              </p>
            </div>

            <div className="dashboard-section">
              <h2 className="section-title">🔄 Recent Activity</h2>
              {topActivity.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>
                  No recent activity yet.
                </p>
              ) : (
                <ul style={{ fontSize: '12px', color: '#555', lineHeight: 1.9, paddingLeft: '16px', margin: 0 }}>
                  {topActivity.map((item) => (
                    <li key={item.id} style={{ marginBottom: '4px' }}>
                      <span style={{ marginRight: '6px' }}>{item.icon}</span>
                      <span>{item.text}</span>
                      <span style={{ color: '#bbb', marginLeft: '8px', fontSize: '10px' }}>
                        {fmtTs(item.ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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

// ── Merge helper ──────────────────────────────────────────────────────────────
// Replace all items from a given source category, keeping items from other sources.
// This prevents duplicates when a subscription re-fires with the same data.
function mergeActivity(
  prev:     ActivityItem[],
  incoming: ActivityItem[],
  sourcePrefix: string
): ActivityItem[] {
  // Tag incoming items with a source prefix so dedup is per-category
  const tagged = incoming.map((i) => ({ ...i, id: `${sourcePrefix}::${i.id}` }));
  const kept   = prev.filter((i) => !i.id.startsWith(`${sourcePrefix}::`));
  return [...kept, ...tagged];
}
