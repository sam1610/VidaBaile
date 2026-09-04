# Technical Design: Settings Tab & DatabaseService Extensions

**Feature:** Settings Tab & DatabaseService Extensions  
**Version:** 1.0  
**Author:** Development Team  
**Date:** 2024  
**Status:** Ready for Implementation

---

## 1. Overview

The Settings Tab enables administrators to manage club-wide configuration (name, address, phone, operating hours, cancellation policy, currency), create and organize facilities (dance halls, courts), and upload documents to the AI Knowledge Base with strict tenant-scoped isolation.

This design extends the `DatabaseService` with three new functions—`updateClubSettings()`, `createFacility()`, and `listFacilities()`—that enforce Single-Table Design patterns and multi-tenant isolation via the admin's Cognito SUB.

The SettingsDashboard component organizes settings into four sections (General Info, Operating Rules, Facilities Manager, AI Knowledge Base) using Amplify UI Components and CSS modules, with real-time updates via AppSync subscriptions and responsive layouts for mobile/tablet/desktop.

---

## 2. Architecture Overview

### 2.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              SettingsDashboard React Component                  │
│  [General Info] [Operating Rules] [Facilities] [KB Upload]      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
   ┌────────────▼────────────────┐  ┌────────▼─────────────────┐
   │  DatabaseService Functions  │  │  AWS Storage API (S3)    │
   │  - updateClubSettings()     │  │  - uploadData()          │
   │  - createFacility()         │  │  - getStoragePrefix()    │
   │  - listFacilities()         │  └────────┬─────────────────┘
   └────────────┬────────────────┘           │
                │                             │
                │ GraphQL (AppSync)          │ S3 Bucket
                │                             │
   ┌────────────▼─────────────────┐  ┌─────────▼────────────────┐
   │   AWS AppSync                 │  │  S3 Bucket              │
   │   ClubRecord Model             │  │  lavida-baile-bh/       │
   │   - Mutations                 │  │  {adminSub}/kb/         │
   │   - Subscriptions             │  └─────────────────────────┘
   └────────────┬────────────────┘
                │
   ┌────────────▼────────────────┐
   │  DynamoDB (DancingClubData)  │
   │  - pk: <adminSub>           │
   │  - sk: SETTINGS#GLOBAL or   │
   │       FACILITY#<id>         │
   │  - gsi1pk: <admin>#         │
   │       FACILITIES or         │
   │       SETTINGS#GLOBAL       │
   └─────────────────────────────┘
```

### 2.2 Component Hierarchy

```
SettingsDashboard (main container)
├── GeneralInfoSection
│   ├── TextField (Club Name)
│   ├── TextField (Address)
│   ├── TextField (Phone)
│   └── SelectField (Currency)
├── OperatingRulesSection
│   ├── TimePicker (Opening Time)
│   ├── TimePicker (Closing Time)
│   └── NumberField (Cancellation Window)
├── FacilitiesManagerSection
│   ├── FacilitiesList (table/list)
│   ├── Button (Add Facility)
│   └── FacilityModal (conditional)
│       ├── TextField (Facility Name)
│       ├── NumberField (Max Capacity)
│       ├── Button (Save)
│       └── Button (Cancel)
├── KnowledgeBaseSection
│   ├── StorageManager or File Upload
│   └── DocumentList (read-only)
├── ErrorBanner (global error state)
└── LoadingOverlay (initial data fetch)
```

### 2.3 Real-Time Subscription Architecture

When the SettingsDashboard mounts:

1. **Authenticate:** Extract `adminSub` from Cognito context via `useAdminSub()` hook
2. **Subscribe:** Create AppSync subscription for ClubRecord changes:
   - Settings updates: `pk={adminSub} AND sk=SETTINGS#GLOBAL`
   - Facility changes: `pk={adminSub} AND gsi1pk={adminSub}#FACILITIES`
3. **Handle Events:** On incoming subscription event:
   - If entityType=SETTINGS: Update form fields
   - If entityType=FACILITY: Rehydrate facilities list
4. **Cleanup:** Unsubscribe on component unmount to prevent memory leaks

---

## 3. DatabaseService Extensions Design

### 3.1 Overview

Three new functions extend `src/services/DatabaseService.ts` to support club settings and facility management. Each function:

- Accepts `adminSub` as the first parameter (partition key for multi-tenant isolation)
- Constructs DynamoDB records following STD key patterns defined in `amplify/data/resource.ts`
- Performs input validation before mutation
- Returns type-safe records with createdAt/updatedAt timestamps
- Includes comprehensive JSDoc comments with STD pattern examples
- Implements error handling with descriptive messages

### 3.2 Function: `updateClubSettings()`

#### Signature

```typescript
export async function updateClubSettings(
  adminSub: string,
  settingsData: {
    clubName: string;
    address: string;
    phone: string;
    operatingHours: { day: string; openTime: string; closeTime: string }[];
    cancellationWindowHours: number;
    currency: string;
  }
): Promise<ClubSettings>
```

#### STD Key Pattern

```
pk:     <adminSub>
sk:     SETTINGS#GLOBAL
gsi1pk: <adminSub>#SETTINGS#GLOBAL
gsi1sk: SETTINGS#GLOBAL
entityType: SETTINGS
```

#### Implementation Details

**Input Validation:**
- `clubName`: Required, non-empty string, max 255 characters
- `address`: Required, non-empty string, max 500 characters
- `phone`: Required, valid phone format (E.164 or regional), max 20 characters
- `operatingHours`: Required, array of at least 1 entry, each with `day`, `openTime` (HH:MM), `closeTime` (HH:MM)
  - Validation: `closeTime > openTime` for each entry
  - Valid days: Monday–Sunday or MONDAY–SUNDAY
- `cancellationWindowHours`: Required, positive integer, 0–168 (0–7 days)
- `currency`: Required, ISO 4217 code (3 characters), e.g., USD, BRL, EUR

**Upsert Semantics:**
- If settings record exists (`pk=adminSub, sk=SETTINGS#GLOBAL`), update all fields
- If settings record does not exist, create new record
- AppSync `ClubRecord.update()` handles both cases

**Return Type:**

```typescript
interface ClubSettings extends ClubRecord {
  pk: string;                    // <adminSub>
  sk: string;                    // SETTINGS#GLOBAL
  gsi1pk: string;                // <adminSub>#SETTINGS#GLOBAL
  gsi1sk: string;                // SETTINGS#GLOBAL
  entityType: 'SETTINGS';
  clubName: string;
  address: string;
  phone: string;
  operatingHours: Array<{
    day: string;
    openTime: string;            // HH:MM format
    closeTime: string;           // HH:MM format
  }>;
  cancellationWindowHours: number;
  currency: string;
  createdAt: string;             // ISO 8601 timestamp (auto-managed)
  updatedAt: string;             // ISO 8601 timestamp (auto-managed)
}
```

