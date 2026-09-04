# Requirements Document: Settings Tab & DatabaseService Extensions

## Introduction

This document specifies the requirements for implementing a comprehensive Settings Tab in the VidaBaile Admin Dashboard and extending the DatabaseService.ts data access layer. The Settings Tab enables administrators to configure club-wide settings (name, contact details, operating hours, cancellation policy, currency), manage facilities (dance halls, courts), and upload documents to the AI Knowledge Base.

The implementation maintains strict adherence to VidaBaile's architectural constraints: multi-tenant isolation via Cognito SUB, Single-Table Design patterns, tab-based navigation (no sidebar), and native AWS services only.

---

## Glossary

- **Admin**: A staff member with Cognito credentials and administrative privileges to manage club settings and facilities.
- **AdminSub**: The unique Cognito Subject ID of an admin (partition key in DynamoDB).
- **Club Settings**: Global configuration for a dance club including name, address, phone, operating hours, cancellation policy, and currency.
- **Facility**: A physical location or resource (dance hall, court, studio) within the club that can host activities.
- **Single-Table Design (STD)**: A DynamoDB pattern using composite keys (pk + sk) and multiple GSIs to normalize multiple entity types into a single table.
- **Tenant Isolation**: Data segregation where each admin's records are stored separately and not visible to other admins.
- **Operating Hours**: Daily schedule specifying business opening and closing times (e.g., 08:00–20:00).
- **Cancellation Window**: Number of hours before a scheduled event during which bookings can be cancelled without penalty.
- **S3 Prefix**: A folder-like path in an S3 bucket used to organize files by tenant (e.g., `lavida-baile-bh/<adminSub>/kb/`).
- **Knowledge Base**: Repository of documents stored in S3 that inform the AI agent's responses to member queries.
- **Currency**: ISO 4217 code representing the monetary unit used for pricing (e.g., USD, BRL).
- **UI Component**: React component from Amplify UI Components or custom-built element for rendering admin interface.

---

## Requirements

### Requirement 1: Club Settings Creation & Storage

**User Story:** As an admin, I want to create and store club settings (name, address, contact info, operating hours, cancellation policy, currency) in the database, so that the system reflects my club's configuration and the AI agent can reference this information when responding to members.

#### Acceptance Criteria

1. WHEN an admin submits the Settings form with all required fields (Club Name, Address, Phone, Operating Hours, Cancellation Window, Currency), THE DatabaseService `updateClubSettings()` function SHALL construct a DynamoDB record with pk=`<adminSub>`, sk=`SETTINGS#GLOBAL`, and entityType=`SETTINGS`.

2. WHEN `updateClubSettings()` is called, THE resulting DynamoDB item SHALL include the following attributes: clubName, address, phone, operatingHours (JSON array), cancellationWindowHours, currency, createdAt, updatedAt.

3. WHEN an admin clicks the Save button on the Settings form, THE SettingsDashboard component SHALL call `updateClubSettings()` with the form data and display a success toast notification upon completion.

4. IF the `updateClubSettings()` call fails, THEN the SettingsDashboard component SHALL display an error message in a dismissible alert banner and allow the user to retry.

5. WHEN the SettingsDashboard mounts, THE component SHALL invoke a GraphQL query to fetch existing club settings for the authenticated admin via DatabaseService and hydrate the form fields.

6. WHILE club settings do not yet exist for an admin, THE form SHALL display empty fields and allow the admin to create settings for the first time.

### Requirement 2: Facility Management — Create, List, and Query

**User Story:** As an admin, I want to create facilities (dance halls, courts) and query all facilities for my club, so that I can organize activities by location and assign classes to specific spaces.

#### Acceptance Criteria

1. WHEN an admin fills out the "Add Facility" form with Facility Name and Max Capacity, THE DatabaseService `createFacility()` function SHALL construct a DynamoDB record with pk=`<adminSub>`, sk=`FACILITY#<facilityId>`, gsi1pk=`<adminSub>#FACILITIES`, and include attributes: facilityName, maxCapacity, createdAt, updatedAt.

2. WHEN the SettingsDashboard mounts, THE DatabaseService `listFacilities()` function SHALL query all facilities for the admin using gsi1pk=`<adminSub>#FACILITIES` and return them in display order (most recently created first).

3. WHEN a facility is created or updated, THE SettingsDashboard UI SHALL immediately reflect the change in the facilities list (real-time update via subscription or refetch).

