# Requirements Document: Comprehensive Club Console

## Introduction

The Comprehensive Club Console transforms the Home tab of the VidaBaile admin dashboard into a unified command center for dance club administrators. It provides real-time visibility into all operational aspects of the club through a 3-column dashboard with 8 interconnected data panels plus an Agent AI dock. The console integrates Member profiles, Coach rosters, Activity schedules, and Financial KPIs derived from DynamoDB via AppSync GraphQL queries, enabling administrators to monitor club operations at a glance and manage WhatsApp agent configuration.

The console is accessible only to authenticated users in the Cognito 'Admins' group and enforces strict multi-tenant data isolation by club. It must load all content within 2 seconds on standard network conditions and remain fully responsive across viewport sizes from 320px to 1920px.

---

## Glossary

- **Admin User**: A user authenticated via Cognito User Pool and assigned to the 'Admins' group
- **Club / Branch**: A distinct dance club location (e.g., "La Vida Main", "Branch B", "Branch C")
- **ComprehensiveClubConsole**: The root dashboard component rendering all 8 panels + sidebar
- **Panel**: A self-contained data visualization widget (Activities, Appointments, etc.)
- **Real-time Data**: Data fetched from DynamoDB and current within 5 seconds
- **Tier**: Member classification (STANDARD, SILVER, GOLD, PLATINUM)
- **MemberPackage**: An active subscription or class package for a Member
- **Booking**: A record of a Member's attendance or reservation for an Activity
- **Schedule**: A repeating or single class/activity with date, time, duration, coach, and capacity
- **Specialty**: A coach's primary expertise (e.g., Salsa, Zumba, Contemporary)
- **KPI**: Key Performance Indicator (e.g., Total Revenue, Active Packages)
- **Skeleton Loader**: A placeholder animation shown during data fetching
- **Error Boundary**: A component that catches child errors and displays a retry option
- **AppSync**: AWS GraphQL managed service for data access
- **MCP Tool**: Model Context Protocol tool representing an agent action (e.g., bookCoach, payPackage)
- **Intent Classification**: Bedrock's determination of which of 4 supported agent intents a WhatsApp message maps to
- **WhatsApp Broadcast**: A message sent to one or more members via the WhatsApp Business API

---

## Requirements

### Requirement 1: Dashboard Composition and Layout

**User Story:** As an admin, I want to see all operational metrics and member data on one screen, so that I can monitor club status without switching between tabs.

#### Acceptance Criteria

1. WHEN an admin user accesses the Home tab THEN THE ComprehensiveClubConsole SHALL render exactly 8 data panels arranged in a 3-column grid layout
2. WHEN the viewport width is ≥ 1024px on desktop THEN THE Agent AI dock SHALL be visible as a fourth column on the right side
3. WHEN the viewport width is between 640px and 1024px on tablet THEN THE Agent AI dock SHALL be hidden and panels SHALL reflow to 2 columns
4. WHEN the viewport width is < 640px on mobile THEN THE dashboard SHALL stack panels vertically as a single column
5. THE 3-column layout SHALL arrange panels as follows:
   - Left column: Panels 1-4 (Activities, Appointments, Facilities, Members)
   - Center column: Panels 5-8 (Financials, Marketing, Agentic AI Config, Reports)
   - Right column (desktop only): Agent AI Dock with simulated WhatsApp chat
6. THE gap between columns and rows SHALL be consistently 12px on desktop and 8px on mobile
7. THE Agent AI dock title bar SHALL display "Agent AI Dock", a green online status badge, and minimize/close buttons

### Requirement 2: Real-Time Member Data Display

**User Story:** As an admin, I want to see all active members with their tier and status, so that I can quickly assess membership distribution and identify at-risk accounts.

#### Acceptance Criteria

