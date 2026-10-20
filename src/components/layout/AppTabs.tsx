import { useEffect, useState } from 'react';
import { Tabs } from '@aws-amplify/ui-react';
import { TabPanel }        from './TabPanel';
import { HomeTab }         from '../home/HomeTab';
import { ActivitiesTab }   from '../activities/ActivitiesTab';
import { FacilitiesTab }   from '../facilities/FacilitiesTab';
import { AppointmentsTab } from '../appointments/AppointmentsTab';
import { POSPackagesTab }  from '../pos-packages/POSPackagesTab';
import { CRMTab }          from '../crm/CRMTab';
import { PRMarketingTab }  from '../pr-marketing/PRMarketingTab';
import { SettingsTab }     from '../settings/SettingsTab';
import { useUserRole }     from '../../context/UserRoleContext';

// ── Tab definitions ───────────────────────────────────────────────────────────
//
// Every tab has a stable numeric `value` string so Amplify Tabs.Container can
// control the active panel, and an `index` that keys into TAB_COMPONENTS below.
// "Appointments" was renamed to "Coaches" — value/index are unchanged so any
// persisted state and the component slot remain stable.

interface TabDef {
  label:      string;
  value:      string;  // string key used by Amplify Tabs
  index:      number;  // position in TAB_COMPONENTS
  adminOnly:  boolean; // true = never render for the 'coach' role
}

const ALL_TABS: TabDef[] = [
  { label: 'Home',           value: '0', index: 0, adminOnly: true  },
  { label: 'Activities',     value: '1', index: 1, adminOnly: true  },
  { label: 'Facilities',     value: '2', index: 2, adminOnly: false },
  { label: 'Coaches',        value: '3', index: 3, adminOnly: false },
  { label: 'POS & Packages', value: '4', index: 4, adminOnly: true  },
  { label: 'CRM',            value: '5', index: 5, adminOnly: true  },
  { label: 'PR/Marketing',   value: '6', index: 6, adminOnly: true  },
  { label: 'Settings',       value: '7', index: 7, adminOnly: true  },
];

// Components indexed to match ALL_TABS[n].index.
// TAB_COMPONENTS[i] is only ever instantiated when the tab is permitted for
// the current role (see renderPanel below), so admin components are excluded
// from the React tree entirely when a coach is logged in.
const TAB_COMPONENTS: ReadonlyArray<() => React.ReactElement> = [
  () => <HomeTab         key="home" />,
  () => <ActivitiesTab   key="activities" />,
  () => <FacilitiesTab   key="facilities" />,
  () => <AppointmentsTab key="coaches" />,
  () => <POSPackagesTab  key="pos-packages" />,
  () => <CRMTab          key="crm" />,
  () => <PRMarketingTab  key="pr-marketing" />,
  () => <SettingsTab     key="settings" />,
];

// Default landing tab by role
const DEFAULT_TAB_VALUE: Record<string, string> = {
  admin: '0',  // Home
  coach: '2',  // Facilities
};

const tabBarWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
};

// ── AppTabs ───────────────────────────────────────────────────────────────────

export function AppTabs(): React.ReactElement {
  const { userRole } = useUserRole();

  // Build the tab list the current role is permitted to see.
  // adminOnly:true tabs are completely removed for coaches — they never appear
  // in the tab bar and their panel components are never rendered or mounted.
  const isCoach     = userRole === 'coach';
  const visibleTabs = isCoach
    ? ALL_TABS.filter((t) => !t.adminOnly)
    : ALL_TABS;

  const defaultValue = DEFAULT_TAB_VALUE[userRole] ?? visibleTabs[0]?.value ?? '0';
  const [activeValue, setActiveValue] = useState<string>(defaultValue);

  // If role changes after mount (shouldn't happen in normal flow, but guards
  // against an edge case where context updates asynchronously) and the active
  // tab is no longer in the permitted set, snap to the role default.
  useEffect(() => {
    const stillVisible = visibleTabs.some((t) => t.value === activeValue);
    if (!stillVisible) {
      setActiveValue(DEFAULT_TAB_VALUE[userRole] ?? visibleTabs[0]?.value ?? '0');
    }
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
          ariaLabel="Navigation"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <header style={{
            ...tabBarWrapperStyle,
            flexShrink:      0,
            backgroundColor: '#ffffff',
            zIndex:          40,
            borderBottom:    '1px solid #e5e7eb',
            boxShadow:       '0 1px 3px rgba(0,0,0,0.1)',
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
            {visibleTabs.map((tab) => {
              // Hard guard: only call the component factory for permitted tabs.
              // This ensures admin components (HomeTab, ActivitiesTab, etc.)
              // are never instantiated in the React tree for a coach session.
              const Component = TAB_COMPONENTS[tab.index];
              return (
                <Tabs.Panel key={tab.value} value={tab.value}>
                  <TabPanel index={tab.index} activeIndex={Number(activeValue)}>
                    <Component />
                  </TabPanel>
                </Tabs.Panel>
              );
            })}
          </main>
        </Tabs.Container>
      </div>
    </>
  );
}

export default AppTabs;