4. WHEN an admin submits the "Add Facility" form, THE component SHALL clear the form, close the modal (if applicable), and display a success toast notification.

5. IF the `createFacility()` call fails due to duplicate facility name or database error, THEN the component SHALL display a descriptive error message and retain the form data for user correction.

6. WHEN the facilities list is empty, THE UI SHALL display a "No facilities yet" message with a call-to-action to add the first facility.

### Requirement 3: AI Knowledge Base Document Upload to S3

**User Story:** As an admin, I want to upload documents to the AI Knowledge Base with tenant-scoped S3 paths, so that the AI agent can reference club-specific information when answering member queries.

#### Acceptance Criteria

1. WHEN an admin selects a file from the Knowledge Base upload component, THE SettingsDashboard component SHALL construct the S3 upload path as `lavida-baile-bh/<adminSub>/kb/<fileName>`.

2. WHEN `uploadData()` is invoked with the tenant-scoped path, THE file SHALL be uploaded to S3 under the admin's prefix, ensuring strict data isolation and preventing unauthorized access to other admins' knowledge base files.

3. WHEN an upload completes successfully, THE SettingsDashboard component SHALL fetch the list of documents from the S3 prefix `lavida-baile-bh/<adminSub>/kb/` and display them in a read-only list.

4. IF a file upload fails (network error, file too large, quota exceeded), THEN the component SHALL display an error message and allow the user to retry.

5. WHEN the SettingsDashboard mounts, THE component SHALL query S3 for all documents under the admin's knowledge base prefix and display them in the UI.

6. WHERE an admin has no documents uploaded yet, THE Knowledge Base section SHALL display an empty state with instructions to upload the first document.

### Requirement 4: SettingsDashboard UI Component Structure

**User Story:** As an admin, I want a well-organized Settings Tab with multiple sections (General Info, Operating Rules, Facilities Manager, Knowledge Base), so that I can easily find and manage different aspects of club configuration.

#### Acceptance Criteria

1. WHEN the SettingsDashboard component mounts, THE UI SHALL display four distinct sections: General Info, Operating Rules, Facilities Manager, and AI Knowledge Base.

2. THE General Info section SHALL include text input fields for Club Name, Address, Phone, and a dropdown for Currency (ISO 4217 codes: USD, EUR, BRL, etc.).

3. THE Operating Rules section SHALL include time picker components for Daily Opening Time and Daily Closing Time, and a numeric input for Cancellation Window (in hours).

4. THE Facilities Manager section SHALL display a table or list of existing facilities (Name, Max Capacity, Actions) and include an "Add Facility" button that opens a modal or inline form.

5. THE AI Knowledge Base section SHALL include a file upload component (StorageManager or uploadData API) and a read-only list of currently uploaded documents with file metadata (name, upload date, size).

6. WHEN the user scrolls within the SettingsDashboard, THE sections SHALL remain vertically stacked with clear visual separation (spacing, dividers, or background colors) using Amplify UI tokens or CSS modules (no Tailwind).

7. THE SettingsDashboard component SHALL load successfully and display a loading spinner or skeleton while fetching initial club settings and facilities data.

### Requirement 5: DatabaseService Extension — updateClubSettings()

**User Story:** As a developer, I want a DatabaseService function `updateClubSettings()` that safely wraps club settings mutations, so that the component layer is decoupled from DynamoDB key construction and validation.

#### Acceptance Criteria

1. WHEN `updateClubSettings(adminSub, settingsData)` is called, THE function SHALL construct a DynamoDB item with pk=`<adminSub>`, sk=`SETTINGS#GLOBAL`, entityType=`SETTINGS`, and copy all fields from settingsData (clubName, address, phone, operatingHours, cancellationWindowHours, currency).

2. THE function SHALL invoke `ClubRecord.update()` (create if not exists, update if exists) via the Amplify client and return the saved record.

3. IF any field is missing or invalid (e.g., cancellationWindowHours is not a number, operatingHours is not a valid array), THEN `updateClubSettings()` SHALL throw an error with a descriptive message.

4. THE function SHALL include JSDoc comments documenting the STD pattern, expected key structure, and parameter types.

5. WHEN the function completes successfully, THE returned object SHALL include createdAt and updatedAt timestamps (auto-managed by AppSync).

### Requirement 6: DatabaseService Extension — createFacility()

