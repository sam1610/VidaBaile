import { useState, useEffect, useRef } from 'react';
import { View, Heading } from '@aws-amplify/ui-react';
import { DataSeeder } from '../dev/DataSeeder';
import { Badge } from '../home/components/Badge';
import { FacilitiesManager } from './FacilitiesManager';
import DatabaseService from '../../services/DatabaseService';
import { useAdminSub } from '../../hooks';

const intents = [
  { name: 'BOOK_COACH',       description: 'Book a coaching session',   enabled: true },
  { name: 'PAY_PACKAGE',      description: 'Purchase or renew membership', enabled: true },
  { name: 'POSTPONE_SESSION', description: 'Reschedule a booking',       enabled: true },
  { name: 'QUERY_MEMBERSHIP', description: 'Check membership status',    enabled: true },
];

export function SettingsTab() {
  const { adminSub } = useAdminSub();

  // ── Studio Branding state ─────────────────────────────────────────────────
  const [clubName,      setClubName]      = useState('');
  const [logoBase64,    setLogoBase64]    = useState('');
  const [logoPreview,   setLogoPreview]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load existing PROFILE on mount ───────────────────────────────────────
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

  // ── Handle file pick → Base64 conversion ─────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMsg({ text: 'Please select an image file.', ok: false });
      return;
    }
    if (file.size > 500 * 1024) {
      setProfileMsg({ text: 'Image must be smaller than 500 KB.', ok: false });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setLogoBase64(b64);
      setLogoPreview(b64);
      setProfileMsg(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Save PROFILE ──────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!adminSub) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await DatabaseService.updateProfileRecord(adminSub, {
        clubName,
        logoBase64,
      });
      setProfileMsg({ text: 'Studio profile saved successfully.', ok: true });
    } catch (err) {
      setProfileMsg({
        text: err instanceof Error ? err.message : 'Failed to save profile.',
        ok: false,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View padding="medium" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Studio Branding & Logo ─────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
      }}>
        <Heading level={3} style={{ marginTop: 0, marginBottom: '16px' }}>
          🎨 Studio Branding &amp; Logo
        </Heading>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Logo preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Studio logo preview"
                style={{
                  width: '80px', height: '80px',
                  borderRadius: '10px', objectFit: 'cover',
                  border: '2px solid #e0e0e0',
                }}
              />
            ) : (
              <div style={{
                width: '80px', height: '80px',
                borderRadius: '10px', background: '#f5f5f5',
                border: '2px dashed #ddd',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '28px',
              }}>
                🎵
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontSize: '11px', padding: '4px 10px',
                background: '#f0f0f0', border: '1px solid #ddd',
                borderRadius: '4px', cursor: 'pointer',
              }}
            >
              {logoPreview ? 'Change' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoChange}
            />
          </div>

          {/* Club name input */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{
              display: 'block', fontSize: '12px',
              fontWeight: '600', color: '#555', marginBottom: '6px',
            }}>
              Studio / Club Name
            </label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="e.g. La Vida Dance Studio"
              style={{
                width: '100%', padding: '8px 10px',
                border: '1px solid #ddd', borderRadius: '4px',
                fontSize: '13px', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              This name and logo appear in the Home dashboard header.
            </p>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile || !adminSub}
              style={{
                marginTop: '10px',
                padding: '7px 16px',
                background: savingProfile ? '#aaa' : '#2e3b50',
                color: '#fff', border: 'none',
                borderRadius: '4px', cursor: savingProfile ? 'not-allowed' : 'pointer',
                fontSize: '12px', fontWeight: '600',
              }}
            >
              {savingProfile ? 'Saving…' : '💾 Save Profile & Logo'}
            </button>

            {profileMsg && (
              <p style={{
                marginTop: '8px', fontSize: '11px',
                color: profileMsg.ok ? '#27ae60' : '#c62828',
                fontWeight: '500',
              }}>
                {profileMsg.ok ? '✓ ' : '✗ '}{profileMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Facilities Management ─────────────────────────────────────────── */}
      <div>
        <FacilitiesManager />
      </div>

      {/* ── Agent AI Config & Reports ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <Heading level={3}>🤖 Agentic AI Configuration</Heading>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Status:</span>
            <Badge variant="success" text="ONLINE" size="small" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {intents.map((intent) => (
              <div key={intent.name} style={{
                padding: '12px', background: '#f9f9f9',
                border: '1px solid #e0e0e0', borderRadius: '4px',
              }}>
                <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '4px', color: '#2e3b50' }}>
                  {intent.name}
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>
                  {intent.description}
                </div>
                <Badge
                  variant={intent.enabled ? 'success' : 'warning'}
                  text={intent.enabled ? 'Enabled' : 'Disabled'}
                  size="small"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <Heading level={3}>📊 Performance Reports</Heading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'ATTENDANCE RATE',    value: '85%',  note: 'This Week',  color: '#27ae60' },
              { label: 'RETENTION RATE',     value: '92%',  note: 'This Month', color: '#27ae60' },
              { label: 'AVG CLASSES/MEMBER', value: '3.2',  note: 'Per Week',   color: '#2e3b50' },
              { label: 'POPULAR ACTIVITY',   value: 'Salsa',note: '35 bookings',color: '#2e3b50' },
            ].map(({ label, value, note, color }) => (
              <div key={label} style={{
                padding: '12px', background: '#f9f9f9',
                borderRadius: '4px', border: '1px solid #e0e0e0',
              }}>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
                <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>{note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Development Tools ─────────────────────────────────────────────── */}
      <div>
        <Heading level={3}>🌱 Development Tools</Heading>
        <DataSeeder />
      </div>
    </View>
  );
}
