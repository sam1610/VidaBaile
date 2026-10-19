import { useEffect, useState } from 'react';
import { Tabs } from '@aws-amplify/ui-react';
import { TabPanel } from './TabPanel';
import { HomeTab } from '../home/HomeTab';
import { ActivitiesTab } from '../activities/ActivitiesTab';
import { FacilitiesTab } from '../facilities/FacilitiesTab';
import { AppointmentsTab } from '../appointments/AppointmentsTab';
import { POSPackagesTab } from '../pos-packages/POSPackagesTab';
import { CRMTab } from '../crm/CRMTab';
import { PRMarketingTab } from '../pr-marketing/PRMarketingTab';
import { SettingsTab } from '../settings/SettingsTab';
import { useUserRole } from '../../context/UserRoleContext';

// ── Tab configuration ─────────────────────────────────────────────────────────

const ALL_TABS = [
  { label: 'Home',           value: '0', index: 0 },
  { label: 'Activities',     value: '1', index: 1 },
  { label: 'Facilities',     value: '2', index: 2 },
  { label: 'Appointments',   value: '3', index: 3 },
  { label: 'POS & Packages', value: '4', index: 4 },
  { label: 'CRM',            value: '5', index: 5 },
  { label: 'PR/Marketing',   value: '6', index: 6 },
  { label: 'Settings',       value: '7', index: 7 },
] as const;

// Labels accessible to the coach role
const COACH_ALLOWED_LABELS = new Set(['Activities', 'Appointments']);

// Panel index -> component (keyed by original index so TabPanel indices stay stable)
const TAB_PANELS: ReadonlyArray<React.ReactElement> = [
  <HomeTab         key="home" />,
  <ActivitiesTab   key="activities" />,
  <FacilitiesTab   key="facilities" />,
  <AppointmentsTab key="appointments" />,
  <POSPackagesTab  key="pos-packages" />,
  <CRMTab          key="crm" />,
  <PRMarketingTab  key="pr-marketing" />,
  <SettingsTab     key="settings" />,
];

const tabBarWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
};

// ── AppTabs ───────────────────────────────────────────────────────────────────

export function AppTabs(): React.ReactElement {
  const { userRole } = useUserRole();

  // Filter tabs based on role
  const visibleTabs = userRole === 'coach'
    ? ALL_TABS.filter((t) => COACH_ALLOWED_LABELS.has(t.label))
    : ALL_TABS;

  // Default tab: first visible tab's value
  const defaultValue = visibleTabs[0]?.value ?? '1';

  const [activeValue, setActiveValue] = useState<string>(defaultValue);

  // If the role resolves after mount and the current active tab is no longer
  // visible, snap to the first allowed tab.
  useEffect(() => {
    const isVisible = visibleTabs.some((t) => t.value === activeValue);
    if (!isVisible) setActiveValue(defaultValue);
  }, [userRole]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        [data-amplify-component='tabs-item'][data-state='active'] {
          background-color: #e8f4f8 !important;
          border-radius: 6px 6px 0 0 !important;
          transition: background-color 0.2s ease !important;
        }
        [data-amplify-component='tabs-item'] {
          transition: background-color 0.2s ease;
          border-radius: 6px 6px 0 0;
        }
        [data-amplify-component='tabs-item']:not([data-state='active']):hover {
          background-color: #f5f9fb;
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
        <Tabs.Container
          value={activeValue}
          onValueChange={setActiveValue}
          ariaLabel="Admin navigation"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <header style={{
            ...tabBarWrapperStyle,
            flexShrink: 0,
            backgroundColor: '#ffffff',
            zIndex: 40,
            borderBottom: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <Tabs.List>
              {visibleTabs.map((tab) => (
                <Tabs.Item key={tab.value} value={tab.value}>
                  {tab.label}
                </Tabs.Item>
              ))}
            </Tabs.List>
          </header>

          <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
            {visibleTabs.map((tab) => (
              <Tabs.Panel key={tab.value} value={tab.value}>
                <TabPanel index={tab.index} activeIndex={Number(activeValue)}>
                  {TAB_PANELS[tab.index]}
                </TabPanel>
              </Tabs.Panel>
            ))}
          </main>
        </Tabs.Container>
      </div>
    </>
  );
}

export default AppTabs;
