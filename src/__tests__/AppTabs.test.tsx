/**
 * Unit tests for AppTabs component
 *
 * Requirements covered:
 *   - 2.1: Exactly 8 tabs in the correct order
 *   - 2.2: No sidebar / drawer / left-hand navigation
 *   - 2.6: Active tab is visually distinct (aria-selected="true")
 *   - 2.8: Tab bar scrollable at narrow viewports (overflow-x: auto always applied)
 */

import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// ── Mock aws-amplify packages (require AWS config at runtime) ─────────────────
vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));
vi.mock('aws-amplify/auth', () => ({
  signOut: vi.fn(),
}));
vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}));

// ── Mock @aws-amplify/ui-react ────────────────────────────────────────────────
// vi.mock factories are hoisted — we cannot reference variables declared in the
// module body. All mock component logic must be self-contained inside the
// factory, using only React (available via `await import`) or plain JS.
//
// Strategy:
//   • Tabs.Container: a React.useState-controlled wrapper that stores the active
//     value and exposes a setter via a custom DOM event listener so Tabs.Item
//     clicks can update it.
//   • Tabs.List: div[role="tablist"]
//   • Tabs.Item: button[role="tab"] with aria-selected driven by a context value
//   • Tabs.Panel: shown/hidden via a context value
//   • View/Heading/Alert/Authenticator: thin wrappers sufficient for these tests

vi.mock('@aws-amplify/ui-react', async () => {
  const React = await import('react');

  // Context shared between Container, Item, and Panel within the same tree
  const TabsContext = React.createContext<{
    activeValue: string;
    onChange: (v: string) => void;
  }>({ activeValue: '0', onChange: () => undefined });

  function TabsContainer({
    value,
    onValueChange,
    ariaLabel,
    children,
  }: {
    value: string;
    onValueChange?: (v: string) => void;
    ariaLabel?: string;
    children?: React.ReactNode;
  }) {
    // Controlled: re-render parent drives value changes; local state mirrors
    // the prop so that child Item clicks can call onValueChange → parent
    // re-renders with new value → context updates.
    const [activeValue, setActiveValue] = React.useState(value);

    // Sync if the controlled prop changes (driven by parent's setState)
    React.useEffect(() => {
      setActiveValue(value);
    }, [value]);

    const onChange = (v: string) => {
      if (onValueChange) onValueChange(v);
    };

    return (
      <TabsContext.Provider value={{ activeValue, onChange }}>
        <div data-testid="tabs-container" aria-label={ariaLabel}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }

  function TabsList({ children }: { children?: React.ReactNode }) {
    return <div role="tablist">{children}</div>;
  }

  function TabsItem({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) {
    const ctx = React.useContext(TabsContext);
    return (
      <button
        role="tab"
        aria-selected={ctx.activeValue === value}
        onClick={() => ctx.onChange(value)}
      >
        {children}
      </button>
    );
  }

  function TabsPanel({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) {
    const ctx = React.useContext(TabsContext);
    if (ctx.activeValue !== value) return null;
    return <div role="tabpanel">{children}</div>;
  }

  function MockView({
    children,
  }: {
    children?: React.ReactNode;
    [k: string]: unknown;
  }) {
    return <div>{children}</div>;
  }

  function MockHeading({
    children,
    level,
  }: {
    children?: React.ReactNode;
    level?: number;
  }) {
    const Tag = (`h${level ?? 2}`) as keyof React.JSX.IntrinsicElements;
    return <Tag>{children}</Tag>;
  }

  function MockAlert({
    children,
    heading,
  }: {
    children?: React.ReactNode;
    heading?: string;
    [k: string]: unknown;
  }) {
    return (
      <div role="alert">
        {heading && <strong>{heading}</strong>}
        {children}
      </div>
    );
  }

  function MockAuthenticator({
    children,
  }: {
    children: (props: { signOut?: () => void }) => React.ReactNode;
  }) {
    return <>{children({})}</>;
  }

  return {
    Tabs: {
      Container: TabsContainer,
      List: TabsList,
      Item: TabsItem,
      Panel: TabsPanel,
    },
    View: MockView,
    Heading: MockHeading,
    Alert: MockAlert,
    Authenticator: MockAuthenticator,
  };
});

// ── Mock all child tab panel components ───────────────────────────────────────
vi.mock('../components/home/HomeTab', () => ({
  HomeTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-home' }, 'Home Panel');
  },
}));
vi.mock('../components/activities/ActivitiesTab', () => ({
  ActivitiesTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-activities' }, 'Activities Panel');
  },
}));
vi.mock('../components/facilities/FacilitiesTab', () => ({
  FacilitiesTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-facilities' }, 'Facilities Panel');
  },
}));
vi.mock('../components/appointments/AppointmentsTab', () => ({
  AppointmentsTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-appointments' }, 'Appointments Panel');
  },
}));
vi.mock('../components/pos-packages/POSPackagesTab', () => ({
  POSPackagesTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-pos' }, 'POS Panel');
  },
}));
vi.mock('../components/crm/CRMTab', () => ({
  CRMTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-crm' }, 'CRM Panel');
  },
}));
vi.mock('../components/pr-marketing/PRMarketingTab', () => ({
  PRMarketingTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-marketing' }, 'Marketing Panel');
  },
}));
vi.mock('../components/settings/SettingsTab', () => ({
  SettingsTab: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'panel-settings' }, 'Settings Panel');
  },
}));

