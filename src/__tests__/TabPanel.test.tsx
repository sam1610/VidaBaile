/**
 * Unit tests for TabPanel component
 * Requirements: 2.5, 2.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TabPanel } from '../components/layout/TabPanel';

// ── Mock @aws-amplify/ui-react ────────────────────────────────────────────────
// Alert needs to be findable in the DOM via role="alert" or data-variation.
// View just renders a wrapper div.
vi.mock('@aws-amplify/ui-react', () => ({
  Alert: ({
    variation,
    heading,
    children,
  }: {
    variation?: string;
    heading?: string;
    children?: React.ReactNode;
    isDismissible?: boolean;
  }) => (
    <div data-variation={variation} role="alert">
      {heading && <strong>{heading}</strong>}
      {children}
    </div>
  ),
  View: ({ children, padding }: { children?: React.ReactNode; padding?: string }) => (
    <div data-padding={padding}>{children}</div>
  ),
}));

// ── Helper: a component that throws synchronously during render ───────────────
function ThrowingChild(): React.ReactElement {
  throw new Error('Render error from child');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TabPanel', () => {
  describe('visibility', () => {
    it('renders children when index === activeIndex', () => {
      render(
        <TabPanel index={0} activeIndex={0}>
          <p>Panel content</p>
        </TabPanel>,
      );

      expect(screen.getByText('Panel content')).toBeInTheDocument();
    });

    it('renders nothing when index !== activeIndex (returns null)', () => {
      const { container } = render(
        <TabPanel index={1} activeIndex={0}>
          <p>Hidden content</p>
        </TabPanel>,
      );

      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
      expect(container.firstChild).toBeNull();
    });

    it('renders children for whichever panel matches activeIndex', () => {
      const { rerender } = render(
        <>
          <TabPanel index={0} activeIndex={0}>
            <p>Tab 0</p>
          </TabPanel>
          <TabPanel index={1} activeIndex={0}>
            <p>Tab 1</p>
          </TabPanel>
        </>,
      );

      expect(screen.getByText('Tab 0')).toBeInTheDocument();
      expect(screen.queryByText('Tab 1')).not.toBeInTheDocument();

      rerender(
        <>
          <TabPanel index={0} activeIndex={1}>
            <p>Tab 0</p>
          </TabPanel>
          <TabPanel index={1} activeIndex={1}>
            <p>Tab 1</p>
          </TabPanel>
        </>,
      );

      expect(screen.queryByText('Tab 0')).not.toBeInTheDocument();
      expect(screen.getByText('Tab 1')).toBeInTheDocument();
    });
  });

  describe('error boundary', () => {
    // Suppress the console.error output React prints for boundary-caught errors
    // so test output stays clean.
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('shows an error Alert when a child throws during render', () => {
      render(
        <TabPanel index={0} activeIndex={0}>
          <ThrowingChild />
        </TabPanel>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('data-variation', 'error');
    });

    it('displays the thrown error message inside the Alert', () => {
      render(
        <TabPanel index={0} activeIndex={0}>
          <ThrowingChild />
        </TabPanel>,
      );

      expect(screen.getByText('Render error from child')).toBeInTheDocument();
    });

    it('keeps the tab bar mounted when a child throws (error is contained inside the panel)', () => {
      // The tab bar is rendered OUTSIDE the TabPanel, so the error boundary
      // inside the panel must not affect it.
      render(
        <div>
          {/* Simulated tab bar — lives outside any TabPanel */}
          <nav role="navigation" aria-label="tab bar">
            <button>Tab 1</button>
            <button>Tab 2</button>
          </nav>

          {/* Panel whose child throws */}
          <TabPanel index={0} activeIndex={0}>
            <ThrowingChild />
          </TabPanel>
        </div>,
      );

      // The error Alert is shown inside the panel
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // The tab bar is still in the DOM, unaffected
      expect(screen.getByRole('navigation', { name: 'tab bar' })).toBeInTheDocument();
      expect(screen.getByText('Tab 1')).toBeInTheDocument();
      expect(screen.getByText('Tab 2')).toBeInTheDocument();
    });

    it('does not show an error Alert when no child throws', () => {
      render(
        <TabPanel index={0} activeIndex={0}>
          <p>Normal content</p>
        </TabPanel>,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });
  });
});
