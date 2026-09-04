# Phase 2: STD Component Refactoring — Design Document

## Overview

This design outlines the refactoring of all React admin components to use the new Single-Table Design (STD) backend via custom hooks (`useAdminSub` + `useClubRecordSubscription`). The refactoring eliminates legacy model-based APIs and unifies all components around a ClubRecord-based subscription model.

---

## Architecture Patterns

### Pattern 1: Hook-Based Data Binding

**Before (Legacy):**
```typescript
// CrmDashboard.tsx - Old pattern
const response = await client.models.Member.list({ filter: { pk: { eq: sub } } });
const onCreateSub = client.models.Member.onCreate().subscribe({ ... });
```

**After (STD):**
```typescript
// CrmDashboard.tsx - New pattern
const { adminSub, loading: adminLoading } = useAdminSub();
const { records, loading, error } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#MEMBERS`,
  gsi1sk: 'STATUS#ACTIVE',
  enabled: !!adminSub
});

const members = records.filter(isMember);
```

**Benefits:**
- ✅ Automatic subscription cleanup on unmount
- ✅ Centralized error handling
- ✅ No manual unsubscribe logic required
- ✅ Type-safe with discriminator guards
- ✅ Single source of truth for real-time data

### Pattern 2: Factory Functions for Mutations

**Before (Legacy):**
```typescript
// Create coach with manual SK construction
const payload = {
  pk: adminSub,
  sk: formatPhoneSk(phone), // Manual SK formatting
  name,
  phone,
  specialty,
  // ... other fields
};
await client.models.Coach.create(payload);
```

**After (STD):**
```typescript
// Create coach using factory function
import { createCoach } from '../../lib/models';

const coach = createCoach(adminSub, phone, {
  name,
  specialty,
  status: 'ACTIVE',
  // ... other fields
});
await client.models.ClubRecord.create(coach);
```

**Benefits:**
- ✅ Correct pk/sk/gsi1pk/gsi1sk guaranteed by factory
- ✅ Type safety enforced at compile time
- ✅ No manual SK format logic scattered in components
- ✅ Easier to audit and maintain

### Pattern 3: Type Guard Filtering

**Before (Legacy):**
```typescript
// Mixed types, no filtering
const items = response.data; // Could be any entityType
items.forEach(item => {
  const name = item.name; // Risky: might not exist
});
```

**After (STD):**
```typescript
// Type-safe filtering with discriminators
const members = records.filter(isMember);
members.forEach(member => {
  const name = member.name; // TypeScript knows this exists
});
```

**Benefits:**
- ✅ Compile-time type safety
- ✅ IDE autocomplete works perfectly
- ✅ Runtime safety from discriminators
- ✅ Impossible to accidentally mix entity types

---

## Component Refactoring Patterns

### CrmDashboard.tsx (Members)

**Current State:**
- Uses `client.models.Member.list()` with manual pagination
- Manual subscriptions via `onCreate(), onUpdate(), onDelete()`
- No type guards for filtering
- Manual cleanup on unmount
- Infinite scroll with IntersectionObserver

**Target State:**
- Uses `useAdminSub()` + `useClubRecordSubscription()` hooks
- Automatic subscription lifecycle management
- Type guards: `isMember()` filter
- Query: `gsi1pk='${adminSub}#MEMBERS'`, `gsi1sk='STATUS#ACTIVE#TIER#*'` (optional tier filter)
- Maintains infinite scroll pattern (manual pagination removed for MVP)

**Before:**
```typescript
// CrmDashboard.tsx
const response = await client.models.Member.list({
  filter: { pk: { eq: sub } },
  limit: 20,
  nextToken: token,
});

const onCreateSub = client.models.Member.onCreate().subscribe({
  next: (message) => {
    if (message.data.pk === adminSub) {
      setMembers(prev => [...prev, message.data]);
    }
  }
});
```

**After:**
```typescript
// CrmDashboard.tsx
const { adminSub, loading: adminLoading } = useAdminSub();
const { records, loading, error } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#MEMBERS`,
  // Optional: gsi1sk: 'STATUS#ACTIVE#TIER#GOLD' for filtered queries
  enabled: !!adminSub
});

const members = records.filter(isMember);
```

**Key Changes:**
1. Remove `useRef` for subscription tracking (hooks handle it)
2. Remove manual pagination logic (useClubRecordSubscription handles queries)
3. Remove `cleanupSubscriptions()` (hooks auto-cleanup)
4. Use `isMember()` to filter records by entityType
5. Keep infinite scroll UI (but remove manual IntersectionObserver setup)
6. Update MemberCrudModal to use `createMember()` factory

---

### AppointmentsTab.tsx (Coaches)

**Current State:**
- Uses `client.models.Coach.list()` with manual pagination
- Manual subscriptions for onCreate/onUpdate/onDelete
- Manual cleanup on unmount
- Handle functions for CRUD operations

**Target State:**
- Uses `useAdminSub()` + `useClubRecordSubscription()` hooks
- Automatic subscription lifecycle
- Type guards: `isCoach()` filter
- Query: `gsi1pk='${adminSub}#COACHES'`
- CRUD operations use factory functions

**Changes:**
1. Replace Coach model queries with hook
2. Use `isCoach()` to filter records
3. Update `handleSaveCoach()` to use `createCoach()` factory
4. Remove all manual subscription unsubscribe calls
5. Remove `useRef` for subscription tracking

**Before:**
```typescript
const response = await client.models.Coach.list({
  filter: { pk: { eq: sub } },
  limit: 20,
});