// ── Mock TabPanel to render children directly (no error boundary needed here) ─
vi.mock('../components/layout/TabPanel', () => ({
  TabPanel: ({
    children,
    index,
    activeIndex,
  }: {
    children: React.ReactNode;
    index: number;
    activeIndex: number;
  }) => {
    const React = require('react');
    return index === activeIndex ? React.createElement(React.Fragment, null, children) : null;
  },
}));

// ── Import component under test (after all mocks are registered) ─────────────
import React from 'react';
import { AppTabs } from '../components/layout/AppTabs';

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPECTED_TAB_LABELS = [
  'Home',
  'Activities',
  'Facilities',
  'Appointments',
  'POS & Packages',
  'CRM',
  'PR/Marketing',
  'Settings',
] as const;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppTabs', () => {

  // ── Requirement 2.1: exactly 8 tabs in the correct order ─────────────────

  describe('tab labels — Requirement 2.1', () => {
    it('renders exactly 8 tab items', () => {
      render(<AppTabs />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(8);
    });

    it('renders tab labels in the correct order', () => {
      render(<AppTabs />);
      const tabs = screen.getAllByRole('tab');
      const labels = tabs.map(t => t.textContent);
      expect(labels).toEqual([...EXPECTED_TAB_LABELS]);
    });

    it('renders each expected tab label exactly once', () => {
      render(<AppTabs />);
      for (const label of EXPECTED_TAB_LABELS) {
        expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
      }
    });
  });

  // ── Requirement 2.2: no sidebar / drawer / left-hand navigation ───────────

  describe('no sidebar navigation — Requirement 2.2', () => {
    it('does not render any element with role="navigation"', () => {
      const { container } = render(<AppTabs />);
      const navRoles = container.querySelectorAll('[role="navigation"]');
      expect(navRoles.length).toBe(0);
    });

    it('does not render any <nav> HTML element', () => {
      const { container } = render(<AppTabs />);
      expect(container.querySelectorAll('nav').length).toBe(0);
    });

    it('does not render any sidebar, drawer, or sider elements', () => {
      const { container } = render(<AppTabs />);
      const sidebarSelectors = [
        '[class*="sidebar"]',
        '[class*="Sidebar"]',
        '[class*="sider"]',
        '[class*="Sider"]',
        '[class*="drawer"]',
        '[class*="Drawer"]',
        '[data-testid*="sidebar"]',
        '[data-testid*="drawer"]',
        '[aria-label*="sidebar"]',
        '[aria-label*="Sidebar"]',
      ];
      for (const sel of sidebarSelectors) {
        expect(container.querySelectorAll(sel).length).toBe(0);
      }
    });
  });

  // ── Requirement 2.6: active tab is visually distinct via aria-selected ─────

  describe('active tab distinction — Requirement 2.6', () => {
    it('marks the first tab (Home) as selected by default', () => {
      render(<AppTabs />);
      expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('marks all other tabs as not selected by default', () => {
      render(<AppTabs />);
      const inactiveTabs = screen
        .getAllByRole('tab')
        .filter(t => t.textContent !== 'Home');
      for (const tab of inactiveTabs) {
        expect(tab).toHaveAttribute('aria-selected', 'false');
      }
    });

    it('only one tab is marked as selected at any time', () => {
      render(<AppTabs />);
      const selectedTabs = screen
        .getAllByRole('tab')
        .filter(t => t.getAttribute('aria-selected') === 'true');
      expect(selectedTabs).toHaveLength(1);
    });
  });

  // ── Requirement 2.8: tab bar has overflow-x: auto regardless of viewport ───

  describe('horizontal scrollability — Requirement 2.8', () => {
    it('wraps the tablist in a div with overflow-x: auto', () => {
      render(<AppTabs />);
      const tablist = screen.getByRole('tablist');
      const wrapper = tablist.parentElement as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.overflowX).toBe('auto');
    });

    it('applies WebkitOverflowScrolling: touch on the tab bar wrapper', () => {
      render(<AppTabs />);
      const tablist = screen.getByRole('tablist');
      const wrapper = tablist.parentElement as HTMLElement;
      expect((wrapper.style as unknown as Record<string, any>).WebkitOverflowScrolling).toBe('touch');
    });

    it('tab bar wrapper retains overflow-x: auto at a 320px viewport width', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 320,
      });
      window.dispatchEvent(new Event('resize'));

      render(<AppTabs />);
      const tablist = screen.getByRole('tablist');
      const wrapper = tablist.parentElement as HTMLElement;
      // The style is always applied inline, not via a media query,
      // so it is present regardless of simulated viewport width.
      expect(wrapper.style.overflowX).toBe('auto');

      // Restore
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
    });
  });

  // ── Structural integrity ──────────────────────────────────────────────────

  describe('structural integrity', () => {
    it('renders exactly one tablist', () => {
      render(<AppTabs />);
      expect(screen.getAllByRole('tablist')).toHaveLength(1);
    });

    it('renders the Home panel content as the initial active panel', () => {
      render(<AppTabs />);
      expect(screen.getByTestId('panel-home')).toBeInTheDocument();
    });
  });
});
