import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';

const client = generateClient<Schema>();

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  pk: string;
  sk: string;
  campaignId: string;
  name: string;
  broadcastStatus: string;
  launchDateTime?: string;
  validFrom?: string;
  validUntil?: string;
  packageRef?: string;
  promotionalContent?: string;
  campaignKnowledgeBase?: string;
  targetingOptions?: string;
  targetMemberCount?: number;
  createdAt?: string;
}

interface CatalogOption {
  packageId: string;
  name: string;
  packageKnowledgeBase?: string; // auto-fills campaign AI context
}

interface MemberRow {
  phone: string;
  name: string;
  tier: string;
  gender: string;
}

type ModalTab   = 'details' | 'members';
type TierFilter = 'ALL' | 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM';
type GenderFilter = 'ALL' | 'MALE' | 'FEMALE';

interface CampaignForm {
  name: string;
  packageRef: string;
  validFrom: string;
  validUntil: string;
  campaignStatus: 'DRAFT' | 'SCHEDULED';
  launchDateTime: string;
  promotionalContent: string;
  campaignKnowledgeBase: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, [string, string]> = {
  SCHEDULED: ['#dbeafe', '#1e40af'],
  RUNNING:   ['#fef3c7', '#92400e'],
  COMPLETED: ['#d1fae5', '#065f46'],
  DRAFT:     ['#f3f4f6', '#374151'],
};

function StatusBadge({ status }: { status: string }) {
  const [bg, color] = STATUS_MAP[status] ?? ['#f3f4f6', '#374151'];
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '10px',
                   fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
      {status}
    </span>
  );
}

// ── New Campaign Modal ────────────────────────────────────────────────────────

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (form: CampaignForm, selectedPhones: string[]) => Promise<void>;
  catalogs: CatalogOption[];
  adminSub: string;
  isSubmitting: boolean;
}

