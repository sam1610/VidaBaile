# Tasks: Facilities Management

## Overview
This task list implements Facilities Management for VidaBaile Settings tab. All tasks follow strict STD compliance with index-based queries (no table scans).

---

## Phase 1: Backend Setup

### 1.1 Update Data Schema
- [ ] Extend amplify/data/resource.ts:
  - Add 'FACILITY' to entityType enum
  - Add facility-specific attributes: facilityId, facilityCapacity, facilityOccupancy, facilityLocation, facilityDescription
  - Ensure FACILITY entity type is optional (null for non-facility records)
- [ ] Verify GSI1 and GSI2 patterns support facility queries

**Success Criteria:**
- Schema compiles without errors
- `amplify deploy` succeeds
- Schema introspection includes FACILITY entity type

---

### 1.2 Add Facility Models & Type Definitions
- [ ] Update src/lib/models.ts:
  - Create Facility interface with all required fields
  - Create FacilityInput interface (subset for mutations)
  - Implement createFacility() factory function
  - Implement isFacility() type guard
  - Export Facility and FacilityInput types

**Success Criteria:**
- All Facility types compile
- Type guards correctly identify facility records
- createFacility() constructs valid STD keys

---

### 1.3 Implement DatabaseService Facility Functions
- [ ] Add to src/services/DatabaseService.ts:
  - createFacilityRecord(adminSub, facilityId, data): Creates facility via direct PUT
  - getFacilityByIdRecord(adminSub, facilityId): Gets single facility via pk+sk
  - updateFacilityRecord(adminSub, facilityId, data): Updates facility via primary key
  - deleteFacilityRecord(adminSub, facilityId): Deletes facility via pk+sk
  - queryAllFacilitiesRecord(adminSub): Query GSI1 to get all facilities (no scan)
  - queryFacilitiesByStatusRecord(adminSub, status): Query GSI1 with status filter (no scan)

- [ ] Document each function with:
  - STD key patterns used
  - Query strategy (index name, no scans)
  - Parameter descriptions
  - Return types
  - Error handling

**Success Criteria:**
- All functions exported from DatabaseService
- No table scans in any function (only GSI1 or primary key)
- All GSI1 queries use beginsWith for range queries
- Error messages are descriptive
- Compiled without TS errors

---

## Phase 2: Frontend Components

### 2.1 Create FacilitiesManager Container Component
- [ ] Create src/components/facilities/FacilitiesManager.tsx:
  - Props: adminSub (string)
  - State:
    - facilities: Facility[] (from GSI1 query)
    - statusFilter: 'all' | 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
    - isModalOpen: boolean
    - editingFacility: Facility | null
    - deleteCandidate: Facility | null
    - loading: boolean
    - error: string | null

  - Effects:
    - Load facilities on mount (queryAllFacilitiesRecord)
    - Subscribe to real-time facility changes (optional)
    - Filter facilities by status when filter changes

  - Handlers:
    - handleCreateFacility(data): createFacilityRecord
    - handleUpdateFacility(id, data): updateFacilityRecord
    - handleDeleteFacility(id): deleteFacilityRecord
    - setStatusFilter(status): Filter facilities

  - Render:
    - StatusFilter component
    - "Add Facility" button
    - FacilitiesGrid component with filtered facilities
    - FacilityModal for create/edit
    - DeleteConfirmDialog
    - Error/loading states

**Success Criteria:**
- Component renders without errors
- Loads facilities on mount
- Creates, updates, deletes facilities via DatabaseService
- Displays filtered results based on status
- Modal opens/closes correctly

---

### 2.2 Create FacilitiesGrid Presentation Component
- [ ] Create src/components/facilities/FacilitiesGrid.tsx:
  - Props:
    - facilities: Facility[]
    - onEdit: (facility: Facility) => void
    - onDeleteClick: (facility: Facility) => void
  - Display empty state if no facilities
  - Render grid of FacilityCard components

**Success Criteria:**
- Grid renders with responsive layout (auto-fit, minmax 250px)
- Empty state displays when no facilities
- Edit/Delete handlers called on card actions

---

### 2.3 Create FacilityCard Presentation Component
- [ ] Create src/components/facilities/FacilityCard.tsx:
  - Props:
    - facility: Facility
    - onEdit: () => void
    - onDelete: () => void
  
  - Display:
    - Facility name (14px, bold)
    - Status badge (ACTIVE=green, MAINTENANCE=amber, CLOSED=red)
    - Edit/Delete buttons (top right)
    - Capacity: "X people"
    - Occupancy progress bar (color-coded: green 0-50%, amber 50-80%, red 80-100%)
    - Occupancy percentage (aligned right)
    - "X / Y people" text
    - Location (if provided, with emoji)

  - Styling:
    - White background, 1px border, 4px radius
    - Hover effects on buttons
    - Smooth progress bar animation

