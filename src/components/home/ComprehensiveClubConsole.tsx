import { useEffect, useState } from 'react';
import React from 'react';
import { Badge } from './components/Badge';
import { AgentAIDock } from './dock/AgentAIDock';
import DatabaseService from '../../services/DatabaseService';
import { useAdminSub } from '../../hooks';
import './ComprehensiveClubConsole.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id:   string;
  text: string;
  ts:   string;   // ISO — used for sort
  icon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function sevenDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

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

  // ── Profile (club name + logo) ───────────────────────────────────────────
  const [clubName,    setClubName]    = useState<string>('My Dance Studio');
  const [logoBase64,  setLogoBase64]  = useState<string>('');

  // ── Metric state ─────────────────────────────────────────────────────────
  const [activeMembers,   setActiveMembers]   = useState<number | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<number | null>(null);
  const [classesToday,    setClassesToday]    = useState<number | null>(null);
  const [loadingMetrics,  setLoadingMetrics]  = useState(true);

  // ── Recent activity feed ─────────────────────────────────────────────────
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  const today = todayStr();

  // ── Load PROFILE record ───────────────────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.getProfileRecord(adminSub)
      .then(({ clubName: cn, logoBase64: lb }) => {
        if (cn) setClubName(cn);
        if (lb) setLogoBase64(lb);
      })
      .catch((err) => console.warn('[Home] getProfileRecord failed:', err));
  }, [adminSub]);

  // ── Active members ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.queryActiveMembersRecord(adminSub)
      .then((members) => setActiveMembers(members.length))
      .catch((err) => {
        console.error('[Home] queryActiveMembersRecord failed:', err);
        setActiveMembers(0);
      });
  }, [adminSub]);

  // ── Schedules subscription → upcoming + today + activity ─────────────────
  useEffect(() => {
    if (!adminSub) return;
    setLoadingMetrics(true);

    const unsubscribe = DatabaseService.observeSchedulesByDateRange(
      adminSub,
      today,
      sevenDaysFromNow(),
      (scheduleItems: any[]) => {
        const schedules = scheduleItems.filter(
          (s: any) => s.entityType === 'SCHEDULE' && s.sk?.startsWith('SCHEDULE#')
        );
        setUpcomingClasses(schedules.filter((s: any) => s.date && s.date >= today).length);
        setClassesToday(schedules.filter((s: any) => s.date === today).length);

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

  // ── Members subscription → activity feed ─────────────────────────────────
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

  const topActivity = [...recentActivity]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 10);

  return (
    <div className="home-dashboard">
      {/* ── Streamlined Header — logo + club name only ── */}
      <div className="dashboard-header" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 20px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
      }}>
        {/* Logo */}
        {logoBase64 ? (
          <img
            src={logoBase64}
            alt="Studio logo"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              objectFit: 'cover',
              border: '1px solid #e0e0e0',
            }}
          />
        ) : (
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '8px',
            background: '#2e3b50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            flexShrink: 0,
          }}>
            🎵
          </div>
        )}

        <h1 style={{
          margin: 0,
          fontSize: '17px',
          fontWeight: '700',
          color: '#2e3b50',
          letterSpacing: '-0.01em',
        }}>
          {clubName}
        </h1>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {/* Quick Stats Grid — 3 columns */}
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

        {/* Two Column Layout */}
        <div className="dashboard-layout">
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
                <ul style={{
                  fontSize: '12px', color: '#555', lineHeight: 1.9,
                  paddingLeft: '16px', margin: 0,
                }}>
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

          <div className="dashboard-sidebar">
            <AgentAIDock />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Merge helper ──────────────────────────────────────────────────────────────
function mergeActivity(
  prev:         ActivityItem[],
  incoming:     ActivityItem[],
  sourcePrefix: string
): ActivityItem[] {
  const tagged = incoming.map((i) => ({ ...i, id: `${sourcePrefix}::${i.id}` }));
  const kept   = prev.filter((i) => !i.id.startsWith(`${sourcePrefix}::`));
  return [...kept, ...tagged];
}