**Error Handling:**

| Scenario | Error | Message |
|---|---|---|
| Missing required field | ValidationError | "clubName is required" / "address is required" / etc. |
| Invalid phone format | ValidationError | "phone must be a valid phone number (E.164 format)" |
| Closing time ≤ opening time | ValidationError | "closeTime must be after openTime for each operating hour" |
| Invalid currency code | ValidationError | "currency must be a valid ISO 4217 code (3 characters)" |
| Negative cancellation window | ValidationError | "cancellationWindowHours must be a positive integer" |
| AppSync/DynamoDB error | DatabaseError | "Failed to save club settings: [underlying error]" |

**JSDoc Comment Template:**

```typescript
/**
 * Update or create club settings (name, address, phone, hours, cancellation policy, currency)
 *
 * STD Pattern:
 *   pk: <adminSub> (partition key)
 *   sk: SETTINGS#GLOBAL (sort key, single settings record per admin)
 *   gsi1pk: <adminSub>#SETTINGS#GLOBAL (for querying by admin)
 *   entityType: SETTINGS (runtime type discrimination)
 *
 * Multi-Tenant Isolation:
 *   All queries filtered by pk=<adminSub> ensure data belongs to authenticated admin.
 *   Cognito SUB in pk guarantees strict isolation from other admins.
 *
 * @param adminSub Admin's Cognito SUB (e.g., "us-east-1:a1b2c3d4-...")
 * @param settingsData Club settings object
 * @param settingsData.clubName Club name (required, max 255 chars)
 * @param settingsData.address Club address (required, max 500 chars)
 * @param settingsData.phone Club phone (required, valid E.164 format)
 * @param settingsData.operatingHours Array of daily hours (required, each: day, openTime HH:MM, closeTime HH:MM)
 * @param settingsData.cancellationWindowHours Hours before event to allow cancellation (required, 0-168)
 * @param settingsData.currency ISO 4217 code (required, e.g., USD, BRL)
 * @returns Promise<ClubSettings> Saved settings record with createdAt/updatedAt
 * @throws ValidationError if any input is invalid
 * @throws DatabaseError if AppSync/DynamoDB mutation fails
 *
 * @example
 * const settings = await updateClubSettings('us-east-1:admin123', {
 *   clubName: 'La Vida Baile',
 *   address: '123 Dance Ave, Belo Horizonte, MG',
 *   phone: '+55-31-98765-4321',
 *   operatingHours: [
 *     { day: 'Monday', openTime: '09:00', closeTime: '21:00' },
 *     { day: 'Tuesday', openTime: '09:00', closeTime: '21:00' },
 *   ],
 *   cancellationWindowHours: 24,
 *   currency: 'BRL'
 * });
 */
```

---

### 3.3 Function: `createFacility()`

#### Signature

```typescript
export async function createFacility(
  adminSub: string,
  facilityData: {
    facilityName: string;
    maxCapacity: number;
  }
): Promise<Facility>
```

#### STD Key Pattern

```
pk:     <adminSub>
sk:     FACILITY#<facilityId>
gsi1pk: <adminSub>#FACILITIES
gsi1sk: FACILITY#<facilityId>#CREATED#<timestamp>
entityType: FACILITY
```

#### Implementation Details

**Input Validation:**
- `facilityName`: Required, non-empty string, max 100 characters, trimmed
- `maxCapacity`: Required, positive integer (≥ 1, ≤ 1000)

**ID Generation:**
- Use `crypto.randomUUID()` or `nanoid()` for `facilityId`
- Ensures uniqueness per admin (pk-sk combo is unique)

**Record Construction:**
- Invoke `ClubRecord.create()` via AppSync client
- Auto-populate `createdAt` and `updatedAt` (handled by AppSync resolvers)

**Return Type:**

```typescript
interface Facility extends ClubRecord {
  pk: string;                    // <adminSub>
  sk: string;                    // FACILITY#<facilityId>
  gsi1pk: string;                // <adminSub>#FACILITIES
  gsi1sk: string;                // FACILITY#<facilityId>#CREATED#<timestamp>
  entityType: 'FACILITY';
  facilityId: string;            // UUID or nanoid
  facilityName: string;
  maxCapacity: number;
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

**Error Handling:**

| Scenario | Error | Message |
|---|---|---|
| Missing facilityName | ValidationError | "facilityName is required" |
| Empty facilityName | ValidationError | "facilityName cannot be empty" |
| Missing maxCapacity | ValidationError | "maxCapacity is required" |
| Non-integer capacity | ValidationError | "maxCapacity must be a positive integer" |
| Capacity ≤ 0 or > 1000 | ValidationError | "maxCapacity must be between 1 and 1000" |
| AppSync/DynamoDB error | DatabaseError | "Failed to create facility: [underlying error]" |

**JSDoc Comment Template:**

```typescript
/**
 * Create a new facility (dance hall, court, studio)
 *
 * STD Pattern:
 *   pk: <adminSub> (partition key)
 *   sk: FACILITY#<facilityId> (sort key, unique per admin)
 *   gsi1pk: <adminSub>#FACILITIES (for querying all facilities by admin)
 *   gsi1sk: FACILITY#<facilityId>#CREATED#<timestamp> (for sorting by creation)
 *   entityType: FACILITY (runtime type discrimination)
 *
 * Multi-Tenant Isolation:
 *   Each admin's facilities are isolated via pk=<adminSub>.
 *   gsi1pk grouping enables efficient "list all facilities for this admin" queries.
 *
 * @param adminSub Admin's Cognito SUB (e.g., "us-east-1:a1b2c3d4-...")
 * @param facilityData Facility details
 * @param facilityData.facilityName Facility name (required, max 100 chars)
 * @param facilityData.maxCapacity Maximum capacity (required, 1–1000)
 * @returns Promise<Facility> Created facility record with auto-generated facilityId
 * @throws ValidationError if facilityName is empty or maxCapacity is invalid
 * @throws DatabaseError if AppSync/DynamoDB create fails
 *
 * @example
 * const facility = await createFacility('us-east-1:admin123', {
 *   facilityName: 'Studio A - Salsa',
 *   maxCapacity: 25
 * });
 * // Returns: { pk: 'us-east-1:admin123', sk: 'FACILITY#abc-def-123', facilityId: 'abc-def-123', ... }
 */
```

---

### 3.4 Function: `listFacilities()`

#### Signature

```typescript
export async function listFacilities(
  adminSub: string
): Promise<Facility[]>
```

#### Query Pattern

```
Query GSI1:
  gsi1pk = <adminSub>#FACILITIES
  Filter: entityType = FACILITY
  Sort: createdAt DESC (or via gsi1sk in descending order)