**Success Criteria:**
- Card renders with all required fields
- Occupancy color coding correct (0-50% green, 50-80% amber, 80-100% red)
- Edit/Delete buttons visible and clickable
- Responsive on mobile (all text readable)

---

### 2.4 Create FacilityModal Form Component
- [ ] Create src/components/facilities/FacilityModal.tsx:
  - Props:
    - isOpen: boolean
    - facility: Facility | null (null for create, populated for edit)
    - onClose: () => void
    - onSave: (data: FacilityInput) => Promise<void>

  - Form Fields:
    - Name (text input, required)
    - Capacity (number input, required, min=1, max=1000)
    - Location (text input, optional)
    - Description (textarea, optional, 4 rows)
    - Status (dropdown: ACTIVE, MAINTENANCE, CLOSED, required)

  - Validation:
    - Name: required, max 255 chars
    - Capacity: required, 1-1000 range
    - Location: max 500 chars
    - Description: max 2000 chars
    - Show inline field errors (red text)
    - Disable submit while validation fails

  - State Management:
    - Load facility data on edit mode
    - Clear form on close
    - Show saving state (disable button, show spinner)
    - Display error message (red background)

  - Accessibility:
    - Modal overlay (click outside to close)
    - Accessible form labels
    - Focus management

**Success Criteria:**
- Modal opens/closes correctly
- Form populates with facility data in edit mode
- Form clears in create mode
- Validation shows inline errors
- Submit disabled while invalid
- Saving state shows (button disabled, spinner)
- Modal closes on successful save

---

### 2.5 Create StatusFilter Component
- [ ] Create src/components/facilities/StatusFilter.tsx:
  - Props:
    - value: 'all' | 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
    - onChange: (status) => void

  - Render:
    - Select dropdown with 4 options: All, ACTIVE, MAINTENANCE, CLOSED

**Success Criteria:**
- Dropdown renders with all options
- onChange called when selection changes
- Current value highlighted

---

### 2.6 Create DeleteConfirmDialog Component
- [ ] Create src/components/facilities/DeleteConfirmDialog.tsx:
  - Props:
    - isOpen: boolean
    - facility: Facility | null
    - onConfirm: (id: string) => Promise<void>
    - onCancel: () => void

  - Display:
    - Title: "Delete Facility?"
    - Message: "Are you sure you want to delete [Facility Name]? This action cannot be undone."
    - Warning box with yellow background
    - Confirm button (red)
    - Cancel button (gray)

  - State Management:
    - Show deleting state (button disabled, spinner)
    - Display error message (red background)
    - Close on cancel

  - Accessibility:
    - Modal overlay
    - Focus management
    - Keyboard: Escape to cancel, Enter to confirm

**Success Criteria:**
- Dialog displays confirmation message with facility name
- Confirm/Cancel buttons work
- Deleting state shows
- Error messages display
- Dialog closes after confirmation

---

### 2.7 Update SettingsTab Component
- [ ] Update src/components/settings/SettingsTab.tsx:
  - Import FacilitiesManager component
  - Get current admin's SUB from Amplify auth context
  - Add Facilities section (full width, below Development Tools)
  - Heading: "🏛️ FACILITIES & ROOMS"
  - Render: <FacilitiesManager adminSub={adminSub} />

**Success Criteria:**
- SettingsTab compiles without errors
- Facilities section appears in Settings tab
- FacilitiesManager renders with adminSub passed
- Tab layout remains responsive

---

### 2.8 Update index.ts Exports
- [ ] Update src/components/facilities/index.ts:
  - Export all facility components:
    - FacilitiesManager
    - FacilitiesGrid
    - FacilityCard
    - FacilityModal
    - StatusFilter
    - DeleteConfirmDialog

**Success Criteria:**
- All exports available
- No circular dependencies

---

## Phase 3: Styling & Polish

### 3.1 Create Facility Styles (Optional CSS Modules)
- [ ] Create src/components/facilities/FacilitiesManager.css:
  - Container padding/spacing
  - Grid responsive breakpoints
  - Modal overlay styling

- [ ] Create src/components/facilities/FacilityModal.css (optional):
  - Modal styling (shadow, border radius)
  - Form field spacing
  - Button states

**Success Criteria:**
- All components styled consistently
- No layout issues on mobile/tablet/desktop

---

## Phase 4: Testing

### 4.1 Unit Tests: DatabaseService Functions
- [ ] Test file: src/services/DatabaseService.test.ts
  - createFacilityRecord: Creates facility with correct STD keys
  - getFacilityByIdRecord: Retrieves facility by pk+sk
  - updateFacilityRecord: Updates facility and regenerates GSI1SK
  - deleteFacilityRecord: Deletes facility
  - queryAllFacilitiesRecord: Returns all facilities via GSI1 (verify no scan)
  - queryFacilitiesByStatusRecord: Filters by status via GSI1 (verify no scan)
  - Error handling for missing facilities

**Success Criteria:**
- All tests pass
- No table scans in any test scenario
- All GSI1 queries verified