**User Story:** As a developer, I want a DatabaseService function `createFacility()` that creates facility records with proper STD key patterns, so that facilities can be organized and queried by admin.

#### Acceptance Criteria

1. WHEN `createFacility(adminSub, facilityData)` is called with facilityData containing facilityName and maxCapacity, THE function SHALL generate a unique facilityId (UUID or nanoid) and construct a DynamoDB item with pk=`<adminSub>`, sk=`FACILITY#<facilityId>`, gsi1pk=`<adminSub>#FACILITIES`, and include attributes: facilityName, maxCapacity, entityType=`FACILITY`.

2. THE function SHALL invoke `ClubRecord.create()` via the Amplify client and return the created record.

3. IF facilityName is empty or maxCapacity is not a positive integer, THEN `createFacility()` SHALL throw a validation error before attempting to create the record.

4. WHEN the function completes successfully, THE returned object SHALL include createdAt and updatedAt timestamps.

5. THE function signature SHALL match the existing DatabaseService pattern: `async function createFacility(adminSub: string, facilityData: { facilityName: string; maxCapacity: number }): Promise<Facility>`.

### Requirement 7: DatabaseService Extension — listFacilities()

**User Story:** As a developer, I want a DatabaseService function `listFacilities()` that efficiently queries all facilities for an admin, so that components can fetch and display the complete list without writing custom GraphQL queries.

#### Acceptance Criteria

1. WHEN `listFacilities(adminSub)` is called, THE function SHALL query the DynamoDB table using gsi1pk=`<adminSub>#FACILITIES` and return all records where entityType=`FACILITY`.

2. THE query SHALL use the Amplify client's query method (or custom AppSync query) and filter results by the gsi1pk index.

3. IF no facilities exist for the admin, THE function SHALL return an empty array (not an error).

4. WHEN facilities are returned, THEY SHALL be sorted by createdAt in descending order (most recently created first).

5. EACH facility record returned SHALL include all fields: pk, sk, gsi1pk, facilityName, maxCapacity, entityType, createdAt, updatedAt.

6. IF the query fails due to database error, THE function SHALL throw an error with a descriptive message and include the underlying error details in the log.

### Requirement 8: S3 Upload Path Isolation & Multi-Tenancy

**User Story:** As a developer, I want the upload component to enforce tenant-scoped S3 paths, so that each admin's knowledge base documents are isolated and inaccessible to other admins.

#### Acceptance Criteria

1. WHEN a file is selected for upload in the Knowledge Base section, THE SettingsDashboard component SHALL construct the S3 key as `lavida-baile-bh/<adminSub>/kb/<fileName>`.

2. THE uploadData() call SHALL include this path explicitly, ensuring the file is stored under the admin's prefix.

3. IF an admin attempts to access another admin's knowledge base files, THEN the S3 bucket policy SHALL deny the request (enforced at the bucket and IAM policy level, not in code).

4. WHEN files are listed from S3, THE component SHALL query only the prefix `lavida-baile-bh/<adminSub>/kb/` and return files belonging to the authenticated admin.

5. THE S3 bucket and IAM roles SHALL be configured to enforce least-privilege access (admin can only read/write their own prefix).

### Requirement 9: Form Validation & Error Handling

**User Story:** As an admin, I want the Settings form to validate inputs and display clear error messages, so that I can correct mistakes and understand what went wrong.

#### Acceptance Criteria

1. WHEN the admin attempts to save settings with missing required fields (Club Name, Address, Phone, Operating Hours, Cancellation Window, Currency), THE form SHALL display a validation error near each empty field.

2. WHEN the Operating Hours fields contain invalid values (not HH:MM format, closing time before opening time), THE component SHALL display an inline error message.

3. WHEN a DatabaseService call fails, THE SettingsDashboard component SHALL display an error alert banner with the underlying error message (or a generic "Failed to save" message if details are not available).

4. THE error banner SHALL include a dismiss button (X) allowing the user to close it.

5. WHEN the user corrects the invalid input and resubmits, THE form SHALL clear the previous error state and attempt the save again.

### Requirement 10: Real-Time Updates via Subscription

**User Story:** As an admin, I want facility and settings changes to appear immediately in the UI without requiring a page refresh, so that I can see updates in real-time.

#### Acceptance Criteria

1. WHEN a facility is created or updated by this admin, THE SettingsDashboard component SHALL update the facilities list via AppSync subscription or by refetching the list.