```

#### Implementation Details

**Query Strategy:**
- Use AppSync client to query ClubRecord model on GSI1
- Construct query: `gsi1pk={adminSub}#FACILITIES`
- Filter results: `entityType === 'FACILITY'`
- Sort by `createdAt` in descending order (most recently created first)

**Pagination (Optional):**
- Support limit/offset parameters for future scalability
- Current implementation: return all facilities (assumes < 1000 per admin)

**Return Type:**

```typescript
Facility[]  // Array of Facility records, sorted by createdAt DESC
```

If no facilities exist, return empty array `[]` (not an error).

**Return Record Structure:**

```typescript
interface Facility extends ClubRecord {
  pk: string;                    // <adminSub>
  sk: string;                    // FACILITY#<facilityId>
  gsi1pk: string;                // <adminSub>#FACILITIES
  gsi1sk: string;                // FACILITY#<facilityId>#CREATED#<timestamp>
  entityType: 'FACILITY';
  facilityId: string;
  facilityName: string;
  maxCapacity: number;
  createdAt: string;
  updatedAt: string;
}
```

**Error Handling:**

| Scenario | Error | Message |
|---|---|---|
| Query fails (DynamoDB error) | DatabaseError | "Failed to list facilities: [underlying error]" |
| AppSync authorization denied | AuthorizationError | "Unauthorized to list facilities for this admin" |

**JSDoc Comment Template:**

```typescript
/**
 * Query all facilities for an admin
 *
 * STD Pattern:
 *   Query GSI1 with gsi1pk=<adminSub>#FACILITIES
 *   Filter by entityType=FACILITY
 *   Sort by createdAt DESC (most recent first)
 *
 * Multi-Tenant Isolation:
 *   gsi1pk pattern ensures only this admin's facilities are returned.
 *   Authorization enforced at AppSync/Cognito level.
 *
 * @param adminSub Admin's Cognito SUB
 * @returns Promise<Facility[]> Array of facility records, sorted by createdAt DESC
 * @throws DatabaseError if query fails
 * @throws AuthorizationError if not authorized for this admin's data
 *
 * @example
 * const facilities = await listFacilities('us-east-1:admin123');
 * // Returns: [
 * //   { sk: 'FACILITY#abc-def-123', facilityName: 'Studio A', maxCapacity: 25, createdAt: '2024-09-03T...' },
 * //   { sk: 'FACILITY#xyz-123-456', facilityName: 'Court B', maxCapacity: 40, createdAt: '2024-09-02T...' }
 * // ]
 */
```

---

## 4. SettingsDashboard Component Design

### 4.1 File Structure

```
src/components/settings/
├── SettingsDashboard.tsx           # Main component (refactor existing SettingsTab)
├── SettingsDashboard.css           # Styling (Amplify UI tokens + CSS modules)
├── FacilityModal.tsx               # Add/Edit facility modal
├── FacilityModal.css               # Modal styling
├── types.ts                        # TypeScript interfaces (FormData, etc.)
└── hooks/
    └── useSettingsDashboard.ts     # Custom hook for form/subscription logic
```

### 4.2 Main Component: `SettingsDashboard.tsx`

#### Component Structure

```typescript
export function SettingsDashboard(): JSX.Element {
  // 1. Hooks & Context
  const adminSub = useAdminSub();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilities Loading, setFacilitiesLoading] = useState(false);
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [documents, setDocuments] = useState<S3Document[]>([]);

  // 2. Effects
  useEffect(() => {
    if (!adminSub) return;
    loadInitialData();
    subscribeToUpdates();
  }, [adminSub]);

  useEffect(() => {
    return () => {
      // Cleanup subscriptions on unmount
    };
  }, []);

  // 3. Handlers
  const handleSaveSettings = async () => { /* ... */ };
  const handleAddFacility = async (facilityData) => { /* ... */ };
  const handleFileUpload = async (file: File) => { /* ... */ };

  // 4. Render
  return (
    <View className={styles.dashboard}>
      {globalError && <ErrorBanner message={globalError} onDismiss={() => setGlobalError(null)} />}
      
      {loading ? (
        <LoadingOverlay />
      ) : (
        <>
          <GeneralInfoSection {...} />
          <OperatingRulesSection {...} />
          <FacilitiesManagerSection {...} />
          <KnowledgeBaseSection {...} />
        </>
      )}

      <FacilityModal
        isOpen={showFacilityModal}
        onClose={() => setShowFacilityModal(false)}
        onSave={handleAddFacility}
        isSaving={facilitiesLoading}
      />
    </View>
  );
}
```

#### State Management

```typescript
interface FormData {
  clubName: string;
  address: string;
  phone: string;
  currency: string;
  openingTime: string;              // HH:MM
  closingTime: string;              // HH:MM
  cancellationWindowHours: number;
}

interface SettingsDashboardState {
  formData: FormData;
  loading: boolean;                 // Initial data fetch
  saving: boolean;                  // Save in progress
  errors: Record<string, string>;   // Field-level validation errors
  globalError: string | null;       // Global error message
  facilities: Facility[];
  facilitiesLoading: boolean;
  showFacilityModal: boolean;
  documents: S3Document[];
  documentsLoading: boolean;
}
```

#### Hooks

**useAdminSub()** (existing hook)
```typescript
const adminSub: string | null = useAdminSub();
```

**Custom Hook: useSettingsDashboard()**
```typescript
function useSettingsDashboard(adminSub: string) {
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminSub) return;

    // Subscribe to settings changes
    const subscription = /* AppSync subscription logic */;

    return () => {
      subscription.unsubscribe();
    };
  }, [adminSub]);

  return { settings, error };
}
```

#### Key Methods

**loadInitialData()**
```typescript
private async loadInitialData(): Promise<void> {
  try {
    setLoading(true);

    // 1. Fetch existing settings
    const settingsQuery = /* AppSync query for SETTINGS#GLOBAL */;
    const settingsResult = await client.graphql(settingsQuery);
    
    if (settingsResult) {
      setFormData({
        clubName: settingsResult.clubName,
        address: settingsResult.address,
        phone: settingsResult.phone,
        currency: settingsResult.currency,
        openingTime: settingsResult.operatingHours[0]?.openTime || '09:00',
        closingTime: settingsResult.operatingHours[0]?.closeTime || '18:00',
        cancellationWindowHours: settingsResult.cancellationWindowHours,
      });
    }

    // 2. Fetch facilities
    const facilitiesList = await DatabaseService.listFacilities(adminSub);
    setFacilities(facilitiesList);

    // 3. Fetch documents from S3 KB prefix
    const docsList = await listKnowledgeBaseDocuments(adminSub);
    setDocuments(docsList);
  } catch (error) {
    setGlobalError('Failed to load settings and facilities.');
    console.error('loadInitialData error:', error);
  } finally {
    setLoading(false);
  }
}
```