// Create
const payload = {
  pk: adminSub,
  sk: formatPhoneSk(formData.phone),
  // ... fields
};
await client.models.Coach.create(payload);
```

**After:**
```typescript
const { adminSub } = useAdminSub();
const { records } = useClubRecordSubscription({
  gsi1pk: `${adminSub}#COACHES`,
  enabled: !!adminSub
});

const coaches = records.filter(isCoach);

// Create
const coach = createCoach(adminSub, formData.phone, {
  name: formData.name,
  specialty: formData.specialty,
  status: 'ACTIVE',
  email: formData.email,
  bio: formData.bio,
});
await client.models.ClubRecord.create(coach);
```

---

### ActivitiesTab.tsx (Schedules)

**Current State:**
- Uses mock data (no real backend integration)
- Static calendar grid layout
- No real-time updates

**Target State:**
- Queries real Schedule records from backend
- Uses `useAdminSub()` + `useClubRecordSubscription()` hooks
- Query: `gsi2pk='${adminSub}#SCHEDULES'`, `gsi2sk='DATE#<YYYY-MM-DD>'`
- Filters by week date range
- Type guards: `isSchedule()` filter
- Displays in weekly calendar grid (Monday-Sunday)

**New Implementation:**
```typescript
const { adminSub } = useAdminSub();

// Calculate current week (Mon-Sun)
const today = new Date();
const monday = new Date(today);
monday.setDate(today.getDate() - today.getDay() + 1);
const weekStart = monday.toISOString().split('T')[0];

const { records } = useClubRecordSubscription({
  gsi2pk: `${adminSub}#SCHEDULES`,
  gsi2sk: `DATE#${weekStart}`, // Range query for week
  enabled: !!adminSub
});

const schedules = records.filter(isSchedule);

// Group by day of week for grid display
const schedulesByDay = groupByDayOfWeek(schedules);
// Render as calendar grid
```

**Key Features:**
- Calculate Monday-Sunday of current week
- Query GSI2 for schedules in date range
- Filter by `isSchedule()` type guard
- Group schedules by date + time for grid display
- Display: time, coach, facility, activity type, capacity

---

### PosPackagesTab.tsx (Packages)

**Current State:**
- Uses mock data
- Static KPI boxes and campaigns

**Target State:**
- Queries real Package records from backend
- Uses `useAdminSub()` + `useClubRecordSubscription()` hooks
- Query: `gsi2pk='${adminSub}#PACKAGES'`
- Filters by active (validUntil >= today) vs expired
- Type guards: `isPackage()` filter
- Sorts by validUntil ascending

**New Implementation:**
```typescript
const { adminSub } = useAdminSub();
const today = new Date().toISOString().split('T')[0];

const { records } = useClubRecordSubscription({
  gsi2pk: `${adminSub}#PACKAGES`,
  enabled: !!adminSub
});

const packages = records.filter(isPackage);

const activePackages = packages.filter(p => p.validUntil >= today);
const expiredPackages = packages.filter(p => p.validUntil < today);

// Calculate KPIs
const totalRevenue = packages.reduce((sum, p) => sum + (p.price || 0), 0);
const avgCreditsLeft = activePackages.length > 0 
  ? activePackages.reduce((sum, p) => sum + p.remainingCredits, 0) / activePackages.length
  : 0;
