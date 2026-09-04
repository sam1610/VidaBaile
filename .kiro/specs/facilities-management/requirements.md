# Requirements: Facilities Management

## 1. User Stories

### 1.1 Admin Views All Facilities
**As an** admin,  
**I want to** view all facilities/dancing halls in a card grid layout,  
**So that** I can see real-time capacity and occupancy information.

**Acceptance Criteria:**
- Display all facilities as responsive cards (mobile, tablet, desktop)
- Show facility name, capacity, current occupancy, occupancy percentage
- Show availability status (ACTIVE, MAINTENANCE, CLOSED)
- Cards display occupancy as a visual progress bar with color coding:
  - GREEN (0-50%): Under-utilized
  - AMBER (50-80%): Good utilization
  - RED (80-100%): High demand
- No table scans allowed; use GSI1 for all facility queries

---

### 1.2 Admin Creates New Facility
**As an** admin,  
**I want to** open a modal form to add a new facility,  
**So that** I can register new dancing halls in the system.

**Acceptance Criteria:**
- "Add Facility" button opens a create modal
- Modal includes form fields:
  - Name (required, text input)
  - Capacity (required, integer, > 0)
  - Location (optional, text input)
  - Description (optional, text area)
  - Status (required, dropdown: ACTIVE, MAINTENANCE, CLOSED)
- Form validation before submission:
  - Name must not be empty
  - Capacity must be a positive integer
  - Show validation errors inline
- On successful save:
  - Modal closes
  - Facility card appears in the grid (real-time update via GSI1 query)
  - Success notification displayed
- On error: Display error message and allow retry
- No table scans; use indexed create operation

---

### 1.3 Admin Edits Facility Details
**As an** admin,  
**I want to** click "Edit" on a facility card to modify its details,  
**So that** I can update name, capacity, description, location, and status.

**Acceptance Criteria:**
- Clicking "Edit" button opens modal with current facility data pre-populated
- Editable fields: name, capacity, location, description, status
- facilityId is read-only (immutable sort key)
- Form validation same as create (name required, capacity > 0)
- On successful save:
  - Modal closes
  - Facility card updates immediately
  - Success notification displayed
- On error: Display error message and allow retry
- Use GSI1 for facility lookup; no table scan

---

### 1.4 Admin Deletes a Facility
**As an** admin,  
**I want to** remove a facility from the system,  
**So that** obsolete or closed facilities no longer appear.

**Acceptance Criteria:**
- "Delete" button on each facility card
- Clicking delete shows a confirmation dialog:
  - "Are you sure you want to delete [Facility Name]?"
  - Confirm/Cancel buttons
- On confirm:
  - Facility record deleted from DynamoDB
  - Card removed from grid (real-time update)
  - Success notification displayed
- On cancel: Dialog closes, no changes made
- Deletion uses pk + sk direct lookup (no scan)
- Prevent accidental deletion via confirmation gate

---

### 1.5 Admin Filters Facilities by Status
**As an** admin,  
**I want to** filter facilities by status (ACTIVE, MAINTENANCE, CLOSED),  
**So that** I can focus on relevant facilities.

**Acceptance Criteria:**
- Status filter dropdown above facility grid
- Options: All, ACTIVE, MAINTENANCE, CLOSED
- "All" shows all facilities regardless of status
- Selecting a status filters the displayed cards
- Filter results load via GSI1 range query (no table scan)
- Filter state persists during the admin session

---

### 1.6 Facilities Section in Settings Tab
**As an** admin,  
**I want to** see a dedicated Facilities section in the Settings tab,  
**So that** facility management is colocated with other admin settings.

**Acceptance Criteria:**
- Facilities management UI exists in Settings tab (can be a dedicated section below Agent AI config)
- Facilities section shows all available facility cards
- "Add Facility" button visible
- Edit/Delete buttons on each card
- Status filter dropdown visible
- Responsive layout (works on mobile, tablet, desktop)
- No sidebar navigation added (tab-based only)

---

## 2. Database Requirements

### 2.1 Facility Entity Structure (STD Compliance)

| Field | Type | Purpose | Example |
|---|---|---|---|
| pk | String | Admin Cognito SUB (partition key) | `us-east-1:admin123` |
| sk | String | Facility sort key | `FACILITY#fac-001` |
| gsi1pk | String | Facility grouping | `{adminSub}#FACILITIES` |
| gsi1sk | String | Status-based filtering & sorting | `STATUS#ACTIVE#NAME#La Vida Hall` |
| gsi2pk | String | Temporal grouping | `{adminSub}#FACILITIES` |
| gsi2sk | String | Creation timestamp | `CREATED#2024-09-03T10:00:00Z` |
| entityType | String | Type discriminator | `FACILITY` |
| name | String | Facility name | "La Vida Hall" |
| capacity | Integer | Max occupancy | 40 |
| occupancy | Integer | Current occupancy | 28 |
| location | String | Physical location | "2nd Floor, Building A" |
| description | String | Facility details | "Spacious hall with mirrors and dance floor" |
| status | String | ACTIVE, MAINTENANCE, CLOSED | "ACTIVE" |
| createdAt | DateTime | Auto-managed | ISO 8601 timestamp |
| updatedAt | DateTime | Auto-managed | ISO 8601 timestamp |

