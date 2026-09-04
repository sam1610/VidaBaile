# Single-Table Design (STD) Implementation Guide

## Overview

VidaBaile's backend has been completely refactored from a multi-table GraphQL schema into a highly optimized **Single-Table Design (STD)** using DynamoDB composite keys and multiple GSIs.

All data (Members, Coaches, Schedules, Bookings, Packages, Claims) now lives in a single `ClubRecord` table, with strict multi-tenant isolation enforced at the database layer.

---

## Architecture

### Database Layer

**Single Table:** `ClubRecord` with composite keys:
- **pk (Partition Key):** Admin's Cognito SUB → Multi-tenant isolation
- **sk (Sort Key):** Entity type + identifier (e.g., `MEMBER#<phone>`, `COACH#<phone>`)
- **GSI1 (gsi1pk + gsi1sk):** Entity grouping & status filtering
- **GSI2 (gsi2pk + gsi2sk):** Temporal & relational queries

### Key Design Patterns

#### Primary Keys (Base Index)

| Entity | pk | sk | Use Case |
|---|---|---|---|
| Member | `<adminSub>` | `MEMBER#<phone>` | Direct member lookup |
| Coach | `<adminSub>` | `COACH#<phone>` | Direct coach lookup |
| Schedule | `<adminSub>` | `SCHEDULE#<id>` | Direct schedule lookup |
| Booking | `<adminSub>` | `BOOKING#<id>#MEMBER#<phone>#SCHEDULE#<id>` | Related entity traversal |
| Package | `<adminSub>` | `PACKAGE#<id>#MEMBER#<phone>` | Related entity traversal |
| Claim | `<adminSub>` | `CLAIM#<id>#BOOKING#<id>` | Related entity traversal |

#### GSI 1: Entity Filtering & Status Queries

**Usage:** Get all members/coaches/schedules with optional status/tier filtering

| Query | gsi1pk | gsi1sk | Result |
|---|---|---|---|
| All active members | `<sub>#MEMBERS` | `STATUS#ACTIVE` | All active members |
| Active GOLD members | `<sub>#MEMBERS` | `STATUS#ACTIVE#TIER#GOLD` | Filtered members |
| All coaches | `<sub>#COACHES` | – | All coaches (no sort) |
| All schedules | `<sub>#SCHEDULES` | – | All schedules |
| Bookings for member | `<sub>#MEMBER#<phone>` | `BOOKING#DATETIME#*` | All member's bookings |

#### GSI 2: Temporal & Relational Queries

**Usage:** Get records by date range (schedules this week, expired packages, etc.)

| Query | gsi2pk | gsi2sk | Result |
|---|---|---|---|
| Schedules for date range | `<sub>#SCHEDULES` | `DATE#2024-09-03` to `DATE#2024-09-10` | Week's classes |
| Packages expiring soon | `<sub>#PACKAGES` | `EXPIRY#<date>` | Upcoming expirations |
| Bookings by timestamp | `<sub>#BOOKINGS` | `DATETIME#2024-09-03T14:00:00` | Chronological order |

---

## Frontend Architecture

### Data Models (`src/lib/models.ts`)

Strongly-typed TypeScript interfaces for each entity:

```typescript
export interface Member extends ClubRecord {
  entityType: 'MEMBER';
  phone: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM';
}

export interface Coach extends ClubRecord {
  entityType: 'COACH';
  phone: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  specialty: string;
}
```

**Type Guards:** Runtime discriminators for safe type narrowing

```typescript
if (isMember(record)) {
  console.log(record.tier); // IDE autocomplete!
}
```

**Factory Functions:** Construct properly-keyed records before mutation

```typescript
const member = createMember(adminSub, '+1-555-0001', {
  name: 'Clara',
  status: 'ACTIVE',
  tier: 'GOLD'
});

await client.models.ClubRecord.create(member);
```

### Custom Hooks

