# Design: Facilities Management

## 1. Architecture Overview

```
Admin UI (React)
  ↓
SettingsTab.tsx
  ├── FacilitiesManager.tsx (Container)
  │   ├── FacilitiesGrid.tsx (Displays facility cards)
  │   ├── FacilityModal.tsx (Create/Edit form)
  │   └── DeleteConfirmDialog.tsx (Confirmation)
  └── StatusFilter.tsx (Filter dropdown)
       ↓
DatabaseService.ts (Index-based queries)
  ├── createFacilityRecord()      [PUT] GSI1: {sub}#FACILITIES
  ├── updateFacilityRecord()      [UPDATE] PK: {sub}, SK: FACILITY#{id}
  ├── deleteFacilityRecord()      [DELETE] PK: {sub}, SK: FACILITY#{id}
  ├── getFacilityByIdRecord()     [GET] PK: {sub}, SK: FACILITY#{id}
  ├── queryFacilitiesByStatusRecord() [QUERY] GSI1: {sub}#FACILITIES
  └── queryAllFacilitiesRecord()  [QUERY] GSI1: {sub}#FACILITIES
       ↓
AppSync GraphQL API
  └── DynamoDB Table (ClubRecord with FACILITY entity)
```

---

## 2. Component Hierarchy

### 2.1 SettingsTab.tsx (Entry Point)

**Responsibility**: Orchestrate Facilities section within Settings tab

```typescript
export function SettingsTab() {
  // Layout: Grid with AI Config (left), Reports (right), Facilities (full width)
  // Facilities row includes:
  // - FacilitiesManager component (main UI)
  // - Real-time subscription to facility changes
  
  return (
    <View padding="medium" style={{ display: 'grid', ... }}>
      {/* Existing AI Config, Reports sections */}
      
      {/* NEW: Facilities Management Section */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Heading level={3}>🏛️ FACILITIES & ROOMS</Heading>
        <FacilitiesManager adminSub={currentAdminSub} />
      </div>
    </View>
  );
}
```

### 2.2 FacilitiesManager.tsx (Container Component)

**Responsibility**: Manage facility state, mutations, and coordinate child components

```typescript
interface FacilitiesManagerProps {
  adminSub: string;
}

export function FacilitiesManager({ adminSub }: FacilitiesManagerProps) {
  // State management
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effects
  // 1. Load facilities on mount (GSI1 query, no scan)
  // 2. Subscribe to real-time facility changes
  // 3. Filter facilities by status

  // Handlers
  const handleCreateFacility = async (data: FacilityInput) => {
    // Call DatabaseService.createFacilityRecord()
  };

  const handleUpdateFacility = async (id: string, data: FacilityInput) => {
    // Call DatabaseService.updateFacilityRecord()
  };

  const handleDeleteFacility = async (id: string) => {
    // Call DatabaseService.deleteFacilityRecord()
  };

  return (
    <View>
      <View display="flex" justifyContent="space-between" alignItems="center" marginBottom="medium">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <Button onClick={() => { setEditingFacility(null); setIsModalOpen(true); }}>
          + Add Facility
        </Button>
      </View>

      {error && <ErrorNotification message={error} />}
      {loading && <Loader />}
      
      <FacilitiesGrid
        facilities={filteredFacilities}
        onEdit={(facility) => { setEditingFacility(facility); setIsModalOpen(true); }}
        onDeleteClick={setDeleteCandidate}
      />

      <FacilityModal
        isOpen={isModalOpen}
        facility={editingFacility}
        onClose={() => { setIsModalOpen(false); setEditingFacility(null); }}
        onSave={editingFacility ? handleUpdateFacility : handleCreateFacility}
      />

      <DeleteConfirmDialog
        isOpen={!!deleteCandidate}
        facility={deleteCandidate}
        onConfirm={handleDeleteFacility}
        onCancel={() => setDeleteCandidate(null)}
      />
    </View>
  );
}
```

### 2.3 FacilitiesGrid.tsx (Presentation Component)

**Responsibility**: Render facility cards in a responsive grid

```typescript
interface FacilitiesGridProps {
  facilities: Facility[];
  onEdit: (facility: Facility) => void;
  onDeleteClick: (facility: Facility) => void;
}

export function FacilitiesGrid({ facilities, onEdit, onDeleteClick }: FacilitiesGridProps) {
  if (facilities.length === 0) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>No facilities found</div>;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '16px'
    }}>
      {facilities.map((facility) => (
        <FacilityCard
          key={facility.sk}
          facility={facility}
          onEdit={() => onEdit(facility)}
          onDelete={() => onDeleteClick(facility)}
        />
      ))}
    </div>
  );
}
```

