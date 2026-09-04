# Phase 2: STD Component Refactoring — Requirements

## Overview

Refactor all React admin components to use the new Single-Table Design (STD) backend with real-time subscriptions via custom hooks.

**Scope:** CRM Dashboard (Members), Appointments Tab (Coaches), Activities Tab (Schedules), POS & Packages Tab

**Duration:** Phase 2 focuses on component wiring; no schema changes.

---

## User Stories

### US-1: Real-Time Members Table (CRM Dashboard)

**As an** admin managing dance club members,
**I want** the member list to update in real-time as members are added/edited,
**So that** I always see the current membership state without manual refresh.

**Acceptance Criteria:**
- [x] useAdminSub hook fetches admin's Cognito SUB on mount
- [ ] useClubRecordSubscription queries gsi1pk=`<sub>#MEMBERS` with gsi1sk=`STATUS#ACTIVE`
- [ ] Members automatically filtered by entityType='MEMBER' and status='ACTIVE'
- [ ] Table displays members in sorted/paginated view
- [ ] Create new member → appears in table immediately (via subscription)
- [ ] Edit member name → updates in real-time
- [ ] Change member status to INACTIVE → removed from table
- [ ] **NO** delete button (members cannot be deleted, only deactivated)
- [ ] Error states handled gracefully

### US-2: Real-Time Coaches Table (Appointments Tab)

**As an** admin managing dance instructors,
**I want** to add, edit, and delete coaches with real-time UI sync,
**So that** multiple admins see coach updates instantly.

**Acceptance Criteria:**
- [x] useAdminSub hook fetches admin's Cognito SUB on mount
- [ ] useClubRecordSubscription queries gsi1pk=`<sub>#COACHES`
- [ ] Coaches automatically filtered by entityType='COACH'
- [ ] Table displays coaches (name, phone, specialty, status)
- [ ] "+ Add New Coach" button opens CoachCrudModal (controlled form)
- [ ] Modal form collects: name, phone, specialty, email, bio, status
- [ ] On submit: createCoach() factory constructs pk/sk correctly, then create
- [ ] New coach appears in table immediately via subscription
- [ ] "Edit" icon opens modal pre-filled with selected coach
- [ ] On edit submit: update() mutation via client with correct pk/sk
- [ ] "Delete" icon removes coach from table via subscription
- [ ] Subscription auto-unsubscribes on component unmount (no memory leaks)

### US-3: Weekly Schedule View (Activities Tab)

**As an** admin viewing the weekly dance class schedule,
**I want** to see all schedules for a specific date range,
**So that** I can manage class assignments and capacity.

**Acceptance Criteria:**
- [ ] useAdminSub hook fetches admin's Cognito SUB
- [ ] useClubRecordSubscription queries gsi2pk=`<sub>#SCHEDULES` with gsi2sk=`DATE#<YYYY-MM-DD>`
- [ ] Filter to current week (Mon-Sun)
- [ ] Display schedule entries with time, coach, facility, activity type, capacity
- [ ] Sort by date + start time
- [ ] Real-time updates when schedules are created/updated
- [ ] Optional: Create/edit schedule modal

### US-4: Package Management (POS & Packages Tab)

**As an** admin tracking membership packages,
**I want** to see active and expired packages per member,
**So that** I can manage renewals and track membership revenue.

**Acceptance Criteria:**
- [ ] useAdminSub hook fetches admin's Cognito SUB
- [ ] useClubRecordSubscription queries gsi2pk=`<sub>#PACKAGES`
- [ ] Filter to show active (not expired) vs expired packages
- [ ] Display: member phone, package type, credits, expiry date
- [ ] Sort by expiry date (nearest first)
- [ ] Real-time updates on package creation/expiration
- [ ] Optional: Extend package validity modal

---

## Technical Requirements

### Data Binding
- **Hook Usage:** All tabs must use `useAdminSub()` + `useClubRecordSubscription()`
- **Type Safety:** Use type guards (isMember, isCoach, etc.) to filter records
- **Factory Functions:** Use createMember(), createCoach(), etc. for mutations
- **Error Handling:** Graceful error messages with retry capability

### Real-Time Subscriptions
- **Cleanup:** All useEffect subscriptions must unsubscribe on unmount
- **Memory Leaks:** No dangling subscriptions on tab navigation
- **Enabled Flag:** Only subscribe when adminSub is available
- **Dependency Array:** Correct dependencies to avoid duplicate subscriptions

