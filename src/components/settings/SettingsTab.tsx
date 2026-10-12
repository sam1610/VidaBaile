import { useState, useEffect, useRef } from 'react';
import { View, Heading } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { Badge } from '../home/components/Badge';
import { FacilitiesManager } from './FacilitiesManager';
import DatabaseService from '../../services/DatabaseService';
import { useAdminSub } from '../../hooks';

interface PerformanceMetrics {
  attendanceRate: string;
  retentionRate: string;
  avgClassesPerMember: string;
  popularActivity: string;
  popularActivityCount: number;
}

function computeMetrics(bookings: any[], schedules: any[]): PerformanceMetrics {
  const freq: Record<string, number> = {};
  for (const b of bookings) {
    const label =
      (b.activityType && b.activityType.trim() && b.activityType !== 'Package Enrollment')
        ? b.activityType.trim()
        : b.packageId
          ? b.packageId.replace('CATALOG#', '')
          : null;
    if (label) freq[label] = (freq[label] ?? 0) + 1;
  }
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const [popularActivity, popularCount] = entries[0] ?? ['---', 0];

  const confirmedBookings = bookings.filter(
    (b) => b.status === 'CONFIRMED' || b.scheduleId
  ).length;
  const totalCapacity = schedules.reduce(
    (sum, s) => sum + (Number(s.capacity) || 0), 0
  );
  const attendanceRate = totalCapacity > 0
    ? `${Math.round((confirmedBookings / totalCapacity) * 100)}%`
    : '---';

  const uniqueMembers = new Set(
    bookings
      .filter((b) => b.status === 'CONFIRMED' || b.scheduleId)
      .map((b) => b.phone || b.memberPhone)
      .filter(Boolean)
  );
  const avgClasses = uniqueMembers.size > 0
    ? (confirmedBookings / uniqueMembers.size).toFixed(1)
    : '---';

  const bookingsPerMember: Record<string, number> = {};
  for (const b of bookings) {
    if (b.status !== 'CONFIRMED' && !b.scheduleId) continue;
    const id = b.phone || b.memberPhone;
    if (id) bookingsPerMember[id] = (bookingsPerMember[id] ?? 0) + 1;
  }
  const repeating = Object.values(bookingsPerMember).filter((n) => n > 1).length;
  const retentionRate = uniqueMembers.size > 0
    ? `${Math.round((repeating / uniqueMembers.size) * 100)}%`
    : '---';

  return { attendanceRate, retentionRate, avgClassesPerMember: avgClasses, popularActivity, popularActivityCount: popularCount };
}