function NewCampaignModal({
  isOpen, onClose, onSubmit, catalogs, adminSub, isSubmitting,
}: CampaignModalProps) {

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ModalTab>('details');

  // ── Campaign Details form ──────────────────────────────────────────────────
  const defaultForm = (): CampaignForm => ({
    name:                  '',
    packageRef:            '',
    validFrom:             new Date().toISOString().split('T')[0],
    validUntil:            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    campaignStatus:        'SCHEDULED',
    launchDateTime:        '',
    promotionalContent:    '',
    campaignKnowledgeBase: '',
  });

  const [form, setForm]   = useState<CampaignForm>(defaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Target Members state ───────────────────────────────────────────────────
  const [members, setMembers]                   = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading]     = useState(false);
  const membersFetchedRef                       = useRef(false);
  const [search, setSearch]                     = useState('');
  const [tierFilter, setTierFilter]             = useState<TierFilter>('ALL');
  const [genderFilter, setGenderFilter]         = useState<GenderFilter>('ALL');
  const [selectedPhones, setSelectedPhones]     = useState<Set<string>>(new Set());

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('details');
    setForm(defaultForm());
    setErrors({});
    membersFetchedRef.current = false;
    setMembers([]);
    setSearch('');
    setTierFilter('ALL');
    setGenderFilter('ALL');
    setSelectedPhones(new Set());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy-load members when Members tab opens ───────────────────────────────
  useEffect(() => {
    if (activeTab !== 'members' || membersFetchedRef.current || !adminSub) return;
    membersFetchedRef.current = true;
    setMembersLoading(true);
    (async () => {
      try {
        const result = await (client.models as any).ClubRecord.listByGsi1({
          gsi1pk: `${adminSub}#MEMBERS`,
        });
        const rows: MemberRow[] = (result.data ?? [])
          .filter((m: any) => m.entityType === 'MEMBER')
          .map((m: any): MemberRow => ({
            phone:  m.phone ?? m.sk?.replace('MEMBER#', '') ?? '',
            name:   m.name ?? '—',
            tier:   m.tier ?? 'STANDARD',
            gender: (m as any).gender ?? '',
          }));
        setMembers(rows);
      } catch (err) {
        console.error('Failed to fetch members', err);
      } finally {
        setMembersLoading(false);
      }
    })();
  }, [activeTab, adminSub]);

  // ── Auto-fill KB when package changes ─────────────────────────────────────
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'packageRef') {
      const chosen = catalogs.find(c => `CATALOG#${c.packageId}` === value);
      // packageKnowledgeBase is the canonical field; fall back to legacy `description`
      // in case older catalog records were saved before the field rename.
      const kb =
        chosen?.packageKnowledgeBase ||
        (chosen as any)?.description ||
        '';
      setForm(prev => ({
        ...prev,
        packageRef: value,
        campaignKnowledgeBase: kb,
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // ── Filtered members ───────────────────────────────────────────────────────
  const filteredMembers = members.filter(m => {
    if (tierFilter !== 'ALL' && m.tier !== tierFilter) return false;
    if (genderFilter !== 'ALL' && m.gender.toUpperCase() !== genderFilter) return false;
    const q = search.toLowerCase();
    if (q && !m.name.toLowerCase().includes(q) && !m.phone.toLowerCase().includes(q)) return false;
    return true;
  });

  const allFilteredSelected = filteredMembers.length > 0 &&
    filteredMembers.every(m => selectedPhones.has(m.phone));
  const someFilteredSelected = !allFilteredSelected &&
    filteredMembers.some(m => selectedPhones.has(m.phone));

  const toggleMaster = () => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredMembers.forEach(m => next.delete(m.phone));
      else                      filteredMembers.forEach(m => next.add(m.phone));
      return next;
    });
  };
  const toggleRow = (phone: string) => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())              errs.name              = 'Campaign name is required';
    if (!form.packageRef)               errs.packageRef        = 'Select a package';
    if (!form.launchDateTime)           errs.launchDateTime    = 'Launch date & time is required';
    if (!form.promotionalContent.trim()) errs.promotionalContent = 'Message content is required';
    if (!form.validFrom)                errs.validFrom         = 'Valid from is required';
    if (!form.validUntil)               errs.validUntil        = 'Valid until is required';
    if (form.validFrom >= form.validUntil)
      errs.validUntil = 'Valid until must be after valid from';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(form, Array.from(selectedPhones));
  };

  // ── Style helpers ──────────────────────────────────────────────────────────
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: '20px', border: 'none',
    cursor: 'pointer', fontSize: '11px', fontWeight: 600,
    background: active ? '#2e3b50' : '#f0f0f0',
    color:      active ? 'white'   : '#666',
  });

  const tierBadge = (tier: string): React.CSSProperties => {
    const m: Record<string, [string,string]> = {
      PLATINUM: ['#e8d5f5','#7c3aed'], GOLD: ['#fef3c7','#92400e'],
      SILVER:   ['#e5e7eb','#374151'], STANDARD: ['#dbeafe','#1e40af'],
    };
    const [bg, color] = m[tier] ?? ['#dbeafe','#1e40af'];
    return { padding:'2px 8px', borderRadius:'10px', fontSize:'10px', fontWeight:700, background:bg, color };
  };

  const fg = { display:'flex', flexDirection:'column' as const, gap:'4px' };
  const lbl: React.CSSProperties = { fontSize:'12px', fontWeight:600, color:'#2e3b50' };
  const inp: React.CSSProperties = { padding:'8px', border:'1px solid #ddd', borderRadius:'4px',
                                      fontSize:'12px', fontFamily:'inherit' };
  const err: React.CSSProperties = { fontSize:'11px', color:'#e74c3c' };

  if (!isOpen) return null;

  const disabled = isSubmitting;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
                  alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:'4px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)',
                    maxWidth: activeTab === 'members' ? '700px' : '580px', width:'90%',
                    maxHeight:'90vh', overflowY:'auto', transition:'max-width 0.2s ease' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'16px', borderBottom:'1px solid #e0e0e0' }}>
          <h3 style={{ margin:0, fontSize:'14px', fontWeight:700, color:'#2e3b50' }}>
            📢 New Campaign
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
                                             fontSize:'16px', color:'#999' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', borderBottom:'2px solid #e0e0e0' }}>
          {(['details', 'members'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              style={{ padding:'10px 20px', background:'none', border:'none',
                       borderBottom: activeTab === tab ? '2px solid #2e3b50' : '2px solid transparent',
                       marginBottom:'-2px', cursor:'pointer', fontSize:'13px',
                       fontWeight: activeTab === tab ? 700 : 400,
                       color:      activeTab === tab ? '#2e3b50' : '#999' }}>
              {tab === 'details' ? 'Campaign Details' : 'Target Members'}
              {tab === 'members' && selectedPhones.size > 0 && (
                <span style={{ marginLeft:6, background:'#2e3b50', color:'white',
                               borderRadius:'10px', padding:'1px 7px',
                               fontSize:'10px', fontWeight:700 }}>
                  {selectedPhones.size}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ TAB 1: CAMPAIGN DETAILS ══ */}
        {activeTab === 'details' && (
          <form onSubmit={handleSubmit}
            style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>

            {/* Campaign Name */}
            <div style={fg}>
              <label style={lbl}>Campaign Name *</label>
              <input name="name" value={form.name} onChange={handleFormChange}
                placeholder='"Rumba Season Launch"' style={inp} disabled={disabled} />
              {errors.name && <span style={err}>{errors.name}</span>}
            </div>

            {/* Package + Status (2-col) */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={fg}>
                <label style={lbl}>Package *</label>
                <select name="packageRef" value={form.packageRef} onChange={handleFormChange}
                  style={inp} disabled={disabled}>
                  <option value="">Select package…</option>
                  {catalogs.map(c => (
                    <option key={c.packageId} value={`CATALOG#${c.packageId}`}>{c.name}</option>
                  ))}
                </select>
                {errors.packageRef && <span style={err}>{errors.packageRef}</span>}
              </div>
              <div style={fg}>
                <label style={lbl}>Status</label>
                <select name="campaignStatus" value={form.campaignStatus}
                  onChange={handleFormChange} style={inp} disabled={disabled}>
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                </select>
              </div>
            </div>

            {/* Valid From + Valid Until (2-col) */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={fg}>
                <label style={lbl}>Valid From *</label>
                <input type="date" name="validFrom" value={form.validFrom}
                  onChange={handleFormChange} style={inp} disabled={disabled} />
                {errors.validFrom && <span style={err}>{errors.validFrom}</span>}
              </div>
              <div style={fg}>
                <label style={lbl}>Valid Until *</label>
                <input type="date" name="validUntil" value={form.validUntil}
                  onChange={handleFormChange} style={inp} disabled={disabled} />
                {errors.validUntil && <span style={err}>{errors.validUntil}</span>}
              </div>
            </div>

            {/* Launch Date & Time */}
            <div style={fg}>
              <label style={{ ...lbl, color:'#c0392b', fontWeight:700 }}>
                Launch Date &amp; Time *
              </label>
              <input type="datetime-local" name="launchDateTime" value={form.launchDateTime}
                onChange={handleFormChange} style={inp} disabled={disabled} />
              {errors.launchDateTime && <span style={err}>{errors.launchDateTime}</span>}
            </div>

            {/* Message Content */}
            <div style={fg}>
              <label style={lbl}>Message Content *</label>
              <textarea name="promotionalContent" value={form.promotionalContent}
                onChange={handleFormChange} rows={3} style={{ ...inp, resize:'vertical' }}
                placeholder='"🎉 Join us for the Rumba Season! Book now…"'
                disabled={disabled} />
              {errors.promotionalContent && <span style={err}>{errors.promotionalContent}</span>}
            </div>

            {/* AI Context — auto-filled from package, editable */}
            <div style={fg}>
              <label style={lbl}>Description (AI Context)</label>
              <textarea name="campaignKnowledgeBase" value={form.campaignKnowledgeBase}
                onChange={handleFormChange} rows={3} style={{ ...inp, resize:'vertical' }}
                placeholder='Auto-filled from selected package description. Edit for campaign-specific AI context…'
                disabled={disabled} />
              <span style={{ fontSize:'11px', color:'#888' }}>
                Injected into the chatAgent system prompt when a member replies to this campaign.
              </span>
            </div>

            {errors.submit && (
              <div style={{ background:'#f8d7da', border:'1px solid #f5c6cb', borderRadius:'4px',
                            padding:'8px', fontSize:'12px', color:'#721c24' }}>
                {errors.submit}
              </div>
            )}

            <div style={{ display:'flex', gap:'12px', marginTop:'8px' }}>
              <button type="button" onClick={onClose} disabled={disabled}
                style={{ flex:1, padding:'10px', background:'#f0f0f0', border:'1px solid #ddd',
                         borderRadius:'4px', cursor:'pointer', fontWeight:600, fontSize:'12px' }}>
                Cancel
              </button>
              <button type="submit" disabled={disabled}
                style={{ flex:1, padding:'10px', background:'#2e3b50', color:'white',
                         border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:600,
                         fontSize:'12px', opacity: disabled ? 0.6 : 1 }}>
                {isSubmitting ? 'Saving…' : 'Schedule Campaign'}
              </button>
            </div>
          </form>
        )}

        {/* ══ TAB 2: TARGET MEMBERS ══ */}
        {activeTab === 'members' && (
          <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>

            {/* Tier pills */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center' }}>
              <span style={{ fontSize:'11px', fontWeight:600, color:'#2e3b50', marginRight:4 }}>Tier:</span>
              {(['ALL','STANDARD','SILVER','GOLD','PLATINUM'] as const).map(t => (
                <button key={t} type="button" style={pill(tierFilter === t)}
                  onClick={() => setTierFilter(t)}>{t}</button>
              ))}
            </div>

            {/* Gender pills */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center' }}>
              <span style={{ fontSize:'11px', fontWeight:600, color:'#2e3b50', marginRight:4 }}>Gender:</span>
              {(['ALL','MALE','FEMALE'] as const).map(g => (
                <button key={g} type="button" style={pill(genderFilter === g)}
                  onClick={() => setGenderFilter(g)}>{g}</button>
              ))}
            </div>

            {/* Search */}
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone…" style={inp} />

            {/* Selection count */}
            {selectedPhones.size > 0 && (
              <div style={{ fontSize:'11px', color:'#2e3b50', fontWeight:600 }}>
                {selectedPhones.size} member{selectedPhones.size !== 1 ? 's' : ''} selected
              </div>
            )}

            {/* Table */}
            {membersLoading ? (
              <div style={{ color:'#999', fontSize:'13px', textAlign:'center', padding:'24px 0' }}>
                Loading members…
              </div>
            ) : (
              <div style={{ overflowX:'auto', borderRadius:'4px', border:'1px solid #e0e0e0',
                            maxHeight:'320px', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f7f8fa', borderBottom:'1px solid #e0e0e0' }}>
                      <th style={{ padding:'8px 10px', textAlign:'center', width:36 }}>
                        <input type="checkbox" checked={allFilteredSelected}
                          ref={el => { if (el) el.indeterminate = someFilteredSelected; }}
                          onChange={toggleMaster}
                          disabled={filteredMembers.length === 0}
                          aria-label="Select all filtered members" />
                      </th>
                      {['Name','Phone','Tier'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700,
                                             color:'#2e3b50', fontSize:'11px',
                                             textTransform:'uppercase', letterSpacing:'0.04em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding:'20px', textAlign:'center',
                                                  color:'#999', fontSize:'12px' }}>
                          No members match the current filters.
                        </td>
                      </tr>
                    ) : filteredMembers.map((m, idx) => (
                      <tr key={m.phone}
                        style={{
                          background: selectedPhones.has(m.phone)
                            ? 'rgba(46,59,80,0.05)'
                            : idx % 2 === 0 ? 'white' : '#fafafa',
                          borderBottom:'1px solid #f0f0f0', cursor:'pointer',
                        }}
                        onClick={() => toggleRow(m.phone)}>
                        <td style={{ padding:'8px 10px', textAlign:'center' }}>
                          <input type="checkbox" checked={selectedPhones.has(m.phone)}
                            onChange={() => toggleRow(m.phone)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${m.name}`} />
                        </td>
                        <td style={{ padding:'8px 10px', color:'#2e3b50', fontWeight:500 }}>{m.name}</td>
                        <td style={{ padding:'8px 10px', color:'#555', fontFamily:'monospace' }}>{m.phone}</td>
                        <td style={{ padding:'8px 10px' }}>
                          <span style={tierBadge(m.tier)}>{m.tier}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'12px', marginTop:'4px' }}>
              <button type="button" onClick={onClose}
                style={{ padding:'8px 20px', background:'#f0f0f0', border:'1px solid #ddd',
                         borderRadius:'4px', cursor:'pointer', fontWeight:600, fontSize:'12px' }}>
                Cancel
              </button>
              <button type="button" onClick={() => setActiveTab('details')}
                style={{ padding:'8px 20px', background:'#2e3b50', color:'white',
                         border:'none', borderRadius:'4px', cursor:'pointer',
                         fontWeight:600, fontSize:'12px' }}>
                ← Back to Details
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main PR/Marketing Tab ─────────────────────────────────────────────────────

export const PRMarketingTab = () => {
  const { adminSub, loading: adminLoading } = useAdminSub();

  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [catalogs,  setCatalogs]    = useState<CatalogOption[]>([]);
  const [loading,   setLoading]     = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal,  setShowModal]  = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Map raw DynamoDB records to the Campaign type.
  // Handles both new records (created via UI, have gsi1pk) and legacy records
  // (written directly by dispatch Lambda, may lack name/broadcastStatus/gsi keys).
  const mapCampaigns = (data: any[]): Campaign[] => {
    const mapped: Campaign[] = data.map(r => {
      const campaignId = r.sk?.replace('BROADCAST#', '') ?? '';
      // Derive a human-readable name from whatever fields are available
      const displayName =
        r.name ||
        r.promotionalContent?.substring(0, 40) ||
        `Campaign ${campaignId.substring(0, 8)}`;
      // Legacy dispatch records have no broadcastStatus — treat as COMPLETED
      // since they were already dispatched.
      const status = r.broadcastStatus ||
        (r.targetMemberCount ? 'COMPLETED' : 'DRAFT');
      return {
        pk: r.pk, sk: r.sk,
        campaignId,
        name:                  displayName,
        broadcastStatus:       status,
        launchDateTime:        r.launchDateTime,
        validFrom:             r.validFrom,
        validUntil:            r.validUntil,
        packageRef:            r.packageRef || r.packageIntent,  // legacy used packageIntent
        promotionalContent:    r.promotionalContent,
        campaignKnowledgeBase: r.campaignKnowledgeBase,
        targetingOptions:      r.targetingOptions,
        targetMemberCount:     r.targetMemberCount,
        createdAt:             r.createdAt,
      };
    });
    return mapped.sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
  };

  useEffect(() => {
    if (!adminSub) return;

    // ── Step 1: Immediate fetch on mount so data is available instantly ──
    // observeQuery starts with an empty local cache each time the component
    // mounts — doing a direct query first prevents the empty-list flash when
    // navigating back to this tab.
    setLoading(true);
    DatabaseService.queryCampaigns(adminSub).then(data => {
      setCampaigns(mapCampaigns(data));
      setLoading(false);
    }).catch(err => {
      console.error('[PRMarketing] Initial campaign fetch failed:', err);
      setLoading(false);
    });

    // ── Step 2: Live subscription for real-time updates (new saves, status changes)
    const unsub = DatabaseService.observeCampaigns(adminSub, (data: any[]) => {
      // Only update if subscription returns results to avoid overwriting the
      // initial fetch with an empty array on reconnect.
      if (data.length > 0) {
        setCampaigns(mapCampaigns(data));
      }
    });

    return () => unsub();
  }, [adminSub]);

  useEffect(() => {
    if (!adminSub) return;
    // Fetch all catalogs (not just ACTIVE) so any referenced package can be resolved
    DatabaseService.queryAllCatalogsRecord(adminSub).then(rows => {
      setCatalogs(rows
        .filter((r: any) => r.entityType === 'CATALOG')
        .map((r: any) => ({
          packageId: r.packageId ?? r.sk,
          name:      r.name ?? r.sk,
          // Coalesce both field names: new schema uses packageKnowledgeBase,
          // records saved before the rename may still carry description.
          packageKnowledgeBase:
            r.packageKnowledgeBase || r.description || '',
        }))
      );
    });
  }, [adminSub]);

  const handleCreateCampaign = useCallback(async (
    form: CampaignForm,
    selectedPhones: string[]
  ) => {
    if (!adminSub) return;
    setIsSubmitting(true);
    try {
      const campaignId = nanoid();
      // Safe ISO conversion — new Date('') throws RangeError
      const parsedLaunch = form.launchDateTime ? new Date(form.launchDateTime) : null;
      const launchIso = parsedLaunch && !isNaN(parsedLaunch.getTime())
        ? parsedLaunch.toISOString()
        : new Date().toISOString(); // fallback to now if somehow empty

      await DatabaseService.createCampaign(adminSub, {
        campaignId,
        name:                  form.name.trim(),
        packageRef:            form.packageRef,
        launchDateTime:        launchIso,
        validFrom:             form.validFrom  || undefined,  // omit empty string
        validUntil:            form.validUntil || undefined,  // omit empty string
        campaignStatus:        form.campaignStatus,
        targetingOptions: {
          tier:           'ALL',
          gender:         'ALL',
          selectedPhones,
        },
        broadcastType:         'promo_offer',
        promotionalContent:    form.promotionalContent,
        campaignKnowledgeBase: form.campaignKnowledgeBase ?? '', // always include
      });
      setShowModal(false);
    } catch (err) {
      console.error('Failed to create campaign:', err);
      alert(`Failed to schedule campaign: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [adminSub]);

  const filteredCampaigns = statusFilter === 'ALL'
    ? campaigns
    : campaigns.filter(c => c.broadcastStatus === statusFilter);

  const selected = campaigns.find(c => c.campaignId === selectedId);

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' }) : '—';

  const fmtDateShort = (d?: string) =>
    d ? new Date(d).toLocaleDateString(undefined, { dateStyle:'medium' }) : '—';

  const fmtTargeting = (raw?: string) => {
    if (!raw) return 'All members';
    try {
      const t = JSON.parse(raw);
      const parts: string[] = [];
      if (t.tier   && t.tier   !== 'ALL') parts.push(t.tier);
      if (t.gender && t.gender !== 'ALL') parts.push(t.gender);
      if (t.selectedPhones?.length)       parts.push(`${t.selectedPhones.length} specific`);
      return parts.length ? parts.join(' · ') : 'All members';
    } catch { return 'All members'; }
  };

  if (adminLoading) {
    return <div style={{ padding:16, color:'#999', fontSize:'13px' }}>Loading…</div>;
  }

  const pillFilter = (active: boolean): React.CSSProperties => ({
    padding:'6px 14px', borderRadius:'20px', border:'none',
    cursor:'pointer', fontSize:'11px', fontWeight:600,
    background: active ? '#2e3b50' : '#f0f0f0',
    color:      active ? 'white'   : '#666',
  });

  return (
    <div style={{ padding:'16px', display:'grid', gridTemplateColumns:'1fr 320px', gap:'16px' }}>

      {/* Campaign List */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'center', marginBottom:'12px' }}>
          <h2 style={{ margin:0, fontSize:'14px', fontWeight:700 }}>📢 MARKETING CAMPAIGNS</h2>
          <button onClick={() => setShowModal(true)}
            style={{ padding:'8px 16px', background:'#2e3b50', color:'white',
                     border:'none', borderRadius:'4px', cursor:'pointer',
                     fontSize:'12px', fontWeight:600 }}>
            + New Campaign
          </button>
        </div>

        <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
          {(['ALL','DRAFT','SCHEDULED','RUNNING','COMPLETED'] as const).map(s => (
            <button key={s} style={pillFilter(statusFilter === s)}
              onClick={() => setStatusFilter(s)}>
              {s} ({s === 'ALL' ? campaigns.length : campaigns.filter(c => c.broadcastStatus === s).length})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color:'#999', fontSize:'13px', padding:'24px 0', textAlign:'center' }}>
            Loading campaigns…
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div style={{ background:'#f9f9f9', border:'1px solid #e0e0e0', borderRadius:'4px',
                        padding:'40px 20px', textAlign:'center', color:'#999' }}>
            <div style={{ marginBottom:'8px', fontSize:'13px', fontWeight:500 }}>No campaigns yet</div>
            <button onClick={() => setShowModal(true)}
              style={{ padding:'6px 12px', background:'#2e3b50', color:'white',
                       border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>
              Create Your First Campaign
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {filteredCampaigns.map(c => (
              <div key={c.campaignId} onClick={() => setSelectedId(c.campaignId)}
                style={{ padding:'14px', cursor:'pointer', borderRadius:'4px',
                         background: selectedId === c.campaignId ? '#e3f2fd' : 'white',
                         border:     selectedId === c.campaignId ? '2px solid #2e3b50' : '1px solid #e0e0e0' }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                              alignItems:'start', marginBottom:'8px' }}>
                  <div>
                    <div style={{ fontSize:'12px', fontWeight:600, color:'#1a1a1a',
                                  marginBottom:'3px' }}>{c.name}</div>
                    <div style={{ fontSize:'11px', color:'#666' }}>
                      {c.promotionalContent?.substring(0, 80)}{(c.promotionalContent?.length ?? 0) > 80 ? '…' : ''}
                    </div>
                  </div>
                  <StatusBadge status={c.broadcastStatus} />
                </div>
                <div style={{ display:'flex', gap:'12px', fontSize:'11px', color:'#888', flexWrap:'wrap' }}>
                  <span>🕐 {fmtDate(c.launchDateTime)}</span>
                  <span>🎯 {fmtTargeting(c.targetingOptions)}</span>
                  {c.targetMemberCount != null && <span>👥 {c.targetMemberCount}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Sidebar */}
      <div>
        <h3 style={{ margin:'0 0 12px 0', fontSize:'12px', fontWeight:700, color:'#2e3b50' }}>
          CAMPAIGN STATS
        </h3>
        <div style={{ background:'white', border:'1px solid #e0e0e0', borderRadius:'4px', padding:'14px' }}>
          {selected ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#2e3b50',
                            textTransform:'uppercase' }}>{selected.name}</div>
              <StatusBadge status={selected.broadcastStatus} />
              {(() => {
                // Resolve package name from the catalogs already loaded in state.
                // packageRef may be "CATALOG#<id>" or bare "<id>"; packageIntent is
                // the legacy field name used by the dispatch Lambda.
                const rawRef = selected.packageRef ?? '';
                const pkgId  = rawRef.replace('CATALOG#', '');
                const pkgName = catalogs.find(c => c.packageId === pkgId)?.name ?? rawRef;

                const rows: [string, string][] = [
                  ['📅 Launch',     selected.launchDateTime ? fmtDate(selected.launchDateTime) : '—'],
                  ['📅 Valid From',  selected.validFrom  ? fmtDateShort(selected.validFrom)  : '—'],
                  ['📅 Valid Until', selected.validUntil ? fmtDateShort(selected.validUntil) : '—'],
                  ['📦 Package',     pkgName || '—'],
                  ['🎯 Targeting',   fmtTargeting(selected.targetingOptions)],
                  ['👥 Targeted',    selected.targetMemberCount?.toString() ?? '—'],
                ];
                return rows.map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize:'10px', color:'#666', marginBottom:'2px' }}>{label}</div>
                    <div style={{ fontSize:'13px', fontWeight:700, color:'#2e3b50' }}>{value}</div>
                  </div>
                ));
              })()}
              {selected.campaignKnowledgeBase && (
                <div>
                  <div style={{ fontSize:'10px', color:'#666', marginBottom:'4px' }}>🤖 AI Context</div>
                  <div style={{ fontSize:'11px', color:'#444', lineHeight:1.5,
                                background:'#f9f9f9', padding:'8px', borderRadius:'4px' }}>
                    {selected.campaignKnowledgeBase.substring(0, 200)}
                    {selected.campaignKnowledgeBase.length > 200 ? '…' : ''}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize:'11px', color:'#999', textAlign:'center', padding:'20px 0' }}>
              Select a campaign to see details
            </div>
          )}
        </div>
      </div>

      {/* New Campaign Modal */}
      {adminSub && (
        <NewCampaignModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateCampaign}
          catalogs={catalogs}
          adminSub={adminSub}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};