### 2.2 Key Patterns

**Primary Key Pattern:**
```
pk: {adminSub}                          // Multi-tenant isolation
sk: FACILITY#{facilityId}               // Entity identification
```

**GSI1 Pattern (Status-Based Filtering):**
```
gsi1pk: {adminSub}#FACILITIES           // All facilities for this admin
gsi1sk: STATUS#{status}#NAME#{name}    // Filter by status, sort by name
```

**GSI2 Pattern (Temporal Queries):**
```
gsi2pk: {adminSub}#FACILITIES
gsi2sk: CREATED#{createdAt}             // Chronological ordering
```

### 2.3 Query Access Patterns

| Use Case | Query | Index | Scan? |
|---|---|---|---|
| Get all facilities | gsi1pk = `{sub}#FACILITIES` | GSI1 | No |
| Filter by status | gsi1pk = `{sub}#FACILITIES` AND gsi1sk begins_with `STATUS#{status}` | GSI1 | No |
| Get facility by ID | pk = `{sub}` AND sk = `FACILITY#{id}` | Primary | No |
| Delete facility | pk = `{sub}` AND sk = `FACILITY#{id}` | Primary | No |

---

## 3. UI/UX Requirements

### 3.1 Facility Card Display
- **Format**: Responsive grid (auto-fit, minmax 250px)
- **Card Content**:
  - Facility name (bold, 14px)
  - Capacity badge: "Capacity: X people"
  - Occupancy progress bar (color-coded)
  - Occupancy percentage (aligned right)
  - Current occupancy: "X / Y people"
  - Location (if provided)
  - Status badge (ACTIVE=green, MAINTENANCE=amber, CLOSED=red)
  - Edit button (pencil icon)
  - Delete button (trash icon)

### 3.2 Facility Modal
- **Title**: "Add New Facility" (create) or "Edit Facility" (edit)
- **Fields**:
  - Name (text input, required)
  - Capacity (number input, required, min=1)
  - Location (text input, optional)
  - Description (textarea, optional)
  - Status (dropdown: ACTIVE, MAINTENANCE, CLOSED, required)
- **Actions**:
  - Save button (disabled while saving)
  - Cancel button (closes modal)
  - Error message area (red background)
- **Behavior**:
  - Close on backdrop click
  - Form validation on save attempt
  - Clear form on close
  - Disable submit while request in flight

### 3.3 Delete Confirmation Dialog
- **Message**: "Are you sure you want to delete [Facility Name]? This action cannot be undone."
- **Buttons**: Confirm (red), Cancel (gray)
- **Behavior**: Modal overlay, prevents accidental deletion

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **Query Latency**: All facility queries < 100ms (p95) via GSI1
- **No Table Scans**: Every query MUST target an index (GSI1 or primary key)
- **Real-time Updates**: Facility changes reflected in UI within 500ms
- **Grid Rendering**: 50+ facilities rendered smoothly on modern devices

### 4.2 Security
- **Auth Guard**: Only Cognito-authenticated admins (group: Admins) can access
- **Multi-Tenant Isolation**: Queries filtered by pk = adminSub at DB layer
- **Input Validation**:
  - Facility names: max 255 characters
  - Capacity: 1-1000
  - Location: max 500 characters
  - Description: max 2000 characters

### 4.3 Reliability
- **Error Handling**:
  - Graceful degradation if GSI1 query fails
  - User-friendly error messages
  - Retry capability for failed mutations
- **Data Consistency**: Immediate UI reflection of create/update/delete via real-time subscription or optimistic update

---

## 5. Compliance with Architecture

### 5.1 VidaBaile Steering Document

**Tab Navigation (Section 2.1):**
- ✅ Facilities management integrates into Settings tab (tab-based navigation)
- ✅ NO sidebar navigation added
- ✅ Responsive across mobile, tablet, desktop

**STD Compliance (Section 3.4):**
- ✅ Entity keys follow canonical patterns: `FACILITY#<id>`
- ✅ GSI1 uses status-based filtering for bulk queries
- ✅ Multi-tenant isolation via pk = adminSub

**Index-Only Queries (Section 2.3):**
- ✅ All queries explicitly use GSI1 or primary key
- ✅ No table scans in DatabaseService
- ✅ Filter results in application layer

**Auth (Section 7):**
- ✅ `allow.groups(['Admins'])` on all Facility CRUD mutations
- ✅ Cognito JWT validated by AppSync
- ✅ Lambda tool functions use IAM role (service-to-service)

---

## 6. Out of Scope

- Facility booking/availability calendar (separate Appointments feature)
- Facility analytics/usage trends (separate reporting feature)
- Bulk facility import/export
- Facility images or media storage
- Facility-specific pricing or package rules

---

## 7. Success Criteria

1. ✅ All facilities listed in Settings tab with real-time updates
2. ✅ Admin can create, read, update, delete facilities
3. ✅ All queries use indexes only (no table scans)
4. ✅ Facilities section responsive on mobile/tablet/desktop
5. ✅ Validation prevents invalid facility data
6. ✅ Multi-tenant isolation enforced at DB layer
7. ✅ Error handling and retry mechanisms in place
8. ✅ Code follows VidaBaile architecture patterns
