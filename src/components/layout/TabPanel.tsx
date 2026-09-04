import React from 'react';
import { Alert, View } from '@aws-amplify/ui-react';

// ── Error Boundary ────────────────────────────────────────────────────────────
// Must be a class component — React's error boundary contract requires
// getDerivedStateFromError / componentDidCatch.
// This boundary wraps ONLY the tab panel content; the tab bar lives outside
// and is never affected by an error thrown inside a panel.

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class TabPanelErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading this content.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Log to console; a real app would forward to CloudWatch or a monitoring service
    console.error('[TabPanelErrorBoundary] Caught error:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View padding="medium">
          <Alert
            variation="error"
            heading="Content could not be loaded"
            isDismissible={false}
          >
            {this.state.errorMessage}
          </Alert>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── TabPanel ──────────────────────────────────────────────────────────────────

export interface TabPanelProps {
  /** Panel content — rendered only when this panel is active */
  children: React.ReactNode;
  /** Zero-based index of this panel (must match a TAB_CONFIG entry) */
  index: number;
  /** Zero-based index of the currently active tab */
  activeIndex: number;
}

/**
 * Renders its children only when `index === activeIndex`.
 * Wraps children in a `TabPanelErrorBoundary` so that a render error inside
 * a panel is contained: the tab bar (rendered outside this component) is
 * never unmounted or navigated away from.
 */
export function TabPanel({ children, index, activeIndex }: TabPanelProps): React.ReactElement | null {
  if (index !== activeIndex) {
    return null;
  }

  return (
    <TabPanelErrorBoundary>
      {children}
    </TabPanelErrorBoundary>
  );
}

export default TabPanel;