2. WHEN the SettingsDashboard mounts, THE component SHALL subscribe to ClubRecord changes where pk=`<adminSub>` and entityType IN ('FACILITY', 'SETTINGS') to receive real-time updates.

3. WHEN a subscription receives a new event, THE component SHALL update the corresponding section (facilities list or settings form) without requiring manual refresh.

4. WHEN the SettingsDashboard unmounts or the user logs out, ALL subscriptions SHALL be automatically cleaned up to prevent memory leaks.

### Requirement 11: Facility Modal/Form UX

**User Story:** As an admin, I want a simple modal or inline form to add facilities, so that I can quickly create new spaces without navigating away from the Settings Tab.

#### Acceptance Criteria

1. WHEN the user clicks the "Add Facility" button, A modal or inline form SHALL appear with input fields for Facility Name and Max Capacity.

2. THE modal SHALL include Save and Cancel buttons (or Submit and Clear for inline form).

3. WHEN the user clicks Save, THE form data SHALL be validated, passed to `createFacility()`, and upon success, the modal SHALL close and the facilities list SHALL update.

4. WHEN the user clicks Cancel, THE modal SHALL close without saving changes.

5. IF the save fails, THE modal SHALL remain open, retain the form data, and display an error message.

6. THE modal component SHALL be keyboard-accessible: Tab navigation, Enter to submit, Escape to cancel.

### Requirement 12: Responsive Design & Mobile Compatibility

**User Story:** As an admin using a mobile or tablet device, I want the Settings Tab to be fully responsive, so that I can manage settings on any screen size.

#### Acceptance Criteria

1. THE SettingsDashboard component SHALL use responsive layout (flexbox or grid) to stack sections vertically on mobile (< 768px) and display them in columns or rows on desktop (≥ 768px).

2. ON mobile screens, form input fields SHALL be full-width and easily tappable (minimum touch target size ≥ 44px per WCAG guidelines).

3. ON tablet and desktop, the layout SHALL utilize available space efficiently (e.g., two columns for General Info and Operating Rules side-by-side on larger screens).

4. THE facilities table SHALL be scrollable horizontally on mobile if column count or width exceeds viewport.

5. WHEN the viewport is resized, THE layout SHALL reflow smoothly without layout shift or broken element positioning.

### Requirement 13: Loading States & Skeleton UI

**User Story:** As an admin, I want to see loading indicators while the Settings Tab is fetching data, so that I know the system is working and can anticipate when the interface is ready.

#### Acceptance Criteria

1. WHEN the SettingsDashboard component mounts and settings/facilities data is being fetched, THE component SHALL display a loading spinner or skeleton placeholders.

2. THE loading state SHALL persist until all queries (club settings, facilities list, S3 document list) have completed or failed.

3. ONCE data is loaded, the loading indicators SHALL be hidden and the form/lists SHALL display the fetched data.

4. IF a refetch is triggered (e.g., after save), a smaller loading indicator or subtle state change SHALL indicate the update is in progress.

### Requirement 14: Knowledge Base Upload UX

**User Story:** As an admin, I want a clear, intuitive file upload component for adding documents to the Knowledge Base, so that I can easily upload club-specific information for the AI agent.

#### Acceptance Criteria

1. THE Knowledge Base section SHALL include a file upload area (drag-and-drop or file picker button) using Amplify UI's StorageManager component or the uploadData API.

2. WHEN a file is selected, THE component SHALL display the filename and allow the user to confirm or cancel the upload.

3. WHEN the upload completes, THE component SHALL add the file to the documents list and display a success toast notification.

4. THE documents list SHALL show file metadata: name, upload date (timestamp), and file size (optional).

5. WHERE file type restrictions apply (PDF, DOCX, TXT only), THE component SHALL reject other file types with a clear error message before uploading.

6. WHERE a file size limit exists (e.g., 10 MB), THE component SHALL validate file size and display an error if the limit is exceeded.

---

## Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Performance** | Club settings load in < 500ms on stable 4G connection. |
| **Scalability** | DatabaseService functions support concurrent requests from multiple admins without contention. |
| **Consistency** | Settings updates are reflected in the UI within 2 seconds (including subscription latency). |
| **Availability** | Settings Tab remains functional if S3 Knowledge Base upload temporarily fails (graceful degradation). |
| **Code Quality** | DatabaseService functions include JSDoc comments following existing patterns; components use TypeScript strict mode. |
| **Accessibility** | Settings form is keyboard-navigable and includes ARIA labels for screen readers (WCAG 2.1 Level AA target). |
| **Security** | All DynamoDB operations respect admin SUB isolation. S3 upload paths are enforced at the IAM policy level. |
| **Testing** | DatabaseService functions include type guards and validation; components include unit tests for form submission, error handling, and subscription cleanup. |