```

---

## CRUD Modal Updates

### Pattern: Controlled Form with Factory Functions

**Before:**
```typescript
const handleSaveCoach = async (formData) => {
  const payload = {
    pk: adminSub,
    sk: formatPhoneSk(formData.phone), // Manual SK
    name: formData.name,
    // ...
  };
  await client.models.Coach.create(payload);
};
```

**After:**
```typescript
const handleSaveCoach = async (formData) => {
  const coach = createCoach(adminSub, formData.phone, {
    name: formData.name,
    specialty: formData.specialty,
    status: formData.status,
    email: formData.email,
    bio: formData.bio,
  });
  await client.models.ClubRecord.create(coach);
};
```

### MemberCrudModal.tsx
- ✅ Update form to include: name, phone, email, tier, status
- ✅ Create path: use `createMember()` factory
- ✅ Update path: use `client.models.ClubRecord.update()` with correct pk/sk
- ✅ Remove delete button (guarddrail: status→INACTIVE only)
- ✅ Type: `Member` (discriminated by `isMember()`)

### CoachCrudModal.tsx
- ✅ Update form to include: name, phone, specialty, email, bio, status
- ✅ Create path: use `createCoach()` factory
- ✅ Update path: use `client.models.ClubRecord.update()` with correct pk/sk
- ✅ Delete path: use `client.models.ClubRecord.delete()` with pk/sk
- ✅ Type: `Coach` (discriminated by `isCoach()`)

---

## Error Handling & Loading States

### Component-Level Patterns

**Loading State:**
```typescript
if (adminLoading) return <div>Initializing admin context...</div>;
if (loading) return <div>Loading {entityType}s...</div>;
```

**Error State:**
```typescript
if (error) return <div className="error-banner">{error.message}</div>;
```

**Mutation Errors:**
```typescript
try {
  await handleSave(formData);
  showToast('Saved successfully');
} catch (err) {
  setError(err instanceof Error ? err.message : 'Unknown error');
}
```

### Key Guarantees:
- ✅ All errors caught and displayed to user
- ✅ Loading states prevent race conditions
- ✅ Disabled buttons during mutations
- ✅ Toast notifications for success/confirmation
- ✅ adminSub availability verified before queries

---

## Real-Time Subscription Lifecycle

### Subscription Setup
```typescript
useEffect(() => {
  const { records, loading, error } = useClubRecordSubscription({
    gsi1pk: `${adminSub}#MEMBERS`,
    enabled: !!adminSub  // CRITICAL: only subscribe when ready
  });
  
  // Records automatically sync in real-time
  // No manual onCreate/onUpdate/onDelete subscriptions needed
}, [adminSub]);
```

### Automatic Cleanup
```typescript
// The hook handles cleanup automatically on unmount
// No need for useRef tracking or manual unsubscribe calls
// The returned cleanup function is called by React
```

### Memory Leak Prevention
✅ **No dangling subscriptions** — hook cleanup handles this
✅ **Correct dependency arrays** — `enabled` and GSI keys properly tracked
✅ **isMounted flag** — built into hook implementation
✅ **No subscription refs needed** — hooks abstract this away

---

## Type System & Type Guards

### Discriminated Union Types
```typescript
type ClubRecord = Member | Coach | Schedule | Booking | Package | Claim;

// Type guards for runtime discrimination
if (isMember(record)) {
  const name: string = record.name; // ✅ TypeScript knows this exists
}

if (isCoach(record)) {
  const specialty: string = record.specialty; // ✅ Type-safe
}
```

### Import Pattern
```typescript
// All guards and factories in one place
import {
  isMember,
  isCoach,
  isSchedule,
  isPackage,
  createMember,
  createCoach,
  createSchedule,
  createPackage,
  type Member,
  type Coach,
  type Schedule,
  type Package,
} from '../../lib/models';
```

---

## Component Import Requirements

Every refactored component MUST import:
```typescript
// Hooks (for data binding)
import { useAdminSub, useClubRecordSubscription } from '../../hooks';

// Models (for type safety)
import {
  isMember, // or isCoach, isSchedule, etc.
  createMember, // or createCoach, createSchedule, etc.
  type Member, // or type Coach, type Schedule, etc.
} from '../../lib/models';
```

---

## Multi-Tenant Isolation

### Partition Key Strategy
Every query MUST use `adminSub` as the partition key:
```typescript
gsi1pk: `${adminSub}#MEMBERS`  // ✅ Isolated to this admin
gsi1pk: `other-sub#MEMBERS`    // ❌ Cannot query across admins
```

### DynamoDB Enforcement
- ✅ pk column enforces isolation at database level
- ✅ AppSync rules prevent cross-tenant queries
- ✅ Lambda functions validate pk=adminSub before mutations

### Type Guard Backup
- ✅ `isMember()` discriminator provides additional runtime check
- ✅ Component filtering prevents accidental display of wrong tenant's data

---

## Build & Verification

### Pre-Deployment Checklist
- [ ] Zero TypeScript errors: `npm run build`
- [ ] All subscriptions properly cleaned up on unmount
- [ ] No console.error logs in component lifecycle
- [ ] All CRUD operations use factory functions
- [ ] All components use `useAdminSub()` + `useClubRecordSubscription()`
- [ ] All records filtered with type guards (isMember, isCoach, etc.)
- [ ] Real-time updates verified in browser devtools
- [ ] Memory leaks tested (DevTools → Performance → heap snapshots)
- [ ] Cross-admin isolation verified (create as Admin A, verify Admin B can't see it)

---

## Success Metrics

| Metric | Target | How to Verify |
|---|---|---|
| TypeScript Errors | 0 | `npm run build` |
| Build Time | < 3s | Time rebuild |
| Subscriptions Cleaned | 100% | DevTools Network tab (no lingering subscriptions) |
| Type Safety | 0 `any` types | Grep for `any` in component files |
| Real-Time Latency | < 100ms | Browser Network tab (AppSync subscription) |
| Memory Usage | No growth | DevTools Performance → heap snapshots over time |

---

## References

- Phase 1: `STD_IMPLEMENTATION_SUMMARY.md`
- Data Models: `src/lib/models.ts`
- Hooks: `src/hooks/useAdminSub.ts`, `src/hooks/useClubRecordSubscription.ts`
- Architecture: `.kiro/steering/architecture.md`
