import { useEffect, useState, useRef } from 'react';
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
  ts:   string;   // ISO — used for sort
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

  // Stable date strings — only recomputed when the day actually changes.
  // Using useMemo with no deps means they're computed once per mount.
  // A ref stores the current day so we can detect day-change on re-renders.
  // const today       = useMemo(() => todayStr(),                   []);
  // const sevenAhead  = useMemo(() => sevenDaysLater(today),        [today]);

  // Ref to track current adminSub inside subscriptions without adding it to deps
  const adminSubRef = useRef(adminSub);
  useEffect(() => { adminSubRef.current = adminSub; }, [adminSub]);

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

  // ── Active members count (one-shot) ──────────────────────────────────────
  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.queryActiveMembersRecord(adminSub)
      .then((ms) => setActiveMembers(ms.length))
      .catch(() => setActiveMembers(0));
  }, [adminSub]);

  // ── Unified real-time subscription: SCHEDULE + BOOKING + MEMBER ───────────
  // Single observeQuery covering the whole tenant partition avoids the
  // "stale today reference" tear-down loop and gets all entity types in one
  // subscription, updating metrics and the activity feed together.
  useEffect(() => {
    if (!adminSub) return;
    setLoadingMetrics(true);

    const client = generateClient<Schema>();

    // Subscribe to all ClubRecord items belonging to this admin.
    // Client-side filter is applied in the next() handler.
    const subscription = (client.models as any).ClubRecord.observeQuery({
      filter: { pk: { eq: adminSub } },
    }).subscribe({
      next: ({ items }: { items: any[] }) => {
        const currentToday = todayStr(); // always fresh inside callback

        // ── Metrics from SCHEDULE records ──────────────────────────────────
        const schedules = items.filter(
          (r: any) => r?.entityType === 'SCHEDULE' && r.sk?.startsWith('SCHEDULE#')
        );
        setUpcomingClasses(
          schedules.filter((s: any) => s.date && s.date >= currentToday).length
        );
        setClassesToday(
          schedules.filter((s: any) => s.date === currentToday).length
        );

        // ── Active member count from MEMBER records ────────────────────────
        const members = items.filter(
          (r: any) => r?.entityType === 'MEMBER' && r.status === 'ACTIVE'
        );
        setActiveMembers(members.length);

        // ── Activity feed: SCHEDULE + BOOKING + MEMBER ────────────────────
        const activityItems: ActivityItem[] = items
          .filter((r: any) =>
            r?.entityType === 'SCHEDULE' ||
            r?.entityType === 'BOOKING'  ||
            r?.entityType === 'MEMBER'
          )
          .map(itemToActivity)
          .filter((x): x is ActivityItem => x !== null);

        // Deduplicate by id, then sort by ts desc, cap at 15
        const byId = new Map(activityItems.map((a) => [a.id, a]));
        const sorted = [...byId.values()]
          .sort((a, b) => b.ts.localeCompare(a.ts))
          .slice(0, 15);

        setRecentActivity(sorted);
        setLoadingMetrics(false);
      },
      error: (err: Error) => {
        console.error('[Home] observeQuery error:', err);
        setLoadingMetrics(false);
      },
    });

    return () => {
      subscription.unsubscribe();
    };
    // adminSub is stable per auth session — today/sevenAhead used inside
    // callback with fresh todayStr() call so they don't need to be deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSub]);

  const topActivity = recentActivity.slice(0, 10);

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
          <div className="dashboard-main">
            <div className="dashboard-section">
              <h2 className="section-title">📊 Overview</h2>
              <p style={{ color: '#666', fontSize: '12px' }}>
                Select a tab above to view Activities, Facilities, Appointments,
                Packages, Members, and Marketing campaigns.
              </p>
            </div>

            <div className="dashboard-section">
              <h2 className="section-title">🔄 Recent Activity</h2>
              {loadingMetrics ? (
                <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>
                  Loading…
                </p>
              ) : topActivity.length === 0 ? (
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

          <div className="dashboard-sidebar">
            <AgentAIDock />
          </div>
        </div>
      </div>
    </div>
  );
};