**handleSaveSettings()**
```typescript
private async handleSaveSettings(): Promise<void> {
  // 1. Validate
  const validationErrors = validateFormData(formData);
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors);
    return;
  }

  try {
    setSaving(true);
    setGlobalError(null);

    // 2. Call DatabaseService
    const updatedSettings = await DatabaseService.updateClubSettings(adminSub, {
      clubName: formData.clubName,
      address: formData.address,
      phone: formData.phone,
      operatingHours: [{
        day: 'Monday-Friday',  // Simplified for demo
        openTime: formData.openingTime,
        closeTime: formData.closingTime,
      }],
      cancellationWindowHours: formData.cancellationWindowHours,
      currency: formData.currency,
    });

    // 3. Show success toast
    showToast('Club settings saved successfully!', 'success');
  } catch (error) {
    setGlobalError(error.message || 'Failed to save settings.');
    console.error('handleSaveSettings error:', error);
  } finally {
    setSaving(false);
  }
}
```

**handleAddFacility(facilityData)**
```typescript
private async handleAddFacility(facilityData: { facilityName: string; maxCapacity: number }): Promise<void> {
  try {
    setFacilitiesLoading(true);

    // 1. Call DatabaseService
    const newFacility = await DatabaseService.createFacility(adminSub, facilityData);

    // 2. Update local state (may also arrive via subscription)
    setFacilities([newFacility, ...facilities]);

    // 3. Close modal and show success toast
    setShowFacilityModal(false);
    showToast(`Facility "${newFacility.facilityName}" created successfully!`, 'success');
  } catch (error) {
    setGlobalError(error.message || 'Failed to create facility.');
    console.error('handleAddFacility error:', error);
  } finally {
    setFacilitiesLoading(false);
  }
}
```

**handleFileUpload(file)**
```typescript
private async handleFileUpload(file: File): Promise<void> {
  // 1. Validate file
  if (!isValidFileType(file)) {
    setGlobalError('Invalid file type. Allowed: PDF, DOCX, TXT');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {  // 10 MB
    setGlobalError('File size exceeds 10 MB limit.');
    return;
  }

  try {
    // 2. Construct S3 path with tenant scope
    const s3Key = `lavida-baile-bh/${adminSub}/kb/${file.name}`;

    // 3. Upload to S3
    await uploadData({
      path: s3Key,
      data: file,
    });

    // 4. Refresh document list
    const docsList = await listKnowledgeBaseDocuments(adminSub);
    setDocuments(docsList);

    showToast(`Document "${file.name}" uploaded successfully!`, 'success');
  } catch (error) {
    setGlobalError('Failed to upload document. Please try again.');
    console.error('handleFileUpload error:', error);
  }
}
```

### 4.3 Sub-Component: GeneralInfoSection

```typescript
interface GeneralInfoSectionProps {
  formData: FormData;
  onChange: (field: keyof FormData, value: any) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

export function GeneralInfoSection({ formData, onChange, errors, disabled }: GeneralInfoSectionProps): JSX.Element {
  return (
    <section className={styles.section}>
      <Heading level={3}>General Info</Heading>

      <TextField
        label="Club Name"
        value={formData.clubName}
        onChange={(e) => onChange('clubName', e.target.value)}
        placeholder="e.g., La Vida Baile"
        disabled={disabled}
        hasError={!!errors.clubName}
        errorMessage={errors.clubName}
        required
      />

      <TextField
        label="Address"
        value={formData.address}
        onChange={(e) => onChange('address', e.target.value)}
        placeholder="e.g., 123 Dance Ave, Belo Horizonte, MG"
        disabled={disabled}
        hasError={!!errors.address}
        errorMessage={errors.address}
        required
      />

      <TextField
        label="Phone"
        value={formData.phone}
        onChange={(e) => onChange('phone', e.target.value)}
        placeholder="e.g., +55-31-98765-4321"
        disabled={disabled}
        hasError={!!errors.phone}
        errorMessage={errors.phone}
        required
      />

      <SelectField
        label="Currency"
        value={formData.currency}
        onChange={(e) => onChange('currency', e.target.value)}
        options={[
          { label: 'USD (US Dollar)', value: 'USD' },
          { label: 'BRL (Brazilian Real)', value: 'BRL' },
          { label: 'EUR (Euro)', value: 'EUR' },
        ]}
        disabled={disabled}
        required
      />
    </section>
  );
}
```

### 4.4 Sub-Component: OperatingRulesSection

```typescript
export function OperatingRulesSection({ formData, onChange, errors, disabled }: OperatingRulesSectionProps): JSX.Element {
  return (
    <section className={styles.section}>
      <Heading level={3}>Operating Rules</Heading>

      <div className={styles.fieldRow}>
        <TimeField
          label="Daily Opening Time"
          value={formData.openingTime}
          onChange={(time) => onChange('openingTime', time)}
          disabled={disabled}
          hasError={!!errors.openingTime}
          errorMessage={errors.openingTime}
          required
        />

        <TimeField
          label="Daily Closing Time"
          value={formData.closingTime}
          onChange={(time) => onChange('closingTime', time)}
          disabled={disabled}
          hasError={!!errors.closingTime}
          errorMessage={errors.closingTime}
          required
        />
      </div>

      <NumberField
        label="Cancellation Window (hours)"
        value={formData.cancellationWindowHours}
        onChange={(val) => onChange('cancellationWindowHours', val)}
        placeholder="e.g., 24"
        min={0}
        max={168}
        disabled={disabled}
        hasError={!!errors.cancellationWindowHours}
        errorMessage={errors.cancellationWindowHours}
        required
      />
    </section>
  );
}
```

### 4.5 Sub-Component: FacilitiesManagerSection

```typescript
export function FacilitiesManagerSection({
  facilities,
  loading,
  onAddClick,
  onDeleteClick,
}: FacilitiesManagerSectionProps): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <Heading level={3}>Facilities Manager</Heading>
        <Button onClick={onAddClick} variation="primary">
          + Add Facility
        </Button>
      </div>

      {loading ? (
        <SkeletonTable rows={3} />
      ) : facilities.length === 0 ? (
        <EmptyState
          message="No facilities yet"
          description="Create your first facility to organize activities."
          actionLabel="Add Facility"
          onAction={onAddClick}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Facility Name</th>
              <th>Max Capacity</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.sk}>
                <td>{f.facilityName}</td>
                <td>{f.maxCapacity}</td>
                <td>{formatDate(f.createdAt)}</td>
                <td>
                  <Button variation="destructive" onClick={() => onDeleteClick(f)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
```

### 4.6 Sub-Component: KnowledgeBaseSection