---

### 4.2 Component Tests: FacilitiesManager
- [ ] Test file: src/components/facilities/FacilitiesManager.test.tsx
  - Renders facility cards with mock data
  - Opens modal on "Add Facility" click
  - Opens modal with facility data on "Edit" click
  - Calls createFacilityRecord on form submit (create)
  - Calls updateFacilityRecord on form submit (edit)
  - Calls deleteFacilityRecord on confirm delete
  - Filters facilities by status
  - Shows error message on failure
  - Shows loading state

**Success Criteria:**
- All tests pass
- No TS errors
- Mock DatabaseService functions called correctly

---

### 4.3 Component Tests: FacilityModal
- [ ] Test file: src/components/facilities/FacilityModal.test.tsx
  - Renders create form (empty fields)
  - Renders edit form (populated fields)
  - Validates required fields (name, capacity, status)
  - Validates capacity range (1-1000)
  - Shows validation errors inline
  - Disables submit while invalid
  - Calls onSave with correct data
  - Closes on cancel

**Success Criteria:**
- All tests pass
- Form validation working
- Error messages display

---

### 4.4 Component Tests: FacilityCard
- [ ] Test file: src/components/facilities/FacilityCard.test.tsx
  - Renders facility name, capacity, occupancy
  - Shows occupancy color correctly (green, amber, red)
  - Edit button calls onEdit
  - Delete button calls onDelete
  - Displays location if provided

**Success Criteria:**
- All tests pass
- Occupancy color coding correct

---

### 4.5 Component Tests: DeleteConfirmDialog
- [ ] Test file: src/components/facilities/DeleteConfirmDialog.test.tsx
  - Renders confirmation message with facility name
  - Confirm button calls onConfirm
  - Cancel button calls onCancel
  - Shows deleting state while request in flight

**Success Criteria:**
- All tests pass
- Dialog behavior correct

---

## Phase 5: Integration & Deployment

### 5.1 Integration Tests: End-to-End User Flow
- [ ] Test scenario 1: Add facility
  - Click "Add Facility" → Modal opens
  - Fill form → Submit
  - Facility appears in grid
  - Verify facility queryable via GSI1

- [ ] Test scenario 2: Edit facility
  - Click "Edit" on card → Modal opens with data
  - Change name → Submit
  - Card updates immediately
  - Verify GSI1SK updated (name changed)

- [ ] Test scenario 3: Delete facility
  - Click "Delete" → Confirmation appears
  - Confirm → Facility removed from grid
  - Verify facility deleted from DynamoDB

- [ ] Test scenario 4: Filter by status
  - Create facilities with different statuses
  - Select "ACTIVE" filter → Only active facilities shown
  - Select "MAINTENANCE" filter → Only maintenance facilities shown
  - Verify GSI1 range query used (no scan)

**Success Criteria:**
- All user flows complete successfully
- No table scans observed in CloudWatch logs
- Multi-admin isolation verified (separate admins see separate facilities)

---

### 5.2 Performance Testing
- [ ] Create 50+ facilities in test admin account
- [ ] Measure GSI1 query latency (should be < 100ms)
- [ ] Verify grid rendering smooth (no layout thrashing)
- [ ] Check memory usage (no leaks in real-time subscription)

**Success Criteria:**
- GSI1 queries < 100ms (p95)
- Grid renders smoothly
- No memory leaks
- No table scans in CloudWatch logs

---

### 5.3 Security Testing
- [ ] Verify admin cannot view other admin's facilities
- [ ] Verify unauthenticated users cannot access API
- [ ] Verify input validation prevents injection attacks
- [ ] Verify all queries include adminSub filter

**Success Criteria:**
- Multi-tenant isolation confirmed
- Auth guard working
- Input validation preventing attacks

---

### 5.4 Deployment to Sandbox
- [ ] Deploy updated schema to sandbox
- [ ] Deploy backend changes
- [ ] Deploy frontend components
- [ ] Run all tests in sandbox environment
- [ ] Verify facilities appear in SettingsTab

**Success Criteria:**
- No deploy errors
- All tests pass in sandbox
- FacilitiesManager visible and functional

---

### 5.5 Deployment to Production
- [ ] Code review by team
- [ ] Final testing checklist
- [ ] Deploy backend schema changes
- [ ] Deploy frontend changes
- [ ] Monitor CloudWatch logs for errors
- [ ] Gather user feedback

**Success Criteria:**
- Zero deployment errors
- No increase in error rate
- Users can create/edit/delete facilities
- Performance targets met

---

## Completion Checklist

- [ ] All 16 tasks completed
- [ ] All tests passing
- [ ] No table scans in any operation
- [ ] Multi-tenant isolation verified
- [ ] Performance targets met (< 100ms queries)
- [ ] Code review approved
- [ ] Deployed to production
- [ ] User documentation updated
- [ ] Monitoring & alerts configured