### 2.4 FacilityCard.tsx (Presentation Component)

**Responsibility**: Render individual facility card with occupancy visualization

```typescript
interface FacilityCardProps {
  facility: Facility;
  onEdit: () => void;
  onDelete: () => void;
}

export function FacilityCard({ facility, onEdit, onDelete }: FacilityCardProps) {
  const occupancyPercent = (facility.occupancy / facility.capacity) * 100;
  const occupancyColor = getOccupancyColor(occupancyPercent);

  return (
    <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#2e3b50' }}>{facility.name}</div>
          <StatusBadge status={facility.status} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <IconButton icon="edit" onClick={onEdit} />
          <IconButton icon="trash" onClick={onDelete} />
        </div>
      </div>

      {/* Capacity */}
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
        Capacity: {facility.capacity} people
      </div>

      {/* Occupancy Progress */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
          <span>Occupancy</span>
          <span style={{ fontWeight: '600', color: occupancyColor }}>{Math.round(occupancyPercent)}%</span>
        </div>
        <ProgressBar percent={occupancyPercent} color={occupancyColor} />
      </div>

      {/* Current Occupancy */}
      <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: '500' }}>
        {facility.occupancy} / {facility.capacity} people
      </div>

      {/* Location (if provided) */}
      {facility.location && (
        <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>📍 {facility.location}</div>
      )}
    </div>
  );
}

function getOccupancyColor(percent: number): string {
  if (percent >= 80) return '#e74c3c'; // Red
  if (percent >= 50) return '#f39c12'; // Amber
  return '#27ae60'; // Green
}
```

### 2.5 FacilityModal.tsx (Form Component)

**Responsibility**: Modal form for creating/editing facilities

```typescript
interface FacilityModalProps {
  isOpen: boolean;
  facility: Facility | null;
  onClose: () => void;
  onSave: (data: FacilityInput) => Promise<void>;
}

export function FacilityModal({ isOpen, facility, onClose, onSave }: FacilityModalProps) {
  const [formData, setFormData] = useState<FacilityInput>({
    name: '',
    capacity: 1,
    location: '',
    description: '',
    status: 'ACTIVE'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load facility data in edit mode
  useEffect(() => {
    if (facility) {
      setFormData({
        name: facility.name,
        capacity: facility.capacity,
        location: facility.location || '',
        description: facility.description || '',
        status: facility.status as 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
      });
    }
  }, [facility]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      errors.name = 'Facility name is required';
    }
    if (formData.name && formData.name.length > 255) {
      errors.name = 'Facility name must be less than 255 characters';
    }

    if (!formData.capacity || formData.capacity < 1 || formData.capacity > 1000) {
      errors.capacity = 'Capacity must be between 1 and 1000';
    }

    if (formData.location && formData.location.length > 500) {
      errors.location = 'Location must be less than 500 characters';
    }

    if (formData.description && formData.description.length > 2000) {
      errors.description = 'Description must be less than 2000 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await onSave(formData);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save facility');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', capacity: 1, location: '', description: '', status: 'ACTIVE' });
    setError(null);
    setFieldErrors({});
    onClose();
  };

  if (!isOpen) return null;

  const title = facility ? 'Edit Facility' : 'Add New Facility';

  return (
    <ModalOverlay onClose={handleClose}>
      <ModalContent>
        <ModalHeader>
          <Heading>{title}</Heading>
          <CloseButton onClick={handleClose} />
        </ModalHeader>

        {error && <ErrorAlert message={error} />}

        <FormGroup>
          <FormField
            label="Facility Name *"
            input={<TextInput name="name" value={formData.name} onChange={handleChange} />}
            error={fieldErrors.name}
          />

          <FormField
            label="Capacity (people) *"
            input={<NumberInput name="capacity" value={formData.capacity} onChange={handleChange} min="1" max="1000" />}
            error={fieldErrors.capacity}
          />

          <FormField
            label="Location"
            input={<TextInput name="location" value={formData.location} onChange={handleChange} placeholder="e.g., 2nd Floor, Building A" />}
            error={fieldErrors.location}
          />

          <FormField
            label="Description"
            input={<TextArea name="description" value={formData.description} onChange={handleChange} rows={4} />}
            error={fieldErrors.description}
          />

          <FormField
            label="Status *"
            input={
              <Select name="status" value={formData.status} onChange={handleChange}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="CLOSED">CLOSED</option>
              </Select>
            }
          />
        </FormGroup>

        <ModalFooter>
          <Button onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} isPrimary>
            {saving ? 'Saving...' : 'Save Facility'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}
```