```typescript
export function KnowledgeBaseSection({
  documents,
  loading,
  onFileSelect,
  uploading,
  error,
}: KnowledgeBaseSectionProps): JSX.Element {
  return (
    <section className={styles.section}>
      <Heading level={3}>AI Knowledge Base</Heading>

      <div className={styles.uploadArea}>
        <StorageManager
          acceptedFileTypes={['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']}
          maxFileCount={10}
          maxFileSize={10 * 1024 * 1024}  // 10 MB
          onUploadSuccess={(result) => onFileSelect(result.file)}
          isLoading={uploading}
        />
      </div>

      {error && (
        <Alert variation="error" isDismissible>
          {error}
        </Alert>
      )}

      {loading ? (
        <SkeletonList items={3} />
      ) : documents.length === 0 ? (
        <EmptyState message="No documents uploaded yet" description="Upload documents to inform the AI agent's responses." />
      ) : (
        <DocumentList documents={documents} />
      )}
    </section>
  );
}
```

### 4.7 Modal Component: `FacilityModal.tsx`

```typescript
interface FacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { facilityName: string; maxCapacity: number }) => Promise<void>;
  initialData?: Facility;  // For edit mode (future)
  isSaving?: boolean;
}

export function FacilityModal({ isOpen, onClose, onSave, initialData, isSaving = false }: FacilityModalProps): JSX.Element {
  const [formData, setFormData] = useState({ facilityName: '', maxCapacity: 20 });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = async () => {
    // 1. Validate
    const newErrors: Record<string, string> = {};
    if (!formData.facilityName.trim()) newErrors.facilityName = 'Facility name is required';
    if (formData.maxCapacity < 1 || formData.maxCapacity > 1000) newErrors.maxCapacity = 'Capacity must be 1-1000';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // 2. Call parent handler
    try {
      await onSave(formData);
      setFormData({ facilityName: '', maxCapacity: 20 });
      setErrors({});
    } catch (error) {
      console.error('Modal save error:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Facility" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <TextField
        label="Facility Name"
        value={formData.facilityName}
        onChange={(e) => setFormData({ ...formData, facilityName: e.target.value })}
        hasError={!!errors.facilityName}
        errorMessage={errors.facilityName}
        placeholder="e.g., Studio A"
        autoFocus
        required
      />

      <NumberField
        label="Max Capacity"
        value={formData.maxCapacity}
        onChange={(val) => setFormData({ ...formData, maxCapacity: val })}
        hasError={!!errors.maxCapacity}
        errorMessage={errors.maxCapacity}
        min={1}
        max={1000}
        required
      />

      <div className={styles.modalFooter}>
        <Button onClick={onClose} variation="secondary" disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} variation="primary" isLoading={isSaving} disabled={isSaving}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
```

---

## 5. Form Validation Design

### 5.1 Validation Rules

| Field | Type | Validation Rules | Error Message |
|---|---|---|---|
| clubName | string | Required, non-empty, max 255 chars | "Club name is required" / "Club name must be ≤ 255 characters" |
| address | string | Required, non-empty, max 500 chars | "Address is required" / "Address must be ≤ 500 characters" |
| phone | string | Required, valid E.164 format | "Phone is required" / "Invalid phone format (use E.164: +55-31-98765-4321)" |
| currency | string | Required, ISO 4217 code (3 chars) | "Currency is required" / "Currency must be a valid ISO code (USD, BRL, EUR)" |
| openingTime | string | Required, HH:MM format, valid time | "Opening time is required" / "Invalid time format (use HH:MM)" |
| closingTime | string | Required, HH:MM format, > openingTime | "Closing time is required" / "Closing time must be after opening time" |
| cancellationWindowHours | number | Required, integer, 0–168 | "Cancellation window is required" / "Must be 0–168 hours" |
| facilityName | string | Required, non-empty, max 100 chars | "Facility name is required" / "Facility name must be ≤ 100 characters" |
| maxCapacity | number | Required, integer, 1–1000 | "Max capacity is required" / "Capacity must be 1–1000" |

### 5.2 Client-Side Validation Function

```typescript
function validateFormData(formData: FormData): Record<string, string> {
  const errors: Record<string, string> = {};

  // clubName
  if (!formData.clubName?.trim()) {
    errors.clubName = 'Club name is required';
  } else if (formData.clubName.length > 255) {
    errors.clubName = 'Club name must be ≤ 255 characters';
  }

  // address
  if (!formData.address?.trim()) {
    errors.address = 'Address is required';
  } else if (formData.address.length > 500) {
    errors.address = 'Address must be ≤ 500 characters';
  }

  // phone
  if (!formData.phone?.trim()) {
    errors.phone = 'Phone is required';
  } else if (!isValidPhone(formData.phone)) {
    errors.phone = 'Invalid phone format (use E.164: +55-31-98765-4321)';
  }

  // openingTime, closingTime
  if (!formData.openingTime?.match(/^\d{2}:\d{2}$/)) {
    errors.openingTime = 'Invalid time format (use HH:MM)';
  }
  if (!formData.closingTime?.match(/^\d{2}:\d{2}$/)) {
    errors.closingTime = 'Invalid time format (use HH:MM)';
  }
  if (formData.openingTime && formData.closingTime && formData.closingTime <= formData.openingTime) {
    errors.closingTime = 'Closing time must be after opening time';
  }

  // cancellationWindowHours
  if (formData.cancellationWindowHours < 0 || formData.cancellationWindowHours > 168) {
    errors.cancellationWindowHours = 'Must be 0–168 hours';
  }

  // currency
  if (!formData.currency?.match(/^[A-Z]{3}$/)) {
    errors.currency = 'Currency must be a valid ISO code (USD, BRL, EUR)';
  }

  return errors;
}

function isValidPhone(phone: string): boolean {
  // Simple E.164 validation: +<country><number>
  return /^\+\d{1,3}-?\d{1,14}$/.test(phone.replace(/\s/g, ''));
}
```

---

## 6. S3 Knowledge Base Integration

### 6.1 Upload Path Strategy

**Bucket:** `lavida-baile-bh` (defined in Amplify backend)  
**Folder Structure:**
```
lavida-baile-bh/
├── <adminSub1>/
│   └── kb/
│       ├── doc1.pdf
│       ├── doc2.docx
│       └── guidelines.txt
├── <adminSub2>/
│   └── kb/
│       └── policies.pdf
```

**Path Construction:**
```typescript
const s3Key = `lavida-baile-bh/${adminSub}/kb/${fileName}`;
```

### 6.2 Upload Function

```typescript
export async function uploadToKnowledgeBase(
  adminSub: string,
  file: File
): Promise<{ key: string; size: number; uploadedAt: string }> {
  const s3Key = `lavida-baile-bh/${adminSub}/kb/${file.name}`;

  try {
    const result = await uploadData({
      path: s3Key,
      data: file,
      options: {
        contentType: file.type,
      },
    });

    return {
      key: s3Key,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}
```