---

## Implementation Notes

### DatabaseService Integration

The three new DatabaseService functions (`updateClubSettings`, `createFacility`, `listFacilities`) SHALL follow the existing patterns in DatabaseService.ts:

- Accept `adminSub` as the first parameter (partition key).
- Use factory functions and type guards (if applicable) to construct records.
- Include comprehensive error handling and logging.
- Return type-safe objects matching the STD schema.
- Include JSDoc comments with STD pattern examples.

### Component Architecture

The SettingsDashboard component SHALL:

- Use the `useAdminSub()` hook to fetch the authenticated admin's Cognito SUB.
- Manage local form state via React hooks (useState, useRef).
- Call DatabaseService functions for all data mutations.
- Use AppSync subscriptions (via custom hooks or direct client) for real-time updates.
- Render sections using Amplify UI components (Button, TextField, etc.) and CSS modules for styling.
- Include error boundaries or try-catch blocks for graceful error handling.

### GraphQL Schema

The AppSync schema (amplify/data/resource.ts) SHALL define:

- A `ClubRecord` model with pk, sk, gsi1pk, gsi1sk attributes (already exists).
- Authorization rules: `allow.groups(['Admins'])` for authenticated admin access.
- Support for update-or-create semantics (DynamoDB upsert).

### S3 Configuration

The Amplify backend SHALL:

- Define an S3 bucket (e.g., `lavida-baile-bh`) as part of the storage configuration.
- Set up IAM policies restricting each admin to their own prefix under `kb/`.
- Configure public or signed URL access for document retrieval (if needed by the AI agent).

---

## Acceptance Criteria Summary Table

| # | Requirement | EARS Pattern | Testable | Priority |
|---|---|---|---|---|
| 1.1 | Settings record creation with correct keys | WHEN...THEN | Yes - Property | Critical |
| 1.2 | Settings attributes stored correctly | WHEN...THEN | Yes - Example | Critical |
| 1.3 | Save button triggers updateClubSettings | WHEN...THEN | Yes - Example | Critical |
| 1.4 | Error handling on save failure | IF...THEN | Yes - Example | High |
| 1.5 | Form hydration on mount | WHEN...THEN | Yes - Integration | Critical |
| 1.6 | Empty form for new settings | WHILE | Yes - Example | Medium |
| 2.1 | Facility creation with correct keys | WHEN...THEN | Yes - Property | Critical |
| 2.2 | listFacilities query correctness | WHEN...THEN | Yes - Property | Critical |
| 2.3 | Real-time facility updates | WHEN...THEN | Yes - Integration | High |
| 2.4 | Form reset after save | WHEN...THEN | Yes - Example | Medium |
| 2.5 | Error handling on duplicate names | IF...THEN | Yes - Example | High |
| 2.6 | Empty state messaging | WHILE | Yes - Example | Medium |
| 3.1 | S3 path construction (tenant scoped) | WHEN...THEN | Yes - Property | Critical |
| 3.2 | Data isolation via S3 prefix | WHEN...THEN | Yes - Integration | Critical |
| 3.3 | Success notification on upload | WHEN...THEN | Yes - Example | High |
| 3.4 | Error handling on upload failure | IF...THEN | Yes - Example | High |
| 3.5 | List documents on mount | WHEN...THEN | Yes - Integration | Critical |
| 3.6 | Empty state for Knowledge Base | WHILE | Yes - Example | Medium |
| 4.1 | Four sections displayed | WHEN...THEN | Yes - Example | Critical |
| 4.2 | General Info form fields | THE | Yes - Example | Critical |
| 4.3 | Operating Rules form fields | THE | Yes - Example | Critical |
| 4.4 | Facilities Manager section | THE | Yes - Example | Critical |
| 4.5 | Knowledge Base section | THE | Yes - Example | Critical |
| 4.6 | Visual section separation | WHILE | Yes - Visual | Medium |
| 4.7 | Loading spinner on mount | WHEN...THEN | Yes - Example | High |

---

*Document Version: 1.0*
*Created: [Date]*
*Last Updated: [Date]*
