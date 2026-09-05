import { useState } from 'react';
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

// ── Tab configuration ─────────────────────────────────────────────────────────
// Exactly 8 tabs in the required order. `value` is used as the controlled key
// for Amplify UI Tabs.Container; `index` maps to the TabPanel index prop.
// Using `as const` so TypeScript narrows the tuple type.

const TAB_CONFIG = [
  { label: 'Home',          value: '0', index: 0 },
  { label: 'Activities',    value: '1', index: 1 },
  { label: 'Facilities',    value: '2', index: 2 },
  { label: 'Appointments',  value: '3', index: 3 },
  { label: 'POS & Packages',value: '4', index: 4 },
  { label: 'CRM',           value: '5', index: 5 },
  { label: 'PR/Marketing',  value: '6', index: 6 },
  { label: 'Settings',      value: '7', index: 7 },
] as const;

// Map each tab index to its content component.
// Defined outside the component to avoid re-creation on every render.
const TAB_PANELS: ReadonlyArray<React.ReactElement> = [
  <HomeTab key="home" />,
  <ActivitiesTab key="activities" />,
  <FacilitiesTab key="facilities" />,
  <AppointmentsTab key="appointments" />,
  <POSPackagesTab key="pos-packages" />,
  <CRMTab key="crm" />,
  <PRMarketingTab key="pr-marketing" />,
  <SettingsTab key="settings" />,
];

// ── Horizontal-scroll wrapper style ──────────────────────────────────────────
// `overflowX: 'auto'` is always set on the tab bar wrapper. The overflow only
// activates when tab items cannot fit the viewport width (i.e. on narrow
// screens). This is the simplest correct approach: no JS resize listener
// needed and no CSS media query gymnastics.
const tabBarWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  // Prevent the scrollbar from pushing content down on macOS overlays
  WebkitOverflowScrolling: 'touch',
};

// ── AppTabs ───────────────────────────────────────────────────────────────────

/**
 * Root navigation component for the VidaBaile Admin UI.
 *
 * Renders exactly 8 top-level tabs using Amplify UI composable Tabs.
 * NO sidebar, drawer, or left-hand nav element is rendered at any breakpoint.
 *
 * Tab bar scrolls horizontally on narrow viewports (< 768px) because
 * `overflowX: 'auto'` is always applied to the wrapper — overflow only
 * activates when the content exceeds the container width.
 *
 * Active tab visual distinction is handled by Amplify UI's built-in
 * `_active` token on `Tabs.Item` (borderColor + color via `--amplify-components-tabs-item-*`).
 * The `Tabs.Container` is controlled: `value` + `onValueChange` keep the
 * active index in sync with our `activeIndex` state so we can also drive
 * the custom `TabPanel` error-boundary wrappers.
 */
export function AppTabs(): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  function handleValueChange(newValue: string): void {
    setActiveIndex(Number(newValue));
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      overflow: 'hidden'
    }}>
      {/*
        Tabs.Container owns the controlled state via `value`.
        Wrapping Tabs.List in a div with overflowX:'auto' ensures the tab bar
        scrolls horizontally on small viewports without affecting panel content.
      */}
      <Tabs.Container
        value={String(activeIndex)}
        onValueChange={handleValueChange}
        ariaLabel="Admin navigation"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden'
        }}
      >
        {/* Tab bar — horizontal scroll wrapper (frozen at top) */}
        <header style={{
          ...tabBarWrapperStyle,
          flexShrink: 0,
          backgroundColor: '#ffffff',
          zIndex: 40,
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <Tabs.List>
            {TAB_CONFIG.map((tab) => (
              <Tabs.Item key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Item>
            ))}
          </Tabs.List>
        </header>

        {/* Tab panels container — scrollable content */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative'
        }}>
          {TAB_CONFIG.map((tab) => (
            <Tabs.Panel key={tab.value} value={tab.value}>
              <TabPanel index={tab.index} activeIndex={activeIndex}>
                {TAB_PANELS[tab.index]}
              </TabPanel>
            </Tabs.Panel>
          ))}
        </main>
      </Tabs.Container>
    </div>
  );
}

export default AppTabs;