### 6.3 List & Fetch Function

```typescript
export async function listKnowledgeBaseDocuments(
  adminSub: string
): Promise<S3Document[]> {
  try {
    const prefix = `lavida-baile-bh/${adminSub}/kb/`;

    // Use storage API to list objects in prefix
    const result = await getStoragePrefix({
      prefix,
    });

    return result.objects.map((obj) => ({
      name: obj.key.split('/').pop() || 'unknown',
      key: obj.key,
      size: obj.size,
      modifiedAt: obj.lastModified?.toISOString() || '',
    }));
  } catch (error) {
    console.error('List documents error:', error);
    return [];  // Graceful degradation
  }
}

interface S3Document {
  name: string;
  key: string;
  size: number;
  modifiedAt: string;
}
```

### 6.4 File Type & Size Validation

```typescript
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10 MB

function isValidFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Allowed: PDF, DOCX, TXT' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 10 MB limit' };
  }
  return { valid: true };
}
```

---

## 7. Error Handling Strategy

### 7.1 Error Hierarchy

```
┌─────────────────────────┐
│   Global Error Banner   │ (appears at top of SettingsDashboard)
│   "Failed to save..."   │
└─────────────────────────┘
         │
    ┌────┴────┐
    │          │
Field-level   Modal Errors
Inline Errors
```

### 7.2 Error Handling Patterns

**Field-Level Validation:**
```typescript
const errors = validateFormData(formData);
if (errors.clubName) {
  <TextField ... hasError={true} errorMessage={errors.clubName} />
}
```

**Global Error Banner:**
```typescript
{globalError && (
  <Alert
    variation="error"
    isDismissible
    onDismiss={() => setGlobalError(null)}
  >
    {globalError}
  </Alert>
)}
```

**Mutation Error Handling:**
```typescript
try {
  await DatabaseService.updateClubSettings(...);
} catch (error) {
  if (error instanceof ValidationError) {
    setErrors(error.fieldErrors);
  } else {
    setGlobalError(error.message || 'Failed to save settings');
  }
}
```

### 7.3 Error Messages (User-Friendly)

| Scenario | Display Message |
|---|---|
| Form validation failure | Field-specific error (e.g., "Opening time required") |
| Database save fails | "Failed to save settings. Please try again." |
| S3 upload fails | "Upload failed. Check file size (max 10 MB) or try again." |
| Network timeout | "Request timed out. Please check your connection." |
| Unauthorized | "You don't have permission to edit these settings." |

---

## 8. Loading States & Skeleton UI

### 8.1 Initial Load State

When SettingsDashboard mounts and data is fetching:

```typescript
if (loading) {
  return (
    <View className={styles.dashboard}>
      <Skeleton height="80px" marginBottom="medium" />  {/* Header */}
      <Skeleton height="120px" marginBottom="medium" /> {/* General Info */}
      <Skeleton height="120px" marginBottom="medium" /> {/* Operating Rules */}
      <Skeleton height="200px" marginBottom="medium" /> {/* Facilities */}
      <Skeleton height="150px" />                       {/* Knowledge Base */}
    </View>
  );
}
```

### 8.2 Save State

When form is being saved:

```typescript
<Button
  onClick={handleSaveSettings}
  variation="primary"
  isLoading={saving}
  disabled={saving}
>
  {saving ? 'Saving...' : 'Save Settings'}
</Button>
```

### 8.3 Refetch State

When facilities list is being reloaded:

```typescript
{facilitiesLoading ? (
  <SkeletonTable rows={3} />
) : facilities.length === 0 ? (
  <EmptyState ... />
) : (
  <Table>...</Table>
)}
```

---

## 9. TypeScript Interfaces

### 9.1 Domain Models

```typescript
/**
 * Club Settings Record
 * Single record per admin with key SETTINGS#GLOBAL
 */
interface ClubSettings extends ClubRecord {
  pk: string;                    // <adminSub>
  sk: 'SETTINGS#GLOBAL';
  gsi1pk: string;                // <adminSub>#SETTINGS#GLOBAL
  gsi1sk: 'SETTINGS#GLOBAL';
  entityType: 'SETTINGS';
  clubName: string;
  address: string;
  phone: string;
  operatingHours: OperatingHours[];
  cancellationWindowHours: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

interface OperatingHours {
  day: string;                   // e.g., "Monday", "Monday-Friday"
  openTime: string;              // HH:MM
  closeTime: string;             // HH:MM
}

/**
 * Facility Record
 * Multiple records per admin, grouped by GSI1
 */
interface Facility extends ClubRecord {
  pk: string;                    // <adminSub>
  sk: string;                    // FACILITY#<facilityId>
  gsi1pk: string;                // <adminSub>#FACILITIES
  gsi1sk: string;                // FACILITY#<facilityId>#CREATED#<timestamp>
  entityType: 'FACILITY';
  facilityId: string;            // UUID
  facilityName: string;
  maxCapacity: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * S3 Document Metadata
 * Represents uploaded knowledge base document
 */
interface S3Document {
  name: string;
  key: string;
  size: number;
  modifiedAt: string;
}
```

### 9.2 Component Props

```typescript
interface GeneralInfoSectionProps {
  formData: FormData;
  onChange: (field: keyof FormData, value: any) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

interface OperatingRulesSectionProps {
  formData: FormData;
  onChange: (field: keyof FormData, value: any) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

interface FacilitiesManagerSectionProps {
  facilities: Facility[];
  loading: boolean;
  onAddClick: () => void;
  onDeleteClick: (facility: Facility) => void;
}

interface KnowledgeBaseSectionProps {
  documents: S3Document[];
  loading: boolean;
  onFileSelect: (file: File) => Promise<void>;
  uploading: boolean;
  error: string | null;
}

interface FacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { facilityName: string; maxCapacity: number }) => Promise<void>;
  initialData?: Facility;
  isSaving?: boolean;
}
```

### 9.3 Form State

```typescript
interface FormData {
  clubName: string;
  address: string;
  phone: string;
  currency: string;
  openingTime: string;           // HH:MM
  closingTime: string;           // HH:MM
  cancellationWindowHours: number;
}

const initialFormData: FormData = {
  clubName: '',
  address: '',
  phone: '',
  currency: 'USD',
  openingTime: '09:00',
  closingTime: '18:00',
  cancellationWindowHours: 24,
};
```

---

## 10. Component Layout & Styling

### 10.1 CSS Module Structure (SettingsDashboard.css)