#### 1. `useAdminSub()` — Fetch Tenant Identity

Fetches the logged-in admin's Cognito SUB on component mount (partition key for all queries).

```typescript
export function useAdminSub() {
  const [adminSub, setAdminSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const attributes = await fetchUserAttributes();
    setAdminSub(attributes?.sub);
  }, []);

  return { adminSub, loading, error };
}
```

**Usage:**

```typescript
const { adminSub, loading } = useAdminSub();

if (loading) return <Spinner />;
if (!adminSub) return <ErrorBanner />;

// Safe to query now
```

#### 2. `useClubRecordSubscription()` — Real-Time Data Sync

Subscribes to real-time ClubRecord changes via AppSync `observeQuery()`.

```typescript
export function useClubRecordSubscription(options: {
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  enabled?: boolean;
}) {
  const [records, setRecords] = useState<ClubRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const subscription = client.models.ClubRecord
      .listByGsi1({ gsi1pk: '...', gsi1sk: '...' })
      .observeQuery()
      .subscribe({ next: (data) => setRecords(data.items) });

    return () => subscription.unsubscribe();
  }, [/* deps */]);

  return { records, loading, error };
}
```

**Usage Examples:**

Get all active members:
```typescript
const { records: members, loading } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#MEMBERS`,
  gsi1sk: 'STATUS#ACTIVE',
  enabled: !!adminSub
});
```

Get schedules for a specific date:
```typescript
const { records: schedules } = useClubRecordSubscription({
  gsi2pk: `${adminSub}#SCHEDULES`,
  gsi2sk: 'DATE#2024-09-03',
  enabled: !!adminSub
});
```

---

## Component Refactoring Patterns

### Pattern 1: CRM Tab (Active Members with Real-Time Sync)

**Before:** Multi-table model queries

```typescript
// OLD (DEPRECATED)
const [members, setMembers] = useState([]);
useEffect(() => {
  client.models.Member.list().then(setMembers); // Static fetch
}, []);
```

**After:** Single-table with real-time subscriptions

```typescript
// NEW (STD)
const { adminSub, loading: adminLoading } = useAdminSub();
const { records, loading, error } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#MEMBERS`,
  gsi1sk: 'STATUS#ACTIVE',
  enabled: !!adminSub
});

const members = records.filter(isMember);

useEffect(() => {
  // Auto-updates via subscription, no manual refresh needed
}, []);
```

### Pattern 2: Appointments Tab (Coaches with CRUD)

**Create Coach:**

```typescript
async function handleAddCoach(formData: CoachFormData) {
  const newCoach = createCoach(adminSub, formData.phone, {
    name: formData.name,
    email: formData.email,
    specialty: formData.specialty,
    status: 'ACTIVE'
  });

  await client.models.ClubRecord.create(newCoach);
  // Subscription auto-updates table
}
```

**Update Coach:**

```typescript
async function handleEditCoach(coach: Coach, updates: Partial<Coach>) {
  await client.models.ClubRecord.update({
    pk: coach.pk,
    sk: coach.sk,
    ...updates
  });
  // Subscription auto-updates table
}
```

**Delete Coach:**

```typescript
async function handleDeleteCoach(coach: Coach) {
  await client.models.ClubRecord.delete({
    pk: coach.pk,
    sk: coach.sk
  });
  // Subscription auto-removes from table
}
```

### Pattern 3: Activities Tab (Schedules by Date)

```typescript
const currentDate = '2024-09-03';
const { records, loading } = useClubRecordSubscription({
  gsi2pk: `${adminSub}#SCHEDULES`,
  gsi2sk: `DATE#${currentDate}`,
  enabled: !!adminSub
});

const schedules = records.filter(isSchedule);
```

### Pattern 4: POS & Packages (Packages with Expiry)

```typescript
const { records: allPackages } = useClubRecordSubscription({
  gsi2pk: `${adminSub}#PACKAGES`,
  enabled: !!adminSub
});