### 2.6 StatusFilter.tsx (Filter Component)

**Responsibility**: Status filter dropdown for facility queries

```typescript
interface StatusFilterProps {
  value: 'all' | 'ACTIVE' | 'MAINTENANCE' | 'CLOSED';
  onChange: (status: 'all' | 'ACTIVE' | 'MAINTENANCE' | 'CLOSED') => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as any)}>
      <option value="all">All Facilities</option>
      <option value="ACTIVE">Active Only</option>
      <option value="MAINTENANCE">Maintenance</option>
      <option value="CLOSED">Closed</option>
    </Select>
  );
}
```

### 2.7 DeleteConfirmDialog.tsx (Confirmation Component)

**Responsibility**: Confirmation dialog for facility deletion

```typescript
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  facility: Facility | null;
  onConfirm: (id: string) => Promise<void>;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ isOpen, facility, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!facility) return;

    setDeleting(true);
    try {
      await onConfirm(facility.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete facility');
      setDeleting(false);
    }
  };

  if (!isOpen || !facility) return null;

  return (
    <ModalOverlay onClose={onCancel}>
      <ModalContent>
        <ModalHeader>
          <Heading>Delete Facility?</Heading>
        </ModalHeader>

        {error && <ErrorAlert message={error} />}

        <div style={{ marginBottom: '24px', padding: '16px', background: '#fff3cd', borderRadius: '4px' }}>
          <p>Are you sure you want to delete <strong>{facility.name}</strong>?</p>
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>This action cannot be undone.</p>
        </div>

        <ModalFooter>
          <Button onClick={onCancel} disabled={deleting}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={deleting} style={{ background: '#e74c3c' }}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}
```

---

## 3. DatabaseService Extensions

### 3.1 Data Types (models.ts)

```typescript
/**
 * Facility: Dancing hall/room entity
 * STD Pattern: pk=<adminSub>, sk=FACILITY#{facilityId}
 */
export interface Facility {
  pk: string;
  sk: string;
  gsi1pk: string;                   // {adminSub}#FACILITIES
  gsi1sk: string;                   // STATUS#{status}#NAME#{name}
  gsi2pk: string;                   // {adminSub}#FACILITIES
  gsi2sk: string;                   // CREATED#{createdAt}
  entityType: 'FACILITY';
  id: string;                        // Extracted from sk: FACILITY#{id}
  name: string;
  capacity: number;
  occupancy: number;                 // Current occupancy (updated externally)
  location?: string;
  description?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface FacilityInput {
  name: string;
  capacity: number;
  location?: string;
  description?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'CLOSED';
}

// Factory function to construct Facility records
export function createFacility(
  adminSub: string,
  facilityId: string,
  data: FacilityInput
): Facility {
  const now = new Date().toISOString();
  const nameForSort = data.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  return {
    pk: adminSub,
    sk: `FACILITY#${facilityId}`,
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: `STATUS#${data.status}#NAME#${nameForSort}`,
    gsi2pk: `${adminSub}#FACILITIES`,
    gsi2sk: `CREATED#${now}`,
    entityType: 'FACILITY',
    id: facilityId,
    name: data.name,
    capacity: data.capacity,
    occupancy: 0,
    location: data.location,
    description: data.description,
    status: data.status,
    createdAt: now,
    updatedAt: now,
  };
}

// Type guard
export function isFacility(record: any): record is Facility {
  return record?.entityType === 'FACILITY' && record?.sk?.startsWith('FACILITY#');
}
```

### 3.2 DatabaseService Functions (Index-Based Queries)

```typescript
/**
 * Create a new facility
 *
 * STD Pattern:
 * - pk: <adminSub> (partition key)
 * - sk: FACILITY#<facilityId> (sort key)
 * - gsi1pk: <adminSub>#FACILITIES (facility grouping)
 * - gsi1sk: STATUS#<status>#NAME#<name> (for filtering & sorting)
 *
 * Query Strategy: Direct PUT (no scan needed)
 *
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Unique facility identifier
 * @param data Facility details
 * @returns Created Facility record
 */