export function SettingsTab() {
  const { adminSub } = useAdminSub();

  const [clubName,      setClubName]      = useState('');
  const [logoBase64,    setLogoBase64]    = useState('');
  const [logoPreview,   setLogoPreview]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [metrics,        setMetrics]        = useState<PerformanceMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (!adminSub) return;
    DatabaseService.getProfileRecord(adminSub)
      .then(({ clubName: cn, logoBase64: lb }) => {
        setClubName(cn ?? '');
        setLogoBase64(lb ?? '');
        setLogoPreview(lb ?? '');
      })
      .catch((err) => console.warn('[Settings] getProfileRecord failed:', err));
  }, [adminSub]);

  useEffect(() => {
    if (!adminSub) return;
    setMetricsLoading(true);
    const client = generateClient<Schema>();
    const fetchAll = async () => {
      try {
        const [bookingRes, scheduleRes] = await Promise.all([
          (client.models as any).ClubRecord.list({
            filter: { and: [{ pk: { eq: adminSub } }, { entityType: { eq: 'BOOKING' } }] },
          }),
          (client.models as any).ClubRecord.list({
            filter: { and: [{ pk: { eq: adminSub } }, { entityType: { eq: 'SCHEDULE' } }] },
          }),
        ]);
        setMetrics(computeMetrics(bookingRes.data ?? [], scheduleRes.data ?? []));
      } catch (err) {
        console.error('[Settings] metrics fetch failed:', err);
        setMetrics(null);
      } finally {
        setMetricsLoading(false);
      }
    };
    fetchAll();
  }, [adminSub]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProfileMsg({ text: 'Please select an image file.', ok: false }); return; }
    if (file.size > 500 * 1024) { setProfileMsg({ text: 'Image must be smaller than 500 KB.', ok: false }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setLogoBase64(b64); setLogoPreview(b64); setProfileMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!adminSub) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await DatabaseService.updateProfileRecord(adminSub, { clubName, logoBase64 });
      setProfileMsg({ text: 'Studio profile saved successfully.', ok: true });
    } catch (err) {
      setProfileMsg({ text: err instanceof Error ? err.message : 'Failed to save profile.', ok: false });
    } finally {
      setSavingProfile(false);
    }
  };

  const Spinner = () => <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>Loading...</span>;

  return (
    <View padding="medium" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Studio Branding */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
        <Heading level={3} style={{ marginTop: 0, marginBottom: '16px' }}>
          Studio Branding &amp; Logo
        </Heading>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {logoPreview ? (
              <img src={logoPreview} alt="Studio logo preview"
                style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #e0e0e0' }} />
            ) : (
              <div style={{ width: '80px', height: '80px', borderRadius: '10px', background: '#f5f5f5',
                border: '2px dashed #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
                🎵
              </div>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: '11px', padding: '4px 10px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
              {logoPreview ? 'Change' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
              Studio / Club Name
            </label>
            <input type="text" value={clubName} onChange={(e) => setClubName(e.target.value)}
              placeholder="e.g. La Vida Dance Studio"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>This name and logo appear in the Home dashboard header.</p>
            <button type="button" onClick={handleSaveProfile} disabled={savingProfile || !adminSub}
              style={{ marginTop: '10px', padding: '7px 16px', background: savingProfile ? '#aaa' : '#2e3b50',
                color: '#fff', border: 'none', borderRadius: '4px', cursor: savingProfile ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}>
              {savingProfile ? 'Saving...' : 'Save Profile & Logo'}
            </button>
            {profileMsg && (
              <p style={{ marginTop: '8px', fontSize: '11px', color: profileMsg.ok ? '#27ae60' : '#c62828', fontWeight: '500' }}>
                {profileMsg.ok ? 'Saved. ' : 'Error: '}{profileMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Facilities Management */}
      <div><FacilitiesManager /></div>

      {/* AI Status + Performance Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        <div>
          <Heading level={3}>Agentic AI</Heading>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Status:</span>
            <Badge variant="success" text="ONLINE" size="small" />
          </div>
          <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            The WhatsApp AI agent is active and handling member requests.
          </p>
        </div>

        <div>
          <Heading level={3}>Performance Reports</Heading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>ATTENDANCE RATE</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#27ae60' }}>
                {metricsLoading ? <Spinner /> : (metrics?.attendanceRate ?? '---')}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>Confirmed vs total capacity</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>RETENTION RATE</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#27ae60' }}>
                {metricsLoading ? <Spinner /> : (metrics?.retentionRate ?? '---')}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>Members with repeat bookings</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>AVG CLASSES / MEMBER</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#2e3b50' }}>
                {metricsLoading ? <Spinner /> : (metrics?.avgClassesPerMember ?? '---')}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>Confirmed bookings per unique member</div>
            </div>

            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>POPULAR ACTIVITY</div>
              <div style={{
                fontSize: metrics && metrics.popularActivity.length > 12 ? '13px' : '18px',
                fontWeight: '700', color: '#2e3b50',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {metricsLoading ? <Spinner /> : (metrics?.popularActivity ?? '---')}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                {metricsLoading || !metrics ? '' :
                  `${metrics.popularActivityCount} booking${metrics.popularActivityCount !== 1 ? 's' : ''}`}
              </div>
            </div>

          </div>
        </div>
      </div>

    </View>
  );
}