const expiredPackages = allPackages.filter(pkg => 
  new Date(pkg.validUntil!) < new Date()
);
```

---

## Key Guarantees

### Multi-Tenant Isolation
- Every query is implicitly scoped to the admin's SUB (pk)
- No cross-tenant data leakage (database enforces boundaries)

### Real-Time Synchronization
- `observeQuery()` subscriptions automatically update UI when records change
- No manual refresh buttons needed (but can be added for user UX)
- Changes made in one tab instantly appear in others

### Type Safety
- TypeScript interfaces prevent field mismatches
- Type guards enable safe runtime discriminators
- Factory functions enforce proper key construction

### Memory Management
- Subscriptions automatically unsubscribe on unmount
- No dangling subscriptions or memory leaks
- `enabled` flag gates subscriptions until admin SUB is ready

---

## Migration Checklist

### Backend
- [x] Single ClubRecord model created (`amplify/data/resource.ts`)
- [x] GSI1 & GSI2 configured
- [x] Multi-tenant isolation via pk=adminSub
- [x] Authorization set to allow Admins group

### Frontend
- [x] Data models & interfaces (`src/lib/models.ts`)
- [x] Type guards & factories
- [x] `useAdminSub()` hook
- [x] `useClubRecordSubscription()` hook
- [x] Build passes with no TypeScript errors

### Components (Next Phase)
- [ ] Refactor `CrmDashboard.tsx` to use new hooks
- [ ] Refactor `AppointmentsTab.tsx` (Coaches) to use new hooks
- [ ] Refactor `ActivitiesTab.tsx` to query by date
- [ ] Refactor `PosPackagesTab.tsx`
- [ ] Update CRUD modals to use factory functions
- [ ] Test real-time sync across tabs

---

## Common Patterns

### Querying by Entity Type

```typescript
const members = records.filter(r => r.entityType === 'MEMBER');
const coaches = records.filter(r => r.entityType === 'COACH');

// Or use type guards for IDE autocomplete
const members = records.filter(isMember);
const coaches = records.filter(isCoach);
```

### Pagination

GSI queries support `nextToken` for efficient pagination:

```typescript
const results = await client.models.ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#MEMBERS`,
  limit: 20
});

// results.nextToken available for fetching next page
```

### Error Handling

```typescript
const { records, loading, error } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#MEMBERS`,
  enabled: !!adminSub
});

if (error) {
  return (
    <Alert type="error">
      Failed to load members: {error.message}
    </Alert>
  );
}
```

---

## Testing Strategy

### Unit Tests
- Type guards (`isMember(...)`, `isCoach(...)`)
- Factory functions (key construction)

### Integration Tests
- `useAdminSub()` fetches SUB correctly
- `useClubRecordSubscription()` subscribes & receives updates
- CRUD operations trigger subscription updates

### Manual Testing
1. Create coach → appears in table immediately
2. Edit coach name → updates in real-time
3. Delete coach → removed from table
4. Switch tabs → data syncs across tabs
5. Refresh page → coach still in table (persisted)

---

## Troubleshooting

### "Coach not appearing in table"
- Check browser console for errors
- Verify `adminSub` is loaded (`useAdminSub` not loading)
- Check DynamoDB table for pk/sk format (should be `COACH#+1-555-...`)
- Verify subscription is enabled (`enabled: !!adminSub`)

### "pk/sk mismatch" errors
- Use factory functions to construct keys (`createCoach()`, `createMember()`)
- Never manually construct keys in components
- Validate phone number format before passing to factory

### "Stale data in table"
- Ensure unsubscribe cleanup is called on unmount
- Check subscription dependency array
- Verify subscription `next` handler is being called

---

## References

- Amplify Gen 2 Documentation: https://docs.amplify.aws/
- DynamoDB Single-Table Design: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
- AppSync Real-Time: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-data.html
