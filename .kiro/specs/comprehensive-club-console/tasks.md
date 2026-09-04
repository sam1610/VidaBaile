# Implementation Plan: Comprehensive Club Console

## Overview

The Comprehensive Club Console transforms the empty Home tab into a unified 3-column dashboard with 8 data panels plus an Agent AI dock. This implementation plan breaks down the feature into incremental, testable steps starting with foundational components (hooks, micro-components) and progressing through panel implementations, integration, and testing.

**Implementation Language**: TypeScript (React 18 + Vite)

**Key Metrics**:
- Load time target: 2 seconds on 4G (1.6 Mbps down)
- Number of components: 1 root + 8 panels + 1 dock + 5 micro-components + 1 hook + 1 header
- Data sources: Member, Coach, Schedule, MemberPackage, Booking from DynamoDB via AppSync
- Test coverage: Unit tests (micro-components, calculations), Property-based tests (data consistency, KPI accuracy), Integration tests (data fetching, panel isolation)

---

## Tasks

### 1. Foundation Setup and Utilities

- [ ] 1.1 Create project structure and base files
  - Create directory structure: `src/components/home/` with subdirectories `panels/`, `components/`, `hooks/`, `dock/`, and test directories
  - Create base TypeScript interfaces and types file: `src/components/home/types.ts`
  - Verify Amplify client setup in `src/lib/amplify-config.ts` (using v6+ Gen 2 client)
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

- [ ] 1.2 Implement useComprehensiveData hook with Promise.all fetching
  - Create `src/components/home/hooks/useComprehensiveData.ts`
  - Implement parallel data fetching using Promise.all() for Member, Coach, Schedule, MemberPackage, Booking
  - Add error handling and timeout logic (10-second timeout per panel)
  - Implement data caching (5-second TTL) to prevent duplicate requests
  - Add support for clubId filtering on Member and MemberPackage queries
  - Add refetch function with manual trigger capability
  - Export TypeScript interfaces: ComprehensiveData, UseComprehensiveDataReturn
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.3, 12.4_

- [ ] 1.3 Implement PanelErrorBoundary wrapper component
  - Create `src/components/home/components/PanelErrorBoundary.tsx`
  - Implement error catching for child panel components
  - Display error card with panel name, error message, and retry button
  - Add support for optional fallback UI
  - Integrate error logging (log to DynamoDB analytics for future reference)
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [ ] 1.4 Create micro-component library
  - Create Badge component (`src/components/home/components/Badge.tsx`) with variants (default, success, warning, danger, info)
  - Create Pill component (`src/components/home/components/Pill.tsx`) for metric display with icon, label, value
  - Create MiniTable component (`src/components/home/components/MiniTable.tsx`) with column definitions, sorting, clickable rows
  - Create KPIBox component (`src/components/home/components/KPIBox.tsx`) for financial metrics with trend indicators
  - Create SkeletonLoader component (`src/components/home/components/SkeletonLoader.tsx`) with animated placeholders
  - Add CSS animations for skeleton loaders (pulse effect)
  - _Requirements: 16.1, 20.7, 20.8_

### 2. Core Dashboard Container and Layout

- [ ] 2.1 Implement ComprehensiveClubConsole root component
  - Create `src/components/home/ComprehensiveClubConsole.tsx`
  - Set up state management for selectedClubId, loading, error
  - Integrate useComprehensiveData hook with selectedClubId parameter
  - Implement error boundary wrapper around entire dashboard
  - Pass aggregated data (members, coaches, schedules, etc.) to all child panels as props
  - Add refresh button to HeaderStrip with manual fetch capability
  - Implement responsive className switches for grid layout
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.1, 15.1, 16.1_