```css
/* SettingsDashboard.css */

.dashboard {
  padding: var(--amplify-space-large);
  max-width: 1200px;
  margin: 0 auto;
}

.section {
  margin-bottom: var(--amplify-space-xlarge);
  padding: var(--amplify-space-large);
  border: 1px solid var(--amplify-colors-border-primary);
  border-radius: var(--amplify-radii-small);
  background-color: var(--amplify-colors-background-secondary);
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--amplify-space-medium);
}

.fieldRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--amplify-space-medium);
  margin-bottom: var(--amplify-space-medium);
}

.uploadArea {
  border: 2px dashed var(--amplify-colors-border-primary);
  border-radius: var(--amplify-radii-small);
  padding: var(--amplify-space-large);
  background-color: var(--amplify-colors-background-tertiary);
  text-align: center;
  margin-bottom: var(--amplify-space-large);
}

.modalFooter {
  display: flex;
  gap: var(--amplify-space-medium);
  justify-content: flex-end;
  margin-top: var(--amplify-space-large);
}

/* Responsive: Mobile < 768px */
@media (max-width: 767px) {
  .dashboard {
    padding: var(--amplify-space-medium);
  }

  .section {
    padding: var(--amplify-space-medium);
    margin-bottom: var(--amplify-space-large);
  }

  .fieldRow {
    grid-template-columns: 1fr;
    gap: var(--amplify-space-small);
  }

  .sectionHeader {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--amplify-space-small);
  }

  button {
    width: 100%;
  }
}

/* Tablet: 768px - 1024px */
@media (min-width: 768px) and (max-width: 1024px) {
  .fieldRow {
    grid-template-columns: 1fr 1fr;
  }
}

/* Desktop: > 1024px */
@media (min-width: 1025px) {
  .dashboard {
    padding: var(--amplify-space-xlarge);
  }
}
```

### 10.2 Responsive Breakpoints

| Breakpoint | Size | Layout |
|---|---|---|
| Mobile | < 768px | Single column, full-width buttons, stacked sections |
| Tablet | 768px – 1024px | 2-column form fields, flexible layout |
| Desktop | > 1024px | Optimized spacing, multi-column where applicable |

### 10.3 Amplify UI Token Usage

```typescript
// Use Amplify UI tokens for consistency
import { useTheme } from '@aws-amplify/ui-react';

export function SettingsDashboard() {
  const { tokens } = useTheme();

  return (
    <View style={{
      padding: tokens.space.large,
      backgroundColor: tokens.colors.background.secondary,
    }}>
      {/* Content */}
    </View>
  );
}
```

---

## 11. Real-Time Subscription Architecture

### 11.1 Subscription Pattern

When SettingsDashboard mounts:

```typescript
useEffect(() => {
  if (!adminSub) return;

  // Subscribe to settings and facilities changes
  const settingsSubscription = client.graphql(
    graphql(onClubRecordChange, {
      filter: {
        pk: { eq: adminSub },
        sk: { eq: 'SETTINGS#GLOBAL' },
      },
    })
  ).subscribe({
    next: (event) => {
      if (event.data?.onClubRecordChange?.entityType === 'SETTINGS') {
        // Update form fields
        const updated = event.data.onClubRecordChange as ClubSettings;
        setFormData({
          clubName: updated.clubName,
          // ... map other fields
        });
      }
    },
    error: (err) => console.error('Settings subscription error:', err),
  });

  const facilitiesSubscription = client.graphql(
    graphql(onClubRecordChange, {
      filter: {
        pk: { eq: adminSub },
        gsi1pk: { eq: `${adminSub}#FACILITIES` },
        entityType: { eq: 'FACILITY' },
      },
    })
  ).subscribe({
    next: (event) => {
      if (event.data?.onClubRecordChange?.entityType === 'FACILITY') {
        // Update facilities list
        const updated = event.data.onClubRecordChange as Facility;
        setFacilities((prev) => [updated, ...prev.filter((f) => f.sk !== updated.sk)]);
      }
    },
    error: (err) => console.error('Facilities subscription error:', err),
  });

  // Cleanup on unmount
  return () => {
    settingsSubscription.unsubscribe?.();
    facilitiesSubscription.unsubscribe?.();
  };
}, [adminSub]);
```

### 11.2 Refetch vs Subscription Trade-offs

| Strategy | Pros | Cons | Use Case |
|---|---|---|---|
| **Subscription** | Real-time updates, low latency | Higher AppSync cost, subscription cleanup needed | Multi-user environment, high update frequency |
| **Refetch** | Simpler code, lower cost | Slight delay (2-5s), stale data window | Single-user admin, infrequent updates |

**Design Decision:** Use subscriptions for real-time feel, with refetch on explicit Save action as backup.

---

## 12. Code Organization & File Structure

```
src/
├── components/
│   └── settings/
│       ├── SettingsDashboard.tsx          # Main component (refactored)
│       ├── SettingsDashboard.css          # Styling
│       ├── GeneralInfoSection.tsx         # Sub-component
│       ├── GeneralInfoSection.css
│       ├── OperatingRulesSection.tsx      # Sub-component
│       ├── OperatingRulesSection.css
│       ├── FacilitiesManagerSection.tsx   # Sub-component
│       ├── FacilitiesManagerSection.css
│       ├── KnowledgeBaseSection.tsx       # Sub-component
│       ├── KnowledgeBaseSection.css
│       ├── FacilityModal.tsx              # Modal component
│       ├── FacilityModal.css
│       ├── types.ts                       # TypeScript interfaces
│       ├── hooks/
│       │   └── useSettingsDashboard.ts    # Custom hook
│       ├── utils/
│       │   ├── validation.ts              # Form validation
│       │   └── s3-helpers.ts              # S3 utilities
│       └── index.ts                       # Barrel export
├── services/
│   └── DatabaseService.ts                 # Extended with 3 new functions
└── lib/
    └── models.ts                          # Add ClubSettings, Facility interfaces