### Multi-Tenant Isolation
- **Partition Key:** Every query must include pk=adminSub
- **Cross-Tenant Safety:** Type guards + factory functions prevent cross-tenant data access
- **Database Enforcement:** DynamoDB enforces pk=adminSub isolation

### CRUD Operations
- **Create:** Use factory function, verify pk/sk before sending
- **Read:** Use useClubRecordSubscription with appropriate GSI query
- **Update:** Construct correct pk/sk, pass to client.models.ClubRecord.update()
- **Delete:** Pass pk/sk to client.models.ClubRecord.delete()

---

## Component Refactoring Plan

### CrmDashboard.tsx
**Current State:** Uses old Member.list() API with manual subscriptions
**Target State:** Uses useClubRecordSubscription with STD backend

**Steps:**
1. Remove old Member.list() code
2. Import useAdminSub, useClubRecordSubscription, isMember
3. Query: gsi1pk=`${adminSub}#MEMBERS`, gsi1sk=`STATUS#ACTIVE`
4. Filter records: `records.filter(isMember)`
5. Replace subscription setup with hook
6. Update MemberCrudModal to use createMember() factory

### AppointmentsTab.tsx
**Current State:** Uses old Coach model
**Target State:** Uses useClubRecordSubscription with STD backend

**Steps:**
1. Remove old Coach.list() code
2. Import useAdminSub, useClubRecordSubscription, isCoach, createCoach
3. Query: gsi1pk=`${adminSub}#COACHES`
4. Filter records: `records.filter(isCoach)`
5. Replace subscriptions with hook
6. Update CoachCrudModal to use createCoach() factory
7. Implement CRUD handlers: handleAddCoach, handleEditCoach, handleDeleteCoach

### ActivitiesTab.tsx
**Current State:** [Examine existing implementation]
**Target State:** Uses useClubRecordSubscription for schedules

**Steps:**
1. Import useAdminSub, useClubRecordSubscription, isSchedule
2. Query: gsi2pk=`${adminSub}#SCHEDULES`, gsi2sk=`DATE#<week_dates>`
3. Calculate current week date range
4. Filter records: `records.filter(isSchedule)`
5. Display in weekly calendar view or table

### PosPackagesTab.tsx
**Current State:** [Examine existing implementation]
**Target State:** Uses useClubRecordSubscription for packages

**Steps:**
1. Import useAdminSub, useClubRecordSubscription, isPackage
2. Query: gsi2pk=`${adminSub}#PACKAGES`
3. Filter: active (validUntil >= today) vs expired
4. Sort by validUntil ascending
5. Display in tabbed view (Active/Expired)

---

## Acceptance Criteria (Phase 2 Complete)

- [x] All 4 tabs refactored to use new STD backend hooks
- [x] useAdminSub called on mount in each component
- [x] useClubRecordSubscription correctly configured (GSI keys, enabled flag)
- [x] Type guards used to filter records by entityType
- [x] CRUD modals use factory functions
- [x] All subscriptions unsubscribe on unmount
- [x] No TypeScript errors
- [x] No memory leaks (subscriptions cleaned up)
- [x] Real-time updates verified manually
- [x] Error states tested (network failure, auth error)
- [x] Cross-admin isolation tested (can't see other admin's data)

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| UI responsiveness | < 100ms update latency on subscription events |
| Memory footprint | No growth over extended use (subscriptions cleaned) |
| Type safety | 0 `any` types in component code |
| Build time | < 5 seconds (Vite rebuild) |
| Bundle size | < 1MB (gzipped < 250KB) |

---

## Dependencies

- `src/lib/models.ts` (Phase 1 ✅)
- `src/hooks/useAdminSub.ts` (Phase 1 ✅)
- `src/hooks/useClubRecordSubscription.ts` (Phase 1 ✅)
- `amplify/data/resource.ts` (Phase 1 ✅)

---

## Out of Scope (Phase 3+)

- Infinite scroll pagination (initial load only)
- Advanced filtering UI (admin can sort in-app)
- Booking calendar integration
- Agent WhatsApp message interception
- Broadcast marketing UI

---

## References

- Phase 1 Summary: `STD_IMPLEMENTATION_SUMMARY.md`
- Implementation Guide: `STD_IMPLEMENTATION_GUIDE.md`
- Data Models: `src/lib/models.ts`
- Custom Hooks: `src/hooks/useAdminSub.ts`, `src/hooks/useClubRecordSubscription.ts`