export async function createFacilityRecord(
  adminSub: string,
  facilityId: string,
  data: FacilityInput
): Promise<Facility> {
  try {
    const client = generateClient<Schema>();
    const facility = createFacility(adminSub, facilityId, data);

    const result = await (client.models as any).ClubRecord.create(facility);

    if (!isFacility(result)) {
      throw new Error('Created record is not a Facility');
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create facility';
    console.error('createFacilityRecord error:', error);
    throw new Error(`Failed to create facility: ${message}`);
  }
}

/**
 * Get a facility by ID
 *
 * Query Strategy: Direct lookup on primary key (no scan)
 * - pk: <adminSub>
 * - sk: FACILITY#<facilityId>
 *
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 * @returns Facility record or null
 */
export async function getFacilityByIdRecord(
  adminSub: string,
  facilityId: string
): Promise<Facility | null> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `FACILITY#${facilityId}`,
    });

    if (!result) return null;
    if (!isFacility(result)) {
      throw new Error('Retrieved record is not a Facility');
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve facility';
    console.error('getFacilityByIdRecord error:', error);
    throw new Error(`Failed to retrieve facility: ${message}`);
  }
}

/**
 * Update a facility
 *
 * Query Strategy: Direct update on primary key (no scan)
 * - pk: <adminSub>
 * - sk: FACILITY#<facilityId>
 * - Updates gsi1sk for status/name changes
 *
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 * @param data Updated facility details (partial update)
 * @returns Updated Facility record
 */