1. THE Members Panel (Panel 4) SHALL display all Member records fetched from DynamoDB via AppSync GraphQL
2. WHEN the Members Panel loads THEN THE Panel SHALL display member name, phone number, tier badge (STANDARD/SILVER/GOLD/PLATINUM), and status icon (ACTIVE/INACTIVE/SUSPENDED)
3. THE tier badge SHALL use distinct colors: STANDARD (gray #f0f0f0), SILVER (light blue), GOLD (gold #ffd700), PLATINUM (purple #dda0dd)
4. THE status icon SHALL indicate ACTIVE (green checkmark), INACTIVE (gray dash), or SUSPENDED (red X)
5. THE Members Panel SHALL display a maximum of 15 rows with vertical scrolling for additional members
6. THE Members Panel default filter SHALL show ACTIVE members only; a toggle SHALL allow viewing all members
7. WHEN an admin clicks on a member row THEN THE dashboard SHALL deep-link to the CRM tab displaying the full member profile
8. THE Panel title SHALL display "Active Members" in uppercase

### Requirement 3: Schedule and Activities Display

**User Story:** As an admin, I want to see this week's class schedule with coaches and availability, so that I can manage class assignments and identify scheduling conflicts.

#### Acceptance Criteria

1. THE Activities Panel (Panel 1) SHALL display a weekly timetable grid showing the next 7 calendar days (Monday-Sunday)
2. THE timetable SHALL show time slots from 06:00 to 22:00 with 1-hour intervals as rows
3. WHEN schedule data is fetched THEN each cell SHALL display activity badges containing activity type, start time, capacity, and status indicator
4. THE activity status SHALL indicate SCHEDULED (blue), CANCELLED (gray), or COMPLETED (green)
5. WHEN an admin hovers over an activity badge THEN a tooltip SHALL display coach name, full description, and current attendance
6. THE Panel title SHALL display "Weekly Activities" in uppercase

### Requirement 4: Coach Roster and Availability

**User Story:** As an admin, I want to see all coaches with their specialties and current status, so that I can manage trainer assignments and communicate availability changes.

#### Acceptance Criteria

1. THE Appointments Panel (Panel 2) SHALL display a compact table of all Coach records from DynamoDB
2. THE Coach table SHALL display columns: name | specialty | status | phone link
3. THE status column SHALL use color-coded badges: ACTIVE (green), INACTIVE (gray), SUSPENDED (red)
4. THE phone link SHALL be a clickable WhatsApp or tel: URL
5. THE Panel SHALL support sorting by name or specialty via column headers
6. THE Panel SHALL display a maximum of 10 rows with scrolling
7. THE Panel title SHALL display "Coaches & Trainers" in uppercase

### Requirement 5: Facilities and Room Occupancy Display

**User Story:** As an admin, I want to see real-time occupancy of facilities, so that I can manage room capacity and plan class assignments.

#### Acceptance Criteria

1. THE Facilities Panel (Panel 3) SHALL display a grid of room/facility cards showing live occupancy data
2. THE Panel SHALL show at least 3 static facility/hall entries (La Vida Hall, Hall 2, Hall 3)
3. EACH facility card SHALL display: facility name | capacity | live occupancy % | color-coded occupancy indicator
4. THE occupancy % calculation SHALL be: (active bookings in current hour ÷ capacity) × 100
5. THE occupancy color indicator SHALL use: green (< 50%), yellow (50-80%), red (80%+)
6. THE Panel title SHALL display "Facilities & Rooms" in uppercase

### Requirement 6: Financial KPIs

**User Story:** As an admin, I want to see key financial metrics at a glance, so that I can monitor revenue, membership health, and expiry risks.

#### Acceptance Criteria

1. THE Financials Panel (Panel 5) SHALL display exactly 4 KPI boxes arranged in a 2×2 grid or 1×4 row (responsive)
2. THE first KPI box SHALL display "Total Revenue" calculated as the sum of price for all MemberPackage records with status='ACTIVE'
3. THE second KPI box SHALL display "Active Packages" calculated as the count of MemberPackage records with status='ACTIVE'
4. THE third KPI box SHALL display "Avg Credits Remaining" calculated as the mean of remainingCredits across all MemberPackage records
5. THE fourth KPI box SHALL display "Expiring This Week" calculated as count of MemberPackage records with validUntil within the next 7 days
6. EACH KPI box SHALL display a metric name (title), large numeric value, optional trend indicator (↑ up / ↓ down / → neutral), and trend percentage if available
7. THE Panel title SHALL display "Financials" in uppercase

### Requirement 7: Marketing and Broadcast Management

**User Story:** As an admin, I want to compose and send WhatsApp broadcasts to members, so that I can manage marketing campaigns and member communication.

#### Acceptance Criteria

1. THE Marketing Panel (Panel 6) SHALL display a list of recent broadcast campaigns
2. THE Panel SHALL display campaign cards showing: message preview | sent timestamp | reach count | open rate percentage
3. THE Panel SHALL show the 5 most recent campaigns
4. THE Panel SHALL include a prominent "New Broadcast" button
5. WHEN an admin clicks "New Broadcast" THEN a side-drawer or modal composer SHALL open
6. THE broadcast composer SHALL allow selecting member segments (All Members, Tier-specific, Active only)
7. THE broadcast composer SHALL display character count and WhatsApp formatting preview
8. WHEN the admin clicks "Send" THEN THE system SHALL call the broadcast-marketing GraphQL mutation
9. THE Panel title SHALL display "Marketing & Broadcasts" in uppercase

### Requirement 8: Agentic AI Configuration Display

**User Story:** As an admin, I want to see the status and supported intents of the WhatsApp agent, so that I can monitor AI capabilities and understand what members can request.

#### Acceptance Criteria

1. THE Agentic AI Config Panel (Panel 7) SHALL display the agent's operational status and supported intents
2. THE Panel header SHALL display a status badge indicating: online (green) | offline (gray) | error (red)
3. THE Panel SHALL display exactly 4 intent cards arranged in a 2×2 grid, one for each supported intent:
   - BOOK_COACH: "Book a coaching session"
   - PAY_PACKAGE: "Purchase or renew a membership package"
   - POSTPONE_SESSION: "Reschedule an existing booking"
   - QUERY_MEMBERSHIP: "Check membership status and balance"
4. EACH intent card SHALL display: intent name | human-readable description | enabled toggle | list of available MCP tools
5. WHEN an admin toggles an intent from enabled to disabled THEN THE system SHALL update agent configuration (future implementation)
6. THE Panel title SHALL display "Agentic AI Configuration" in uppercase

### Requirement 9: Reporting and Attendance Metrics

**User Story:** As an admin, I want to see attendance and retention metrics, so that I can measure member engagement and identify trends.

#### Acceptance Criteria

1. THE Reports Panel (Panel 8) SHALL display exactly 4 metric widgets arranged in a 2×2 grid or responsive layout
2. THE first widget SHALL display "Attendance Rate" as: (bookings confirmed this week ÷ scheduled bookings this week) × 100
3. THE second widget SHALL display "Retention Rate" as: (active members this month ÷ total members this month) × 100
4. THE third widget SHALL display "Avg Attendance per Member" as: total bookings this month ÷ total active members
5. THE fourth widget SHALL display "Popular Activities" as the top 3 activity types by booking count (this month)
6. EACH metric widget SHALL display a metric name, numeric value, optional trend, and period label
7. THE Panel title SHALL display "Reports" in uppercase

### Requirement 10: Agent AI Dock Integration

**User Story:** As an admin, I want to see a simulated WhatsApp conversation with the agent, so that I can understand how members interact with the bot and verify intent classification.

#### Acceptance Criteria

1. THE Agent AI Dock SHALL display on the right side of the dashboard on desktop viewports (≥ 1024px)
2. THE Dock header SHALL display "Agent AI Dock" | status badge | minimize and close buttons
3. THE Dock SHALL show a scrollable message thread with the last 20 messages (simulated or from live agent logs)
4. EACH user message SHALL be left-aligned in a light-colored speech bubble
5. EACH agent response SHALL be right-aligned in a darker-colored speech bubble
6. WHEN an agent processes a member request THEN a Tool Execution Card SHALL be displayed showing:
   - Tool name (e.g., "bookCoach")
   - Execution status: pending | executing | complete | error
   - Status indicator (spinner for executing, checkmark for complete, error icon for error)
7. WHEN an agent returns membership data THEN a Membership Query Result card SHALL display inline showing:
   - Member name
   - Current tier
   - Active packages count
   - Next booking date and activity type (if applicable)
8. THE Dock SHALL include an input area at the bottom with a text field and send button
9. THE Dock title SHALL be selectable/collapsible to minimize/restore the Dock
10. THE Dock SHALL have a "Close" button to hide it entirely (state persisted in localStorage)

### Requirement 11: Data Fetching and Real-Time Updates

**User Story:** As an admin, I want the dashboard data to be fresh and current, so that I see the latest operational status without manually refreshing.

#### Acceptance Criteria

1. WHEN the ComprehensiveClubConsole component mounts THEN THE system SHALL call Promise.all() to fetch Member, Coach, Schedule, and MemberPackage data in parallel
2. THE parallel fetch SHALL use generateClient() to create an AppSync GraphQL client and call:
   - client.models.Member.list({ filter: { clubId: { eq: selectedClubId } } })
   - client.models.Coach.list()
   - client.models.Schedule.list()
   - client.models.MemberPackage.list()
   - (and Booking data for facilities/reports)
3. WHILE data is fetching THEN all panels SHALL display Skeleton Loaders (animated placeholder lines)
4. WHEN data fetch completes successfully THEN all panels SHALL render live data within 100ms
5. IF a single panel's data fetch fails THEN that panel SHALL display an error card with the error message and a "Retry" button
6. WHEN an admin clicks "Retry" on a failed panel THEN that panel SHALL re-fetch its data independently
7. THE system SHALL cache fetched data for 5 seconds; if a second mount occurs within 5 seconds, cached data SHALL be used
8. THE Header SHALL include a "Refresh" button WHEN the user clicks it THEN all panels SHALL re-fetch simultaneously
9. THE ComprehensiveClubConsole SHALL NOT automatically subscribe to real-time updates in this phase (subscription integration is future work)

### Requirement 12: Branch/Club Selector

**User Story:** As an admin managing multiple club locations, I want to select which branch to view, so that I see filtered data relevant to that location.

#### Acceptance Criteria

1. THE HeaderStrip component SHALL display a dropdown selector labeled "Branch" or "Club"
2. THE dropdown SHALL list all available clubs/branches (e.g., "La Vida Main", "Branch B", "Branch C", etc.)
3. WHEN an admin selects a different club from the dropdown THEN THE selectedClubId state SHALL update
4. WHEN selectedClubId changes THEN THE useComprehensiveData hook SHALL trigger a new fetch with the new clubId filter
5. ALL displayed data SHALL be scoped to the selected club (e.g., Member.list filter includes clubId)
6. THE selected club name SHALL be retained in component state and persist for the session (or localStorage for next session)

### Requirement 13: Global Search and Filtering

**User Story:** As an admin, I want to search across all panels to quickly find specific members, coaches, or activities, so that I don't have to scan entire panels manually.

#### Acceptance Criteria

1. THE HeaderStrip component SHALL display a Search input field
2. WHEN an admin types in the Search field THEN the dashboard SHALL filter visible data across all panels in real-time
3. THE search SHALL match against:
   - Member names and phone numbers
   - Coach names and specialties
   - Activity types
   - Facility names
4. WHEN search results return no matches in a panel THEN that panel SHALL display "No results for 'query'" message
5. WHEN the search field is cleared THEN all panels SHALL restore full unfiltered views
6. THE search SHALL be case-insensitive

### Requirement 14: Error Handling and Failover

**User Story:** As an admin, I want the dashboard to remain functional even if some data sources fail, so that I can continue working despite partial outages.

#### Acceptance Criteria

1. EACH panel SHALL wrap its content in an Error Boundary component
2. IF a panel's data fetch encounters a network error THEN THE panel SHALL display an error card with:
   - Error message
   - Panel name
   - "Retry" button
3. IF a panel's data fetch times out after 10 seconds THEN THE system SHALL treat it as a failure and display the error card
4. WHEN a panel fails THEN other panels SHALL continue rendering their successfully fetched data
5. WHEN an admin clicks "Retry" on an error card THEN that panel SHALL attempt a fresh fetch of its data
6. IF all panels fail (total fetch failure) THEN THE ComprehensiveClubConsole SHALL display an alternative error state with a "Retry All" button

### Requirement 15: Authentication and Authorization

**User Story:** As a system administrator, I want the dashboard to be accessible only to authorized admins, so that members and non-admin staff cannot view operational metrics.

#### Acceptance Criteria

1. THE ComprehensiveClubConsole component SHALL be rendered only within the Home tab context
2. WHEN the AppTabs component initializes THEN it SHALL verify that the authenticated user is in the Cognito 'Admins' group
3. IF the user is NOT in the 'Admins' group THEN the Home tab SHALL display an "Access Denied" message
4. ALL AppSync GraphQL queries from the dashboard SHALL be protected by Amplify authorization rules:
   - allow.groups(['Admins']) for all Member, Coach, Schedule, MemberPackage, and Booking queries
5. IF an admin's JWT token expires THEN the next query SHALL fail with an authentication error, and the dashboard SHALL redirect to login

### Requirement 16: Performance and Load Time

**User Story:** As an admin, I want the dashboard to load quickly, so that I can access information without waiting.

#### Acceptance Criteria

1. THE ComprehensiveClubConsole SHALL complete all parallel data fetches and render all 8 panels within 2 seconds on 4G network conditions (simulated as 1.6 Mbps down / 750 kbps up)
2. THE ComprehensiveClubConsole shall load all critical components within 1 second on broadband (>10 Mbps)
3. WHILE awaiting data THEN Skeleton Loaders SHALL render immediately (< 100ms) to provide visual feedback
4. THE individual panel rendering (after data arrives) SHALL complete within 100ms per panel
5. THE dashboard SHALL not trigger layout thrashing or excessive re-renders; CSS Grid layout changes SHALL not trigger content reflows
6. EACH panel data payload from AppSync SHALL not exceed 500KB for a single query result

### Requirement 17: Responsive Design Across Viewports

**User Story:** As an admin using the dashboard on various devices, I want the interface to adapt gracefully, so that I can work efficiently on mobile, tablet, and desktop.

#### Acceptance Criteria

1. WHEN the viewport width is ≥ 1920px on ultra-wide displays THEN THE 3-column grid + dock SHALL maintain optimal spacing with max 1200px container width
2. WHEN the viewport width is 1024px-1920px on desktop THEN THE 4-column layout (3 panels + dock) SHALL render with proportional widths
3. WHEN the viewport width is 640px-1024px on tablet THEN THE dashboard SHALL reflow to 2 columns with the dock hidden
4. WHEN the viewport width is < 640px on mobile THEN THE dashboard SHALL stack panels vertically as a single scrollable column
5. WHEN the viewport height is < 600px THEN THE panels SHALL adjust their min-height to prevent excessive vertical overflow (min-height: 120px)
6. ON mobile (< 640px) THEN THE Header gaps and padding SHALL reduce to 8px (from 12px) to preserve space
7. THE Facilities Panel occupancy cards SHALL reflow from 3 columns to 2 columns to 1 column as viewport shrinks
8. THE Financials Panel KPI boxes SHALL reflow from 2×2 grid to 1×4 or 1×2 based on available width

### Requirement 18: Component Hierarchy and Naming

**User Story:** As a developer, I want clear component organization and naming, so that I can maintain and extend the code efficiently.

#### Acceptance Criteria

1. THE root component SHALL be named ComprehensiveClubConsole.tsx located at `src/components/home/ComprehensiveClubConsole.tsx`
2. EACH panel SHALL be a separate file located at `src/components/home/panels/<PanelName>Panel.tsx`
3. THE HeaderStrip component SHALL be located at `src/components/home/components/HeaderStrip.tsx`
4. THE Agent AI Dock component SHALL be located at `src/components/home/dock/AgentAIDock.tsx`
5. MICRO-COMPONENTS (Badge, Pill, MiniTable, KPIBox, SkeletonLoader) SHALL be located at `src/components/home/components/<ComponentName>.tsx`
6. THE data fetching hook useComprehensiveData SHALL be located at `src/components/home/hooks/useComprehensiveData.ts`
7. ALL CSS styling SHALL be co-located with components as CSS modules or inline styles; a root CSS file ComprehensiveClubConsole.css SHALL define grid layout only

### Requirement 19: Accessibility Compliance

**User Story:** As an admin using assistive technologies, I want the dashboard to be fully navigable and readable, so that I can access all features regardless of ability.

#### Acceptance Criteria

1. ALL interactive elements (buttons, dropdowns, search) SHALL be keyboard navigable using Tab, Enter, and Escape keys
2. ALL buttons, links, and interactive panels SHALL display a visible focus indicator (outline or border)
3. ALL images, icons, and status badges SHALL have descriptive alt text or aria-label attributes
4. ALL data tables (MiniTable component) SHALL use semantic <table>, <thead>, <tbody>, <tr>, <th>, <td> elements
5. ALL form inputs (search, dropdowns) SHALL have associated <label> elements with htmlFor attributes
6. ALL panels SHALL be labelled with role="region" and aria-label describing their purpose
7. SKELETON LOADERS SHALL be marked with aria-busy="true" during loading
8. ERROR messages SHALL be announced to screen readers using aria-live="polite" regions
9. THE dashboard color scheme SHALL have sufficient contrast ratio (≥ 4.5:1 for text) per WCAG 2.1 AA
10. ALL interactive elements SHALL have a minimum touch target size of 44px × 44px (per WCAG 2.1 AA)

### Requirement 20: Styling and Visual Design

**User Story:** As an admin, I want the dashboard to have a professional, cohesive appearance, so that I can work efficiently without visual confusion.

#### Acceptance Criteria

1. ALL colors SHALL be derived from Amplify UI design tokens; custom colors are allowed only where Amplify has no equivalent
2. THE primary color palette SHALL use:
   - Background: #ffffff (white for panels), #f5f5f5 (light gray for container)
   - Text: #1a1a1a (dark gray, primary), #666666 (medium gray, secondary)
   - Borders: #e0e0e0 (light gray)
   - Accent: #2e3b50 (dark blue) for headers
3. ALL text SHALL use a system font stack (e.g., -apple-system, BlinkMacSystemFont, sans-serif)
4. THE Header font size SHALL be 13px (title), 12px (labels)
5. THE Panel titles SHALL be 13px, font-weight 600, text-transform uppercase, letter-spacing 0.5px
6. THE Panel content text SHALL be 12px with 1.4 line-height for readability
7. THE badge variants SHALL have predefined color mappings: default (light gray), success (green), warning (yellow), danger (red), info (blue)
8. ALL panels SHALL have rounded corners (4px border-radius), 1px border (#e0e0e0), 12px padding, and subtle shadow (0 1px 2px rgba(0,0,0,0.05))
9. EACH column gap SHALL be 12px on desktop, 8px on mobile
10. EACH row gap between panels SHALL match the column gap

### Requirement 21: Backward Compatibility with HomeTab Integration

**User Story:** As an existing admin, I want the new Comprehensive Console to integrate seamlessly into the existing Home tab, so that I don't experience disruption.

#### Acceptance Criteria

1. THE existing HomeTab.tsx component SHALL be updated to import and render ComprehensiveClubConsole as its main child
2. THE ComprehensiveClubConsole component SHALL be a drop-in replacement with no additional dependencies on HomeTab props
3. ALL existing Amplify UI Context and Auth context SHALL remain unmodified
4. NO breaking changes SHALL be made to AppTabs.tsx or other tab components
5. THE Home tab's active state handling in AppTabs SHALL remain unchanged

---

## Constraints

- Third-party UI component libraries beyond Amplify UI are forbidden (no Ant Design, Material-UI, Chakra UI)
- No sidebar navigation allowed (Tab-based navigation only)
- All data must be scoped to the selected club (no cross-club data leakage)
- Dashboard must use native AWS services only (no Zapier, Make, n8n)
- GraphQL queries must use AppSync only (no REST endpoints for internal data)
- All Cognito tokens must be validated on every AppSync call

---

## Acceptance Test Scenarios

### Scenario A: First Load — Desktop

**Setup**: Admin user logged into VidaBaile, navigating to Home tab for the first time today.

**Steps**:
1. Home tab renders
2. User sees full 4-column layout (3 panels + dock)
3. All 8 panels show Skeleton Loaders
4. User waits for data to arrive

**Expected**: Within 2 seconds, all panels are populated with real data; no errors shown.

---

### Scenario B: Branch Change

**Setup**: Admin viewing "La Vida Main" club data.

**Steps**:
1. Admin clicks Branch dropdown
2. Admin selects "Branch B"
3. Dashboard re-fetches

**Expected**: All panels update to show only Branch B data; no flicker or duplicate requests.

---

### Scenario C: Panel Failure + Retry

**Setup**: Admin on dashboard; Coach list API returns 500 error.

**Steps**:
1. Admin observes Coaches panel with error message
2. Other panels remain fully functional
3. Admin clicks "Retry" in Coaches panel
4. System retries fetch

**Expected**: Coaches panel refetches and succeeds; other panels unaffected throughout.

---

### Scenario D: Mobile Responsiveness

**Setup**: Admin on mobile device (375px viewport).

**Steps**:
1. Dashboard renders on mobile
2. Panels stack vertically
3. Dock is hidden
4. Header is compact

**Expected**: All 8 panels visible via vertical scroll; no horizontal scroll; Header remains accessible.

---

### Scenario E: Search and Filter

**Setup**: Admin viewing 50+ members.

**Steps**:
1. Admin types "Sarah" in Search field
2. Members Panel filters to show only "Sarah*"

**Expected**: Members Panel shows 1-3 Sarahs; other panels unaffected.

---

### Scenario F: Access Control

**Setup**: Non-admin user attempts to access Home tab.

**Steps**:
1. User navigates to Home tab
2. System checks Cognito group membership

**Expected**: "Access Denied" message shown; no data rendered.

---