```

---

## 13. Integration Points

### 13.1 Cognito & Authentication

**useAdminSub() Hook** (existing):
```typescript
const adminSub = useAdminSub();  // Returns Cognito SUB string or null
```

Ensures SettingsDashboard only operates on authenticated admin's data.

### 13.2 AppSync & GraphQL

**ClubRecord Model** (existing in `amplify/data/resource.ts`):
- Already supports SETTINGS and FACILITY entity types
- Subscriptions via `onClubRecordChange`
- Authorization: `allow.groups(['Admins'])`

**Required Schema Updates:**
- Ensure `operatingHours` field supports JSON array
- Add custom mutation if upsert semantics needed (update-or-create)

### 13.3 Database Layer

**DatabaseService** (extending):
- Add three new functions: `updateClubSettings()`, `createFacility()`, `listFacilities()`
- Follow existing patterns (factory functions, error handling, JSDoc)
- Return type-safe records with TS guards

### 13.4 Storage Layer

**S3 Integration** (AWS Amplify Storage):
- Use `uploadData()` for file upload with tenant-scoped path
- Use `getStoragePrefix()` or list API to fetch documents
- Enforce path isolation via IAM policies (backend configuration)

---

## 14. Correctness Properties (for Testing)

Property-based testing is **not applicable** to this feature because it primarily involves:
- Infrastructure configuration (AppSync, DynamoDB, S3)
- UI rendering and form interactions
- External service integration (AWS services)

Instead, this feature requires:
1. **Unit Tests** — Form validation, error handling, component rendering
2. **Integration Tests** — End-to-end flows (save settings, create facility, upload document)
3. **E2E Tests** — User workflows via Selenium/Cypress

### 14.1 Example Test Cases

**Unit: Form Validation**
```typescript
describe('validateFormData', () => {
  it('requires clubName', () => {
    const result = validateFormData({ ...emptyFormData });
    expect(result.clubName).toBe('Club name is required');
  });

  it('validates closing time > opening time', () => {
    const result = validateFormData({
      openingTime: '18:00',
      closingTime: '09:00',
    });
    expect(result.closingTime).toContain('must be after');
  });
});
```

**Integration: Save Settings**
```typescript
describe('SettingsDashboard – Save Settings', () => {
  it('calls DatabaseService.updateClubSettings on Save button click', async () => {
    const spy = jest.spyOn(DatabaseService, 'updateClubSettings');
    render(<SettingsDashboard />);
    
    await userEvent.type(screen.getByLabelText('Club Name'), 'La Vida Baile');
    await userEvent.click(screen.getByText('Save Settings'));

    expect(spy).toHaveBeenCalledWith(adminSub, expect.objectContaining({
      clubName: 'La Vida Baile',
    }));
  });
});
```

**Integration: Create Facility**
```typescript
describe('SettingsDashboard – Create Facility', () => {
  it('displays new facility in list after creation', async () => {
    const mockFacility = {
      sk: 'FACILITY#abc123',
      facilityName: 'Studio A',
      maxCapacity: 25,
    };
    jest.spyOn(DatabaseService, 'createFacility').mockResolvedValue(mockFacility);

    render(<SettingsDashboard />);
    await userEvent.click(screen.getByText('Add Facility'));
    // ... user fills form ...
    await userEvent.click(screen.getByText('Save'));

    expect(screen.getByText('Studio A')).toBeInTheDocument();
  });
});
```

---

## 15. Implementation Roadmap

### Phase 1: DatabaseService Extensions (Week 1)

1. Add TypeScript interfaces (`ClubSettings`, `Facility`) to `src/lib/models.ts`
2. Implement `updateClubSettings()` in `src/services/DatabaseService.ts`
3. Implement `createFacility()` in `src/services/DatabaseService.ts`
4. Implement `listFacilities()` in `src/services/DatabaseService.ts`
5. Write unit tests for validation and error handling

### Phase 2: Component Structure (Week 2)

1. Refactor existing `SettingsTab.tsx` → `SettingsDashboard.tsx`
2. Create sub-components: `GeneralInfoSection`, `OperatingRulesSection`, `FacilitiesManagerSection`, `KnowledgeBaseSection`
3. Implement form state management and validation
4. Create `FacilityModal.tsx`
5. Write component unit tests

### Phase 3: Integration & Real-Time (Week 3)

1. Integrate DatabaseService functions into component handlers
2. Implement AppSync subscriptions for real-time updates
3. Connect S3 Knowledge Base upload/list functionality
4. Write integration tests
5. Perform end-to-end testing

### Phase 4: Polish & Deployment (Week 4)

1. Responsive design refinement and testing
2. Error handling edge cases
3. Accessibility review (WCAG 2.1 Level AA)
4. Performance optimization (initial load < 500ms)
5. Documentation and code review

---

## 16. Assumptions & Constraints

### 16.1 Assumptions

- Admin is authenticated via Cognito and `useAdminSub()` hook is available
- DynamoDB table `DancingClubData` exists with ClubRecord model
- AppSync schema supports subscriptions and real-time updates
- S3 bucket `lavida-baile-bh` is provisioned and accessible
- IAM policies enforce tenant isolation at the bucket/prefix level
- Amplify UI Components library is installed and configured

### 16.2 Constraints

- No sidebar navigation (tab-based only per architecture)
- Single table design must be respected (no additional tables)
- Native AWS services only (no third-party platforms)
- TypeScript strict mode enabled
- Amplify UI Components for styling (no Tailwind)
- WhatsApp response latency < 3s (not applicable here, but noted for consistency)

---

## 17. Success Criteria

| Criterion | Measurement |
|---|---|
| **Functionality** | All requirements implemented: settings save, facility CRUD, KB upload, real-time updates |
| **Performance** | Initial load < 500ms on 4G connection; DynamoDB reads < 10ms (p99) |
| **Code Quality** | 100% TypeScript strict mode; JSDoc comments on all functions; no console.error leaks |
| **Testing** | Unit test coverage ≥ 80%; integration tests for critical flows; E2E tests for main user journeys |
| **Accessibility** | Form fields labeled, keyboard-navigable, ARIA landmarks; WCAG 2.1 Level AA target |
| **User Experience** | Loading states visible; error messages clear; real-time updates within 2s; responsive on mobile/tablet/desktop |

---

## 18. Glossary

| Term | Definition |
|---|---|
| **AdminSub** | Admin's unique Cognito Subject ID (partition key for multi-tenant isolation) |
| **ClubRecord** | DynamoDB table item representing a club entity (Member, Coach, Schedule, Booking, Package, Claim, Settings, Facility) |
| **STD** | Single-Table Design: DynamoDB pattern using composite keys and GSIs to normalize multiple entities into one table |
| **GSI1** | Global Secondary Index 1: enables entity grouping and status-based queries |
| **GSI2** | Global Secondary Index 2: enables temporal and relational queries |
| **EntityType** | Discriminator field in ClubRecord to identify entity type (MEMBER, COACH, SCHEDULE, BOOKING, PACKAGE, CLAIM, SETTINGS, FACILITY) |
| **Upsert** | Atomic operation: create if not exists, update if exists |
| **MCP** | Model Context Protocol: AWS framework for agent tool communication |
| **Bedrock** | AWS service for running LLMs (Claude, Nova) |

---

## 19. References

- VidaBaile Architecture Steering Document: `.kiro/steering/architecture.md`
- Requirements Document: `.kiro/specs/settings-and-facilities/requirements.md`
- AppSync Schema: `amplify/data/resource.ts`
- Data Models: `src/lib/models.ts`
- DatabaseService: `src/services/DatabaseService.ts`
- Amplify UI React Docs: https://ui.docs.amplifyapp.com/react/components
- DynamoDB Single-Table Design: AWS Best Practices Guide

---

**Document Version:** 1.0  
**Status:** Ready for Implementation  
**Last Updated:** 2024