- [ ] 2.2 Implement HeaderStrip component
  - Create `src/components/home/components/HeaderStrip.tsx`
  - Display title: "VidaBaile Comprehensive Console" (uppercase)
  - Implement branch/club selector dropdown with list of available clubs
  - Add onClubChange callback to update parent state
  - Implement global search input field with real-time filtering capability
  - Add refresh button to manually trigger data re-fetch
  - Style header with dark background (#2e3b50), white text, 60px height
  - _Requirements: 1.1, 12.1, 12.2, 12.3, 13.1, 13.2, 20.4, 20.5_

- [ ] 2.3 Create CSS Grid layout (ComprehensiveClubConsole.css)
  - Define grid-template-areas for "header header header header" and "left center right dock"
  - Implement 4-column grid: 25% (left) + 28% (center) + 22% (right) + 25% (dock), 12px gaps
  - Desktop (≥1024px): 4-column layout with dock visible
  - Tablet (640px-1024px): 2-column layout with dock hidden
  - Mobile (<640px): 1-column vertical stack with dock hidden
  - Add overflow-y auto to column containers
  - Define panel base styles: white background, 1px border (#e0e0e0), 4px border-radius, 12px padding, min-height 180px
  - Set up CSS variables for consistent spacing (12px gaps, 8px mobile)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 20.8, 20.9, 20.10_

### 3. Panel Implementation Tasks

- [ ] 3.1 Implement ActivitiesPanel (Panel 1 - Weekly Timetable)
  - Create `src/components/home/panels/ActivitiesPanel.tsx`
  - Display 7-day weekly grid (Monday-Sunday) as columns
  - Show time slots (06:00-22:00) as rows with 1-hour intervals
  - Render activity badges with type, start time, capacity, status indicator
  - Implement status color mapping: SCHEDULED (blue), CANCELLED (gray), COMPLETED (green)
  - Add tooltip on hover showing coach name and full description
  - Wrap in PanelErrorBoundary with "Weekly Activities" title
  - Display SkeletonLoader during data fetch
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3.2 Implement AppointmentsPanel (Panel 2 - Coach Roster)
  - Create `src/components/home/panels/AppointmentsPanel.tsx`
  - Use MiniTable component to display Coach data
  - Columns: name | specialty | status | phone link
  - Implement sortable columns (name, specialty) with column header click handlers
  - Apply status badge colors: ACTIVE (green), INACTIVE (gray), SUSPENDED (red)
  - Make phone column clickable as WhatsApp/tel: URL
  - Limit display to 10 rows with vertical scrolling
  - Wrap in PanelErrorBoundary with "Coaches & Trainers" title
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 3.3 Implement FacilitiesPanel (Panel 3 - Room Occupancy)
  - Create `src/components/home/panels/FacilitiesPanel.tsx`
  - Define 3 static facility cards (La Vida Hall, Hall 2, Hall 3)
  - Calculate live occupancy % as: (active bookings in current hour ÷ capacity) × 100
  - Render occupancy color indicator: green (<50%), yellow (50-80%), red (80%+)
  - Display facility name | capacity | occupancy % | color badge
  - Use responsive grid (3 columns desktop, 2 tablet, 1 mobile)
  - Wrap in PanelErrorBoundary with "Facilities & Rooms" title
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 17.7_

- [ ] 3.4 Implement MembersPanel (Panel 4 - Member Table)
  - Create `src/components/home/panels/MembersPanel.tsx`
  - Use MiniTable component to display Member data
  - Columns: name | phone | tier (badge) | status (icon) | last booking date
  - Implement tier badge colors: STANDARD (gray), SILVER (light blue), GOLD (gold), PLATINUM (purple)
  - Add status icons: ACTIVE (✓ green), INACTIVE (- gray), SUSPENDED (✗ red)
  - Implement sortable columns (name, tier) with column header handlers
  - Add toggle to filter ACTIVE-only (default) vs. all members
  - Limit display to 15 rows with vertical scrolling
  - Implement row click handler to deep-link to CRM tab (store memberId in state for navigation)
  - Wrap in PanelErrorBoundary with "Active Members" title
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 3.5 Implement FinancialsPanel (Panel 5 - KPI Boxes)
  - Create `src/components/home/panels/FinancialsPanel.tsx`
  - Calculate and display 4 KPIs:
    1. Total Revenue = sum of price where status='ACTIVE'
    2. Active Packages = count where status='ACTIVE'
    3. Avg Credits Remaining = mean of remainingCredits across all
    4. Expiring This Week = count where validUntil within 7 days
  - Use KPIBox component for each metric with large numeric value
  - Add trend indicators (↑ up, ↓ down, → neutral) based on previous period comparison (mock data for now)
  - Arrange boxes in 2×2 grid (desktop), 1×4 (tablet), 1×1 stacked (mobile)
  - Wrap in PanelErrorBoundary with "Financials" title
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 3.6 Implement MarketingPanel (Panel 6 - Broadcast Management)
  - Create `src/components/home/panels/MarketingPanel.tsx`
  - Display 5 most recent broadcast campaigns (mock data for MVP; future: fetch from DynamoDB)
  - Campaign cards show: message preview | sent timestamp | reach count | open rate %
  - Implement "New Broadcast" button with click handler (link to future broadcast-composer modal)
  - For MVP, "New Broadcast" button is interactive but opens a placeholder modal
  - Wrap in PanelErrorBoundary with "Marketing & Broadcasts" title
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

- [ ] 3.7 Implement AgenticAIConfigPanel (Panel 7 - Agent Config)
  - Create `src/components/home/panels/AgenticAIConfigPanel.tsx`
  - Display agent status badge: online (green) | offline (gray) | error (red)
  - Create 4 intent cards in 2×2 grid (one for each supported intent):
    - BOOK_COACH: "Book a coaching session"
    - PAY_PACKAGE: "Purchase or renew a membership package"
    - POSTPONE_SESSION: "Reschedule an existing booking"
    - QUERY_MEMBERSHIP: "Check membership status and balance"
  - Each card displays: intent name | description | enabled toggle | MCP tools list
  - For MVP, toggles are non-functional (future Settings tab feature)
  - Wrap in PanelErrorBoundary with "Agentic AI Configuration" title
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 3.8 Implement ReportsPanel (Panel 8 - Metrics and Analytics)
  - Create `src/components/home/panels/ReportsPanel.tsx`
  - Calculate and display 4 metric widgets:
    1. Attendance Rate = (bookings confirmed this week ÷ scheduled bookings this week) × 100
    2. Retention Rate = (active members this month ÷ total members this month) × 100
    3. Avg Attendance per Member = total bookings this month ÷ total active members
    4. Popular Activities = top 3 activity types by booking count (this month)
  - Use KPIBox or metric card component for each widget
  - Arrange in 2×2 grid (desktop), responsive on mobile
  - Add trend indicators and period labels
  - For Popular Activities, use a compact list (activity type | count)
  - Wrap in PanelErrorBoundary with "Reports" title
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

### 4. Agent AI Dock Implementation

- [ ] 4.1 Implement AgentAIDock component (Right Sidebar)
  - Create `src/components/home/dock/AgentAIDock.tsx`
  - Render dock as fixed-width right column (min 320px, max 350px)
  - Display header: "Agent AI Dock" | green online status badge | minimize and close buttons
  - Implement minimize toggle to collapse/expand dock (state stored in localStorage)
  - Show scrollable message thread with last 20 messages (simulated for MVP)
  - _Requirements: 10.1, 10.2, 10.3, 10.9, 10.10_

- [ ] 4.2 Implement chat message rendering with type-specific UI
  - Create `src/components/home/dock/ChatMessage.tsx` sub-component
  - Render user messages: left-aligned, light background (#e3f2fd), speech bubble
  - Render agent messages: right-aligned, dark background (#2e3b50), white text
  - Display timestamp for each message
  - _Requirements: 10.4, 10.5_

- [ ] 4.3 Implement tool execution card display
  - Create `src/components/home/dock/ToolExecutionCard.tsx` sub-component
  - Center-align tool execution cards with border-left color indicator
  - Display: tool name | execution status (pending | executing | complete | error)
  - Add status indicator: spinner for executing, checkmark for complete, X for error
  - Apply color: blue for pending/executing, green for complete, red for error
  - _Requirements: 10.6_

- [ ] 4.4 Implement membership query result card display
  - Create `src/components/home/dock/MembershipQueryResult.tsx` sub-component
  - Inline card display showing: member name | current tier | active packages count | next booking
  - Use Badge component for tier display
  - Format next booking as: "Salsa with Coach Maria, Tue 3:30 PM"
  - _Requirements: 10.7_

- [ ] 4.5 Implement dock input area with message sending
  - Add input field and send button to AgentAIDock
  - Text input placeholder: "Type a message..."
  - Send button: styled as WhatsApp icon (→) or button text "Send"
  - On send: append user message to thread, clear input, show mock agent response after 1 second
  - For MVP: simulate agent responses (hardcoded responses based on keywords)
  - _Requirements: 10.8_

### 5. Integration and Wiring

- [ ] 5.1 Update HomeTab.tsx to mount ComprehensiveClubConsole
  - Import ComprehensiveClubConsole from `src/components/home/ComprehensiveClubConsole.tsx`
  - Replace placeholder content with ComprehensiveClubConsole component
  - Verify Amplify UI Context is available and authenticated
  - Test that Home tab renders without errors
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

- [ ] 5.2 Implement global search filtering across all panels
  - Add search query state to ComprehensiveClubConsole
  - Implement filterData() utility function to search across members, coaches, activities, facilities
  - Pass filtered data to each panel as prop
  - Update all panels to conditionally render "No results for 'query'" message when filter returns empty
  - Test search with various queries (names, phone numbers, activity types)
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 5.3 Verify branch/club selector integration with data fetching
  - Test that selecting different club from dropdown triggers refetch
  - Verify all Member and MemberPackage queries include clubId filter
  - Confirm panel data updates immediately after club selection
  - Test branch persistence in localStorage
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 5.4 Test responsive layout across breakpoints
  - Desktop (1920px): 4-column layout with dock visible, panels proportional
  - Desktop (1024px-1920px): 4-column layout maintained
  - Tablet (640px-1024px): 2-column layout, dock hidden, panels full width
  - Mobile (320px-640px): 1-column vertical stack, dock hidden, header compact
  - Verify no horizontal scroll on any viewport
  - Test touch target sizes (≥44px for buttons)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

- [ ] 5.5 Verify authentication and authorization controls
  - Test that non-admin users see "Access Denied" message
  - Confirm all AppSync queries include allow.groups(['Admins']) authorization
  - Test JWT token expiry handling (redirect to login on auth failure)
  - Verify no data leakage for unauthorized users
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 5.6 Optimize performance and bundle size
  - Measure dashboard load time on 4G network (Lighthouse audit)
  - Target: < 2 seconds full load, < 1 second on broadband
  - Implement React.memo() on panels to prevent unnecessary re-renders
  - Add lazy loading for dock component (defer render if needed)
  - Verify no layout thrashing in CSS Grid layout
  - Check bundle size (compress CSS, minimize component code)
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

### 6. Accessibility and Styling

- [ ] 6.1 Implement keyboard navigation and focus indicators
  - Add tabindex to all interactive elements (buttons, inputs, dropdowns)
  - Test Tab key navigation through dashboard (branch selector → search → panels → dock)
  - Verify visible focus indicator (outline or border) on all focused elements
  - Test Escape key closes dropdowns and modals
  - Test Enter key activates buttons and row actions
  - _Requirements: 19.1, 19.2_

- [ ] 6.2 Add ARIA labels and semantic HTML
  - Add aria-label to all buttons and icon buttons
  - Add role="region" and aria-label to each panel (e.g., "Members list panel")
  - Use semantic HTML: <table>, <thead>, <tbody>, <tr>, <th>, <td> for MiniTable
  - Associate form labels with inputs using htmlFor attribute
  - Mark panels with aria-busy="true" during loading
  - Use aria-live="polite" for error messages
  - _Requirements: 19.3, 19.4, 19.5, 19.6, 19.7, 19.8_

- [ ] 6.3 Verify color contrast and visual accessibility
  - Test all text color contrasts (minimum 4.5:1 for WCAG 2.1 AA)
  - Verify badge colors are distinguishable (not relying on color alone)
  - Use both color + icon/text for status indicators
  - Test dashboard in grayscale mode (no color dependency)
  - _Requirements: 19.9_

- [ ] 6.4 Apply consistent styling with Amplify UI tokens
  - Use Amplify UI design tokens for all colors, spacing, typography
  - Apply primary color palette: #ffffff (bg), #f5f5f5 (container), #1a1a1a (text), #666 (secondary)
  - Use accent colors: #2e3b50 (dark blue header), #27ae60 (success/green), #e74c3c (error/red), #f39c12 (warning/yellow)
  - Ensure consistent font stack (-apple-system, BlinkMacSystemFont, sans-serif)
  - Apply badge color mappings to all Badge components
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

### 7. Testing and Validation

- [ ] 7.1 Write unit tests for micro-components
  - Test Badge component: verify all variants render with correct colors
  - Test Pill component: verify icon + label + value rendering
  - Test KPIBox component: verify numeric display, trend indicator, unit formatting
  - Test MiniTable component: verify columns render, sorting works, clickable rows
  - Test SkeletonLoader component: verify animation and line count
  - _Requirements: 16.3, 16.4_

- [ ] 7.2 Write unit tests for calculation functions
  - Test FinancialsPanel KPI calculations (total revenue, avg credits, expiring count)
  - Test ReportsPanel metric calculations (attendance rate, retention rate)
  - Test FacilitiesPanel occupancy % calculation
  - Test search filtering function across all data types
  - Verify calculations handle edge cases (empty data, single item, null values)
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 9.2, 9.3, 9.4_

- [ ] 7.3 Write property-based tests for data consistency
  - **Property 1: Member Data Consistency** - All fetched members have required fields (memberId, name, phone, tier, status)
  - **Property 2: Coach Data Consistency** - All coaches have specialty and status fields
  - **Property 3: Schedule Time Validity** - All schedule startTime < endTime and both are valid 24-hour times
  - **Property 4: Booking Scope Isolation** - No booking references member or coach from different club
  - Use fast-check library to generate random valid data and assert properties
  - _Requirements: 2.1, 4.1, 5.1, 12.5_

- [ ] 7.4 Write property-based tests for KPI accuracy
  - **Property 5: Revenue Sum Accuracy** - Total revenue equals sum of all ACTIVE package prices (within 0.01 tolerance)
  - **Property 6: Active Package Count Accuracy** - Active packages count matches filtered data
  - **Property 7: Avg Credits Calculation** - Avg credits = sum / count (null-safe)
  - **Property 8: Occupancy Percentage Bounds** - Occupancy % always between 0-100
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [ ] 7.5 Write property-based tests for error handling and resilience
  - **Property 9: Panel Isolation** - Failure of one panel does not prevent rendering of others
  - **Property 10: Partial Data Load** - Dashboard renders successfully even if one data source returns empty array
  - **Property 11: Error Boundary Catch** - PanelErrorBoundary catches errors and displays retry button
  - Use fast-check to simulate random error conditions and assert resilience
  - _Requirements: 14.1, 14.4, 14.5_

- [ ] 7.6 Write property-based tests for filtering and search
  - **Property 12: Search Result Accuracy** - All results match search query (case-insensitive)
  - **Property 13: Filter Completeness** - No matching items hidden by filter
  - **Property 14: Empty Filter Handling** - Clearing search restores full dataset
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 7.7 Write property-based tests for responsive layout
  - **Property 15: Viewport-Specific Layout** - Desktop (≥1024px) shows 4 columns; tablet shows 2; mobile shows 1
  - **Property 16: No Horizontal Overflow** - At any viewport width, no horizontal scroll needed
  - **Property 17: Panel Reflow Consistency** - Panels maintain content readability at all sizes
  - Simulate viewport changes and verify layout adjustments
  - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [ ] 7.8 Write property-based tests for accessibility compliance
  - **Property 18: Keyboard Navigation** - All interactive elements reachable via Tab key
  - **Property 19: Focus Indicator Visibility** - Focused elements have visible outline/border
  - **Property 20: ARIA Attributes Presence** - All buttons have aria-label or aria-labelledby
  - _Requirements: 19.1, 19.2, 19.3_

- [ ] 7.9 Write integration tests for data fetching flow
  - Test useComprehensiveData hook: successful fetch, error handling, retry logic
  - Test that Promise.all() fetches all 4 data sources in parallel
  - Test that data caching prevents duplicate requests within 5 seconds
  - Test that clubId filter is applied to Member and MemberPackage queries
  - Test that timeout after 10 seconds displays error card
  - Verify that refetch button triggers all queries simultaneously
  - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.7, 11.8_

- [ ] 7.10 Checkpoint - Ensure all tests pass
  - Run unit tests: `npm run test:unit`
  - Run property-based tests: `npm run test:pbt` (using fast-check)
  - Run integration tests: `npm run test:integration`
  - Verify test coverage ≥ 80% for components and calculation functions
  - Fix any failing tests before proceeding to performance validation
  - Ask the user if questions arise.

### 8. Performance and Quality Assurance

- [ ] 8.1 Run Lighthouse audit and performance testing
  - Audit dashboard on simulated 4G network (Lighthouse)
  - Measure: load time, largest contentful paint (LCP), cumulative layout shift (CLS)
  - Target: LCP < 1.5s, CLS < 0.1, Performance score ≥ 85
  - Record performance baseline (load time, bundle size, render time)
  - Document performance budget (max 2s load time, max 500KB payload per query)
  - _Requirements: 16.1, 16.2, 16.3_

- [ ] 8.2 Verify WCAG 2.1 AA accessibility compliance
  - Use automated tools: axe DevTools, WAVE, Lighthouse accessibility audit
  - Manual testing: screen reader (NVDA, VoiceOver) keyboard navigation
  - Verify all touchable elements ≥ 44px × 44px
  - Verify color contrast ≥ 4.5:1 for all text
  - Test with assistive technologies (screen readers, voice control)
  - Document any remaining manual testing requirements
  - _Requirements: 19.1-19.10_

- [ ] 8.3 Test cross-browser compatibility
  - Test on Chrome/Edge (Chromium), Firefox, Safari (desktop and mobile)
  - Verify CSS Grid layout renders correctly in all browsers
  - Test responsive breakpoints on mobile browsers (Chrome Mobile, Safari iOS)
  - Verify no JavaScript errors in console
  - Document any browser-specific workarounds
  - _Requirements: 17.1-17.8_

- [ ] 8.4 Run acceptance test scenarios
  - **Scenario A - First Load Desktop**: Verify all 8 panels load within 2s, no errors, full 4-column layout
  - **Scenario B - Branch Change**: Switch clubs, verify data updates, no duplicate requests, smooth transition
  - **Scenario C - Panel Failure + Retry**: Simulate panel failure (mock API error), verify other panels functional, click retry, verify recovery
  - **Scenario D - Mobile Responsiveness**: Test on 375px viewport, verify vertical stack, no horizontal scroll, dock hidden
  - **Scenario E - Search and Filter**: Type member name, verify filtering works across Members panel, other panels unchanged
  - **Scenario F - Access Control**: Test non-admin user, verify "Access Denied" shown, no data rendered
  - Document results and any issues found
  - _Requirements: All_

- [ ] 8.5 Load test dashboard with mock data
  - Generate 1000+ member records, 50+ coaches, 100+ schedules
  - Test dashboard performance with large dataset
  - Verify load time remains < 3s even with large data
  - Check memory usage and detect any memory leaks
  - Measure AppSync query response time
  - Document performance characteristics with different data volumes
  - _Requirements: 16.5, 16.6_

### 9. Documentation and Closure

- [ ] 9.1 Document component API and usage patterns
  - Create README: `src/components/home/README.md` with component hierarchy diagram
  - Document useComprehensiveData hook: parameters, return types, error handling
  - Document all micro-components: props interfaces, usage examples
  - Document error handling patterns (PanelErrorBoundary, retry logic)
  - Add JSDoc comments to all exported functions and components
  - _Requirements: 18.1-18.7_

- [ ] 9.2 Document data flow and integration points
  - Create integration guide: data fetching flow, error handling, caching strategy
  - Document AppSync query patterns used (filter, parallel queries)
  - Document how to add new panels (reuse micro-components, follow established patterns)
  - Document CSS Grid customization for future layout changes
  - _Requirements: 11.1-11.8_

- [ ] 9.3 Final code review and cleanup
  - Review all TypeScript types: ensure strict mode compliance
  - Remove any console.log() statements (except intentional debugging)
  - Verify no hardcoded values (use constants/config files)
  - Ensure consistent code formatting (Prettier configured)
  - Run linter: `npm run lint` and fix any warnings
  - _Requirements: All_

- [ ] 9.4 Checkpoint - Ensure all deliverables complete
  - Verify all 8 panels render with real data
  - Confirm responsive layout works on all breakpoints
  - Verify error handling and retry flows work
  - Confirm accessibility (keyboard nav, ARIA, contrast)
  - Verify performance baseline (< 2s load time)
  - Ask the user if questions arise.

---

## Notes

- **Data Fetching**: All panels use the same useComprehensiveData hook for consistent caching and error handling. Individual panel failures do not prevent other panels from rendering.
- **Error Boundaries**: Each panel is wrapped in PanelErrorBoundary to isolate errors and provide retry capability.
- **Responsive Design**: CSS Grid layout automatically reflows between 4-column (desktop), 2-column (tablet), and 1-column (mobile). The dock is hidden on viewports < 1024px.
- **Micro-Components**: Badge, Pill, MiniTable, KPIBox, SkeletonLoader are reusable across all panels and can be extended for future features.
- **Testing Strategy**: 
  - Unit tests validate individual micro-components and calculation functions
  - Property-based tests validate universal correctness properties (data consistency, KPI accuracy, error resilience, filtering, responsive layout, accessibility)
  - Integration tests validate data fetching flow and error handling
  - Acceptance tests validate end-to-end user workflows
- **Performance Optimization**: 
  - React.memo() on panels to prevent unnecessary re-renders
  - 5-second data caching to prevent duplicate requests
  - Skeleton loaders provide immediate visual feedback during fetch
  - CSS Grid layout uses no JavaScript calculations (better performance)
- **Accessibility**: Dashboard complies with WCAG 2.1 AA, including keyboard navigation, ARIA labels, semantic HTML, color contrast, and 44px+ touch targets.
- **Future Extensions**:
  - AppSync subscriptions for real-time data updates (currently polling via manual refresh)
  - Broadcast composer modal (currently placeholder)
  - Advanced filtering UI (currently basic search)
  - Agent logs integration (currently simulated messages)

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": [
        "1.1",
        "1.2",
        "1.3",
        "1.4"
      ]
    },
    {
      "id": 1,
      "tasks": [
        "2.1",
        "2.2",
        "2.3"
      ]
    },
    {
      "id": 2,
      "tasks": [
        "3.1",
        "3.2",
        "3.3",
        "3.4",
        "3.5",
        "3.6",
        "3.7",
        "3.8"
      ]
    },
    {
      "id": 3,
      "tasks": [
        "4.1",
        "4.2",
        "4.3",
        "4.4",
        "4.5"
      ]
    },
    {
      "id": 4,
      "tasks": [
        "5.1",
        "5.2",
        "5.3",
        "5.4",
        "5.5",
        "5.6"
      ]
    },
    {
      "id": 5,
      "tasks": [
        "6.1",
        "6.2",
        "6.3",
        "6.4"
      ]
    },
    {
      "id": 6,
      "tasks": [
        "7.1",
        "7.2",
        "7.3",
        "7.4",
        "7.5",
        "7.6",
        "7.7",
        "7.8"
      ]
    },
    {
      "id": 7,
      "tasks": [
        "7.9",
        "8.1",
        "8.2",
        "8.3",
        "8.4",
        "8.5"
      ]
    },
    {
      "id": 8,
      "tasks": [
        "9.1",
        "9.2",
        "9.3"
      ]
    }
  ]
}
```

---

## Execution Instructions

To begin implementing this plan:

1. **Open the tasks.md file** (you are viewing it now)
2. **Click "Start task"** next to task 1.1 to begin with Foundation Setup
3. **Follow the tasks in order** — each task builds on the previous ones
4. **Run tests after checkpoint tasks** to validate progress
5. **Refer to the design.md and requirements.md documents** for additional context and acceptance criteria
6. **Ask the orchestrating agent or Kiro for help** if you encounter issues or need clarification

The dashboard is complete when all 8 panels render with real data, all tests pass, and accessibility/performance baselines are met.
