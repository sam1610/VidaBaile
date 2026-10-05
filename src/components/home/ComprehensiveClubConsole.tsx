import { useEffect, useState } from 'react';
import React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../hooks/useAppSync';
import { Badge } from './components/Badge';
import { AgentAIDock } from './dock/AgentAIDock';
import DatabaseService from '../../services/DatabaseService';
import { useAdminSub } from '../../hooks';
import './ComprehensiveClubConsole.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id:   string;
  text: string;
  ts:   string;   // ISO — used for sort and date filtering
  icon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}



function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function itemToActivity(item: any): ActivityItem | null {
  const et = item?.entityType;
  const ts = item?.createdAt ?? item?.bookedAt ?? item?.updatedAt;
  if (!ts) return null;

  if (et === 'SCHEDULE') {
    return {
      id:   `schedule::${item.sk}`,
      text: `New class "${item.activityType || 'Activity'}" scheduled for ${item.date ?? '—'}`,
      ts,
      icon: '📅',
    };
  }
  if (et === 'BOOKING') {
    return {
      id:   `booking::${item.sk}`,
      text: `${item.memberPhone || item.phone || 'A member'} enrolled in ${item.activityType || item.scheduleId || 'a class'}`,
      ts,
      icon: '🎟️',
    };
  }
  if (et === 'MEMBER') {
    return {
      id:   `member::${item.sk}`,
      text: `New member ${item.name || item.phone || 'Unknown'} joined ${item.tier ?? 'STANDARD'} tier`,
      ts,
      icon: '👤',
    };
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ComprehensiveClubConsole: React.FC = () => {
  const { adminSub } = useAdminSub();

  // ── Profile ───────────────────────────────────────────────────────────────
  const [clubName,   setClubName]   = useState<string>('My Dance Studio');
  const [logoBase64, setLogoBase64] = useState<string>('');

  // ── Metrics ───────────────────────────────────────────────────────────────
  const [activeMembers,   setActiveMembers]   = useState<number | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<number | null>(null);
  const [classesToday,    setClassesToday]    = useState<number | null>(null);
  const [loadingMetrics,  setLoadingMetrics]  = useState(true);

  // ── Activity feed ─────────────────────────────────────────────────────────
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // ── Date filter state ────────────────────────────────────────────────────
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate,   setFilterEndDate]   = useState<string>('');

  // ── Load PROFILE ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.getProfileRecord(adminSub)
      .then(({ clubName: cn, logoBase64: lb }) => {
        if (cn) setClubName(cn);
        if (lb) setLogoBase64(lb);
      })
      .catch((err) => console.warn('[Home] getProfileRecord failed:', err));
  }, [adminSub]);

  // ── Active members count (one-shot) ───────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.queryActiveMembersRecord(adminSub)
      .then((ms) => setActiveMembers(ms.length))
      .catch(() => setActiveMembers(0));
  }, [adminSub]);

  // ── Unified real-time subscription: SCHEDULE + BOOKING + MEMBER ───────────
  useEffect(() => {
    if (!adminSub) return;
    setLoadingMetrics(true);

    const client = generateClient<Schema>();

    const subscription = (client.models as any).ClubRecord.observeQuery({
      filter: { pk: { eq: adminSub } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const currentToday = todayStr();

        const schedules = items.filter(
          (r: any) => r?.entityType === 'SCHEDULE' && r.sk?.startsWith('SCHEDULE#')
        );
        setUpcomingClasses(
          schedules.filter((s: any) => s.date && s.date >= currentToday).length
        );
        setClassesToday(
          schedules.filter((s: any) => s.date === currentToday).length
        );

        const members = items.filter(
          (r: any) => r?.entityType === 'MEMBER' && r.status === 'ACTIVE'
        );
        setActiveMembers(members.length);

        const activityItems: ActivityItem[] = items
          .filter((r: any) =>
            r?.entityType === 'SCHEDULE' ||
            r?.entityType === 'BOOKING'  ||
            r?.entityType === 'MEMBER'
          )
          .map(itemToActivity)
          .filter((x): x is ActivityItem => x !== null);

        const byId = new Map(activityItems.map((a) => [a.id, a]));
        const sorted = [...byId.values()]
          .sort((a, b) => b.ts.localeCompare(a.ts));

        setRecentActivity(sorted);
        setLoadingMetrics(false);
      },
      error: (err: Error) => {
        console.error('[Home] observeQuery error:', err);
        setLoadingMetrics(false);
      },
    });

    return () => { subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSub]);

  // ── Derive filtered activity list ─────────────────────────────────────────
  // Extract the date part (first 10 chars) from the ISO ts string for comparison.
  const filteredActivity = recentActivity.filter((item) => {
    const date = item.ts.slice(0, 10);
    if (filterStartDate && date < filterStartDate) return false;
    if (filterEndDate   && date > filterEndDate)   return false;
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="home-dashboard">
      {/* Streamlined Header */}
      <div className="dashboard-header" style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff',
      }}>
        {logoBase64 ? (
          <img
            src={logoBase64}
            alt="Studio logo"
            style={{
              width: '44px', height: '44px', borderRadius: '8px',
              objectFit: 'cover', border: '1px solid #e0e0e0',
            }}
          />
        ) : (
          <div style={{
            width: '44px', height: '44px', borderRadius: '8px', background: '#2e3b50',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', flexShrink: 0,
          }}>
            🎵
          </div>
        )}
        <h1 style={{
          margin: 0, fontSize: '17px', fontWeight: '700',
          color: '#2e3b50', letterSpacing: '-0.01em',
        }}>
          {clubName}
        </h1>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {/* KPI cards — 3 columns */}
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
              {loadingMetrics || classesToday === null ? '…' : classesToday}
            </div>
            <Badge variant="info" text="Today" size="small" />
          </div>
        </div>

        {/* Two-column layout */}
        <div className="dashboard-layout">
          {/* Left — Recent Activity (no Overview block) */}
          <div className="dashboard-main">
            <div className="dashboard-section">
              <h2 className="section-title">🔄 Recent Activity</h2>

              {/* Date interval picker */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                flexWrap: 'wrap', marginBottom: '4px',
              }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555' }}>
                  From:
                </label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  style={{
                    padding: '4px 7px', fontSize: '11px',
                    border: '1px solid #ddd', borderRadius: '4px',
                  }}
                />
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555' }}>
                  To:
                </label>
                <input
                  type="date"
                  value={filterEndDate}
                  min={filterStartDate || undefined}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  style={{
                    padding: '4px 7px', fontSize: '11px',
                    border: '1px solid #ddd', borderRadius: '4px',
                  }}
                />
                {(filterStartDate || filterEndDate) && (
                  <button
                    onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
                    style={{
                      padding: '3px 9px', fontSize: '11px',
                      background: '#f0f0f0', border: '1px solid #ddd',
                      borderRadius: '4px', cursor: 'pointer', color: '#555',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Scrollable activity list */}
              <div style={{
                maxHeight:   '500px',
                overflowY:   'auto',
                paddingRight: '10px',
                borderTop:   '1px solid lightgray',
                paddingTop:  '10px',
                marginTop:   '10px',
              }}>
                {loadingMetrics ? (
                  <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>
                    Loading…
                  </p>
                ) : filteredActivity.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>
                    {recentActivity.length > 0
                      ? 'No activity in this date range.'
                      : 'No recent activity yet.'}
                  </p>
                ) : (
                  <ul style={{
                    fontSize: '12px', color: '#555', lineHeight: 1.9,
                    paddingLeft: '16px', margin: 0,
                  }}>
                    {filteredActivity.map((item) => (
                      <li key={item.id} style={{ marginBottom: '4px' }}>
                        <span style={{ marginRight: '6px' }}>{item.icon}</span>
                        <span>{item.text}</span>
                        <span style={{
                          color: '#bbb', marginLeft: '8px', fontSize: '10px',
                        }}>
                          {fmtTs(item.ts)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Right — Agent AI Dock */}
          <div className="dashboard-sidebar">
            <AgentAIDock />
          </div>
        </div>
      </div>
    </div>
  );
};