export async function updateFacilityRecord(
  adminSub: string,
  facilityId: string,
  data: Partial<FacilityInput>
): Promise<Facility> {
  try {
    const client = generateClient<Schema>();

    // Fetch current record to merge updates
    const current = await getFacilityByIdRecord(adminSub, facilityId);
    if (!current) {
      throw new Error('Facility not found');
    }

    // Merge with existing data
    const merged: FacilityInput = {
      name: data.name ?? current.name,
      capacity: data.capacity ?? current.capacity,
      location: data.location ?? current.location,
      description: data.description ?? current.description,
      status: data.status ?? current.status,
    };

    // Reconstruct GSI1SK with updated status/name
    const nameForSort = merged.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const updated = {
      pk: adminSub,
      sk: `FACILITY#${facilityId}`,
      gsi1pk: `${adminSub}#FACILITIES`,
      gsi1sk: `STATUS#${merged.status}#NAME#${nameForSort}`,
      gsi2pk: `${adminSub}#FACILITIES`,
      gsi2sk: current.gsi2sk, // Keep original creation timestamp
      entityType: 'FACILITY' as const,
      name: merged.name,
      capacity: merged.capacity,
      occupancy: current.occupancy, // Preserve current occupancy
      location: merged.location,
      description: merged.description,
      status: merged.status,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const result = await (client.models as any).ClubRecord.update(updated);

    if (!isFacility(result)) {
      throw new Error('Updated record is not a Facility');
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update facility';
    console.error('updateFacilityRecord error:', error);
    throw new Error(`Failed to update facility: ${message}`);
  }
}

/**
 * Delete a facility
 *
 * Query Strategy: Direct delete on primary key (no scan)
 * - pk: <adminSub>
 * - sk: FACILITY#<facilityId>
 *
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 */
export async function deleteFacilityRecord(
  adminSub: string,
  facilityId: string
): Promise<void> {
  try {
    const client = generateClient<Schema>();

    await (client.models as any).ClubRecord.delete({
      pk: adminSub,
      sk: `FACILITY#${facilityId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete facility';
    console.error('deleteFacilityRecord error:', error);
    throw new Error(`Failed to delete facility: ${message}`);
  }
}

/**
 * Query all facilities for an admin
 *
 * Query Strategy: GSI1 query (no table scan)
 * - gsi1pk: <adminSub>#FACILITIES
 * - Returns all facilities regardless of status
 * - Sorted by status, then name (per gsi1sk)
 *
 * @param adminSub Admin's Cognito SUB
 * @returns Array of Facility records
 */
export async function queryAllFacilitiesRecord(adminSub: string): Promise<Facility[]> {
  try {
    const client = generateClient<Schema>();

    const results = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#FACILITIES`,
    });

    if (!results.data) return [];

    return results.data.filter(isFacility);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query facilities';
    console.error('queryAllFacilitiesRecord error:', error);
    throw new Error(`Failed to query facilities: ${message}`);
  }
}

/**
 * Query facilities by status
 *
 * Query Strategy: GSI1 range query (no table scan)
 * - gsi1pk: <adminSub>#FACILITIES
 * - gsi1sk: STATUS#<status> (begins_with for range query)
 * - Returns all facilities with matching status, sorted by name
 *
 * @param adminSub Admin's Cognito SUB
 * @param status Facility status filter
 * @returns Array of Facility records matching status
 */
export async function queryFacilitiesByStatusRecord(
  adminSub: string,
  status: 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
): Promise<Facility[]> {
  try {
    const client = generateClient<Schema>();

    const results = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#FACILITIES`,
      gsi1sk: { beginsWith: `STATUS#${status}` },
    });

    if (!results.data) return [];

    return results.data.filter(isFacility);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query facilities by status';
    console.error('queryFacilitiesByStatusRecord error:', error);
    throw new Error(`Failed to query facilities by status: ${message}`);
  }
}
```

---

## 4. Data Schema Update (amplify/data/resource.ts)

The existing ClubRecord schema must be updated to support the FACILITY entity type:

```typescript
entityType: a.enum(['MEMBER', 'COACH', 'SCHEDULE', 'BOOKING', 'PACKAGE', 'CLAIM', 'FACILITY']),
```

Add FACILITY-specific attributes (optional, can be null for non-facility records):
```typescript
// NEW: FACILITY Attributes
facilityId: a.string(),           // Extracted from sk for quick access
facilityCapacity: a.integer(),    // Max occupancy
facilityOccupancy: a.integer(),   // Current occupancy
facilityLocation: a.string(),     // Physical location
facilityDescription: a.string(),  // Details about the facility
```

---

## 5. API Integration Patterns

### 5.1 Real-Time Subscription (Optional)

For future real-time occupancy updates:

```typescript
// In FacilitiesManager.tsx
useEffect(() => {
  const subscription = facilitiesSubscription(adminSub).subscribe({
    next: (facility) => {
      setFacilities((prev) => updateFacilityInList(prev, facility));
    },
    error: (err) => console.error('Subscription error:', err),
  });

  return () => subscription.unsubscribe();
}, [adminSub]);
```

---

## 6. Error Handling Strategy

| Error | User Message | Action |
|---|---|---|
| Network failure | "Unable to load facilities. Please check your connection." | Show retry button |
| Invalid input (name empty) | "Facility name is required" | Highlight field, show inline error |
| Capacity out of range | "Capacity must be between 1 and 1000" | Highlight field, show inline error |
| Facility not found | "This facility no longer exists" | Reload facilities list |
| Delete conflict (bookings exist) | "Cannot delete facility with active bookings" | Show linked bookings, allow override |
| Permission denied | "You don't have permission to manage facilities" | Redirect to home |

---

## 7. Testing Strategy

### Unit Tests (FacilitiesManager, Modal, Grid)
- Component rendering with mock data
- User interactions (click, form submission)
- State management (filter changes, modal open/close)
- Validation error displays

### Integration Tests (DatabaseService)
- Create/read/update/delete facilities
- GSI1 query correctness (no scans)
- Primary key lookups
- Status filtering
- Error handling

### E2E Tests (User Journey)
- Add facility → verify in grid
- Edit facility → verify updates appear
- Filter by status → verify results
- Delete facility → verify removal
- Multi-tenant isolation (separate admin accounts)

---

## 8. Performance Optimization

### 8.1 Query Optimization
- GSI1 queries capped at 100 records (pagination if needed)
- Client-side filtering for status (avoid multiple GSI1 queries)
- Batch update queries to minimize round-trips

### 8.2 UI Optimization
- Lazy load facility cards (virtualize grid if > 50 items)
- Debounce filter changes (avoid redundant queries)
- Memoize FacilityCard components to prevent unnecessary re-renders

### 8.3 Caching
- Cache facilities in React state (update via subscriptions)
- Consider React Query or SWR for cache invalidation

---

## 9. Security Considerations

### 9.1 Multi-Tenant Isolation
- All queries include pk = adminSub (enforced at DB layer)
- AppSync authorization rules ensure user is in 'Admins' group
- Lambda functions verify adminSub matches request context

### 9.2 Input Validation
- Frontend: Validate before submit (UX)
- Backend: Validate in AppSync resolver (security layer)
- Name: max 255 chars, alphanumeric + spaces
- Capacity: int, 1-1000
- Location: max 500 chars
- Description: max 2000 chars

### 9.3 Rate Limiting
- Throttle create/update/delete (e.g., 10 requests/min per admin)
- Prevent bulk delete loops via confirmation dialogs

---

## 10. Migration & Rollout

### 10.1 Backward Compatibility
- Existing MEMBER, COACH, SCHEDULE, BOOKING, PACKAGE, CLAIM entities unaffected
- FACILITY is new entityType, no conflicts

### 10.2 Data Migration
- No existing data to migrate (new entity)
- Admins can create facilities post-deployment

### 10.3 Deployment Steps
1. Update amplify/data/resource.ts schema (add FACILITY entity + attributes)
2. Deploy backend: `amplify deploy`
3. Add DatabaseService facility functions
4. Add models.ts Facility type definitions
5. Create React components (FacilitiesManager, Modal, Grid, etc.)
6. Update SettingsTab to include FacilitiesManager
7. Test in sandbox environment
8. Promote to production

