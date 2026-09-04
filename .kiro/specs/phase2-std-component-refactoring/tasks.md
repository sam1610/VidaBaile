# Phase 2: STD Component Refactoring — Task List

## Overview

Execute the refactoring of all React admin components to use STD backend via custom hooks. Each task is self-contained and focuses on a single component.

**Sequential Execution:** Complete tasks in order (1 → 2 → 3 → 4 → 5 → 6).

---

## Task 1: Refactor CrmDashboard.tsx (Members Tab)

**Objective:** Migrate CrmDashboard from old Member model API to new STD backend with hooks.

**Acceptance Criteria:**
- [ ] Remove all `client.models.Member.*` calls
- [ ] Implement `useAdminSub()` hook
- [ ] Implement `useClubRecordSubscription()` hook for members query
- [ ] Filter records using `isMember()` type guard
- [ ] Update `MemberCrudModal` to use `createMember()` factory for create operations
- [ ] Remove all manual subscription tracking (useRef, cleanupSubscriptions)
- [ ] Preserve infinite scroll UI (IntersectionObserver)
- [ ] Zero TypeScript errors
- [ ] Build passes: `npm run build`

**Implementation Steps:**

1. **Remove Legacy Imports:**
   - Remove `import { getAdminSub } from '../../lib/auth-utils';`
   - Add imports:
     ```typescript
     import { useAdminSub, useClubRecordSubscription } from '../../hooks';
     import { isMember, createMember, type Member } from '../../lib/models';
     ```

2. **Replace useEffect for Admin SUB:**
   - Remove: Manual `getAdminSub()` initialization in useEffect
   - Replace with: `const { adminSub, loading: adminLoading } = useAdminSub();`
   - Remove: `adminSubLoading` state (use `adminLoading` instead)

3. **Replace useEffect for Members Query:**
   - Remove: `const response = await client.models.Member.list(...)` in `loadMembers()`
   - Remove: `useRef` tracking for subscriptions
   - Replace with:
     ```typescript
     const { records, loading, error } = useClubRecordSubscription({
       gsi1pk: `${adminSub}#MEMBERS`,
       gsi1sk: 'STATUS#ACTIVE', // Only fetch active members
       enabled: !!adminSub
     });
     
     const members = records.filter(isMember);
     ```

4. **Remove Subscription Setup:**
   - Remove: All `onCreate()`, `onUpdate()`, `onDelete()` manual subscriptions
   - Remove: `cleanupSubscriptions()` function (hooks handle cleanup)
   - Remove: `subscriptionRefsRef` useRef tracking
   - Keep: Error handling and loading states (use hook's error/loading)

5. **Simplify State Management:**
   - Remove: `pagination`, `setPagination` state (keep for manual load-more if needed)
   - Remove: `loadingMore` state
   - Keep: `members` state (populated from hook records)
   - Keep: `sortConfig`, `toastMessage` states

6. **Update Modal Integration:**
   - Verify `MemberCrudModal` is called with correct props
   - Ensure `onSave` callback handles both create and update
   - Update create path to use `createMember()` factory

7. **Test:**
   - [ ] Add new member → appears in table immediately
   - [ ] Edit member → updates displayed
   - [ ] Change status to INACTIVE → removed from "ACTIVE" view
   - [ ] Refresh page → data still there (real data, not just subscription)
   - [ ] No console errors or warnings
   - [ ] TypeScript build succeeds

**Key Files to Modify:**
- `src/components/crm/CrmDashboard.tsx`

**Related Files (No Changes):**
- `src/components/crm/CRMTab.tsx` (parent component)
- `src/components/crm/MemberCrudModal.tsx` (CRUD logic — handled in Task 5)

---

## Task 2: Refactor AppointmentsTab.tsx (Coaches Tab)

**Objective:** Migrate AppointmentsTab from old Coach model API to new STD backend with hooks.

**Acceptance Criteria:**
- [ ] Remove all `client.models.Coach.*` calls
- [ ] Implement `useAdminSub()` hook
- [ ] Implement `useClubRecordSubscription()` hook for coaches query
- [ ] Filter records using `isCoach()` type guard
- [ ] Update CRUD operations to use `createCoach()` factory (create) and `createCoach()` for updates
- [ ] Remove all manual subscription tracking (useRef, cleanupSubscriptions)
- [ ] Preserve infinite scroll UI
- [ ] All CRUD handlers (add, edit, delete) working
- [ ] Zero TypeScript errors
- [ ] Build passes: `npm run build`

**Implementation Steps:**

1. **Remove Legacy Imports:**
   - Remove: `import { getAdminSub, formatPhoneSk } from '../../lib/auth-utils';`
   - Add imports:
     ```typescript
     import { useAdminSub, useClubRecordSubscription } from '../../hooks';
     import { isCoach, createCoach, type Coach } from '../../lib/models';
     ```

2. **Replace useEffect for Admin SUB:**
   - Replace with: `const { adminSub, loading: adminLoading } = useAdminSub();`
   - Remove: `adminSubLoading` state usage

3. **Replace useEffect for Coaches Query:**
   - Remove: `const response = await client.models.Coach.list(...)` in `loadCoaches()`
   - Remove: `useRef` tracking for subscriptions
   - Replace with:
     ```typescript
     const { records, loading, error } = useClubRecordSubscription({
       gsi1pk: `${adminSub}#COACHES`,
       enabled: !!adminSub
     });
     
     const coaches = records.filter(isCoach);
     ```

4. **Remove Subscription Setup:**
   - Remove: `onCreate()`, `onUpdate()`, `onDelete()` manual subscriptions
   - Remove: `cleanupSubscriptions()` function
   - Remove: `subscriptionRefsRef` useRef tracking

5. **Update CRUD Operations:**

   **Create:**
   ```typescript
   const coach = createCoach(adminSub, formData.phone, {
     name: formData.name,
     specialty: formData.specialty,
     status: formData.status,
     email: formData.email,
     bio: formData.bio,
   });
   await client.models.ClubRecord.create(coach);
   ```

   **Update:**
   ```typescript
   const coach = createCoach(adminSub, formData.phone, {
     name: formData.name,
     specialty: formData.specialty,
     status: formData.status,
     email: formData.email,
     bio: formData.bio,
   });
   await client.models.ClubRecord.update(coach);
   ```

   **Delete:**
   ```typescript
   await client.models.ClubRecord.delete({
     pk: adminSub,
     sk: `COACH#${coach.phone}`,
   });
   ```

6. **Test:**
   - [ ] Add new coach → appears in table immediately
   - [ ] Edit coach → updates displayed
   - [ ] Delete coach → removed from table
   - [ ] Refresh page → data persists
   - [ ] No console errors
   - [ ] TypeScript build succeeds

**Key Files to Modify:**
- `src/components/appointments/AppointmentsTab.tsx`

**Related Files (No Changes):**
- `src/components/appointments/CoachCrudModal.tsx` (CRUD logic — handled in Task 5)

---

## Task 3: Refactor ActivitiesTab.tsx (Schedules Tab)

**Objective:** Migrate ActivitiesTab from mock data to real STD backend with schedule queries.

**Acceptance Criteria:**
- [ ] Remove mock data
- [ ] Implement `useAdminSub()` hook
- [ ] Implement `useClubRecordSubscription()` hook for schedules
- [ ] Query GSI2 with date range (current week: Mon-Sun)
- [ ] Filter records using `isSchedule()` type guard
- [ ] Display schedules in weekly calendar grid
- [ ] Group schedules by date and time
- [ ] Show: time, coach, facility, activity type, capacity
- [ ] Real-time updates when schedules are added/modified
- [ ] Zero TypeScript errors
- [ ] Build passes: `npm run build`

**Implementation Steps:**

1. **Add Imports:**
   ```typescript
   import { useAdminSub, useClubRecordSubscription } from '../../hooks';
   import { isSchedule, type Schedule } from '../../lib/models';
   ```

2. **Calculate Week Dates:**
   ```typescript
   const getWeekDates = () => {
     const today = new Date();
     const monday = new Date(today);
     // Adjust to Monday (weekday 1 = Monday)
     const day = monday.getDay();
     const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
     monday.setDate(diff);
     
     const weekStart = monday.toISOString().split('T')[0]; // YYYY-MM-DD
     const weekEnd = new Date(monday);
     weekEnd.setDate(weekEnd.getDate() + 6);
     const weekEndStr = weekEnd.toISOString().split('T')[0];
     
     return { weekStart, weekEnd: weekEndStr };
   };
   ```

3. **Setup Hooks:**
   ```typescript
   const { adminSub } = useAdminSub();
   const { weekStart, weekEnd } = getWeekDates();
   
   const { records, loading, error } = useClubRecordSubscription({
     gsi2pk: `${adminSub}#SCHEDULES`,
     gsi2sk: `DATE#${weekStart}`, // Range query from weekStart onwards
     enabled: !!adminSub
   });
   
   const schedules = records.filter(isSchedule);
   ```

4. **Group Schedules for Display:**
   ```typescript
   const schedulesByDayTime: Record<string, Schedule[]> = {};
   schedules.forEach(schedule => {
     const key = `${schedule.date}#${schedule.startTime}`;
     if (!schedulesByDayTime[key]) {
       schedulesByDayTime[key] = [];
     }
     schedulesByDayTime[key].push(schedule);
   });
   ```

5. **Render Weekly Calendar:**
   - Keep existing grid layout (days of week × times)
   - Replace mock data with real schedules
   - Display schedule cell with: activity type, coach name
   - Show tooltip on hover: full details

6. **Test:**
   - [ ] Page loads with current week's schedules
   - [ ] Add schedule for current week → appears immediately
   - [ ] Edit schedule → updates displayed
   - [ ] Delete schedule → removed from view
   - [ ] Schedules correctly grouped by day & time
   - [ ] No console errors
   - [ ] TypeScript build succeeds

**Key Files to Modify:**
- `src/components/activities/ActivitiesTab.tsx`

---

## Task 4: Refactor PosPackagesTab.tsx (Packages Tab)

**Objective:** Migrate PosPackagesTab from mock data to real STD backend with package queries.

**Acceptance Criteria:**
- [ ] Remove mock data
- [ ] Implement `useAdminSub()` hook
- [ ] Implement `useClubRecordSubscription()` hook for packages
- [ ] Query GSI2 packages for all members
- [ ] Filter records using `isPackage()` type guard
- [ ] Split into active (validUntil >= today) vs expired tabs
- [ ] Calculate KPIs from real data:
     - Total Revenue (sum of price)
     - Active Packages count
     - Avg Credits Left (across active packages)
     - Expiring This Week count (validUntil in next 7 days)
- [ ] Display package table with: member phone, type, credits, expiry
- [ ] Sort by validUntil ascending
- [ ] Real-time updates when packages change
- [ ] Zero TypeScript errors
- [ ] Build passes: `npm run build`

**Implementation Steps:**

1. **Add Imports:**
   ```typescript
   import { useAdminSub, useClubRecordSubscription } from '../../hooks';
   import { isPackage, type Package } from '../../lib/models';
   ```

2. **Setup Hooks:**
   ```typescript
   const { adminSub } = useAdminSub();
   const today = new Date();
   const todayStr = today.toISOString().split('T')[0];
   
   const { records, loading, error } = useClubRecordSubscription({
     gsi2pk: `${adminSub}#PACKAGES`,
     enabled: !!adminSub
   });
   
   const packages = records.filter(isPackage);
   ```

3. **Filter into Active & Expired:**
   ```typescript
   const activePackages = packages.filter(p => p.validUntil >= todayStr);
   const expiredPackages = packages.filter(p => p.validUntil < todayStr);
   ```

4. **Calculate KPIs:**
   ```typescript
   const totalRevenue = packages.reduce((sum, p) => sum + (p.price || 0), 0);
   const activeCount = activePackages.length;
   const avgCreditsLeft = activePackages.length > 0
     ? activePackages.reduce((sum, p) => sum + (p.remainingCredits || 0), 0) / activePackages.length
     : 0;
   
   const sevenDaysFromNow = new Date(today);
   sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
   const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];
   
   const expiringCount = packages.filter(p => 
     p.validUntil >= todayStr && p.validUntil <= sevenDaysStr
   ).length;
   ```

5. **Render Active & Expired Tabs:**
   - Keep KPI boxes with real data
   - Add tabbed view: "Active Packages" / "Expired Packages"
   - Display table with columns: member phone, type, total credits, remaining, expires
   - Sort by validUntil ascending (expiring soonest first)

6. **Test:**
   - [ ] KPI values are calculated correctly
   - [ ] Active vs Expired packages correctly split
   - [ ] Create new package → appears in Active tab
   - [ ] Package expires → moves to Expired tab
   - [ ] Edit package → KPIs update
   - [ ] No console errors
   - [ ] TypeScript build succeeds

**Key Files to Modify:**
- `src/components/pos-packages/PosPackagesTab.tsx`

---

## Task 5: Update CRUD Modals (Members & Coaches)

**Objective:** Ensure CRUD modals use factory functions and updated backend API.

**Acceptance Criteria:**
- [ ] MemberCrudModal properly integrated with CRM component
- [ ] CoachCrudModal properly integrated with Appointments component
- [ ] Both modals pass factory-created objects to backend
- [ ] Create operations use correct factory (createMember, createCoach)
- [ ] Update operations construct pk/sk correctly
- [ ] Delete operations pass pk/sk correctly
- [ ] No hardcoded field names or formatters
- [ ] All mutations use `client.models.ClubRecord` API
- [ ] Zero TypeScript errors

**MemberCrudModal.tsx Changes:**
- [ ] No changes needed (already has form structure)
- [ ] Parent component (CrmDashboard) updated to call factory functions
- [ ] Verify onSave callback properly handles create/update distinction

**CoachCrudModal.tsx Changes:**
- [ ] No changes needed (already has form structure)
- [ ] Parent component (AppointmentsTab) updated to call factory functions
- [ ] Verify onSave callback properly handles create/update distinction
- [ ] Verify onDelete callback properly passes pk/sk

**Integration Checklist:**
- [ ] CrmDashboard calls `createMember()` in handleSaveCoach equivalent
- [ ] AppointmentsTab calls `createCoach()` in handleSaveCoach
- [ ] Both use `client.models.ClubRecord.create()` for new records
- [ ] Both use `client.models.ClubRecord.update()` for edits
- [ ] Coaches use `client.models.ClubRecord.delete()` for deletion
- [ ] All field names match factory function signatures

**Key Files to Modify:**
- `src/components/crm/MemberCrudModal.tsx` (verify, minimal changes expected)
- `src/components/appointments/CoachCrudModal.tsx` (verify, minimal changes expected)

---

## Task 6: Verify Build & Real-Time Sync

**Objective:** Comprehensive verification that all refactoring is complete and working.

**Acceptance Criteria:**
- [ ] Zero TypeScript errors: `npm run build` succeeds
- [ ] All components properly use hooks (no legacy Member/Coach models)
- [ ] All CRUD operations use factory functions
- [ ] All records filtered with type guards
- [ ] Real-time updates verified: add/edit/delete propagates to UI in < 3s
- [ ] Subscriptions cleaned on unmount (DevTools verification)
- [ ] No memory leaks (heap snapshots show stable memory)
- [ ] Cross-admin isolation verified
- [ ] Error states handled gracefully
- [ ] Loading states displayed correctly

**Pre-Build Checklist:**
- [ ] No `formatPhoneSk()` calls in components
- [ ] No `getAdminSub()` calls in components (use hook instead)
- [ ] No `client.models.Member.*` calls (all in CrmDashboard refactored)
- [ ] No `client.models.Coach.*` calls (all in AppointmentsTab refactored)
- [ ] No `useRef` for subscription tracking (hooks handle it)
- [ ] No `cleanupSubscriptions()` functions
- [ ] All imports from `src/hooks/` and `src/lib/models.ts`

**Build Verification:**
```bash
npm run build
# Expected: Successful build with 0 errors, 0 warnings
```

**Runtime Verification Steps:**

1. **TypeScript Check:**
   - [ ] `npm run build` completes with 0 errors
   - [ ] VSCode shows no red squiggles in component files

2. **Functionality Check (Manual):**
   - [ ] **CRM Tab:**
     - [ ] Load page → displays members
     - [ ] Add member → appears immediately
     - [ ] Edit member name → updates instantly
     - [ ] Change status to INACTIVE → removed from view
   
   - [ ] **Appointments Tab:**
     - [ ] Load page → displays coaches
     - [ ] Add coach → appears immediately
     - [ ] Edit coach → updates instantly
     - [ ] Delete coach → removed from list
   
   - [ ] **Activities Tab:**
     - [ ] Load page → displays this week's schedules
     - [ ] Schedule displays correctly in grid (day & time)
     - [ ] Add schedule → appears immediately
   
   - [ ] **POS & Packages Tab:**
     - [ ] Load page → displays KPI boxes with real values
     - [ ] Active packages tab shows only unexpired
     - [ ] Expired packages tab shows only expired
     - [ ] KPI values calculated correctly

3. **Performance Check:**
   - [ ] Initial page load < 2s
   - [ ] Real-time update latency < 100ms (DevTools Network)
   - [ ] No spike in memory usage over 5 minutes (heap snapshots)

4. **Cross-Admin Isolation Check:**
   - [ ] Sign in as Admin A
   - [ ] Create member M1
   - [ ] Sign out, sign in as Admin B
   - [ ] Verify M1 is NOT visible to Admin B
   - [ ] Create member M2
   - [ ] Sign out, sign in as Admin A
   - [ ] Verify M2 is NOT visible to Admin A
   - [ ] Verify M1 is still visible to Admin A

5. **Error Handling Check:**
   - [ ] Disconnect network, try to create record → error message displayed
   - [ ] Reconnect → retry works
   - [ ] Try to create invalid record (missing required field) → validation error

6. **Memory Leak Check:**
   - [ ] Open DevTools → Memory tab
   - [ ] Take heap snapshot (Snapshot 1)
   - [ ] Navigate CRM → Appointments → Activities → POS tabs repeatedly (5 times)
   - [ ] Take heap snapshot (Snapshot 2)
   - [ ] Compare snapshots: memory growth should be < 5MB
   - [ ] Check for detached DOM nodes or retained subscriptions

**Success Criteria:**
✅ All 6 tasks completed
✅ Zero TypeScript errors
✅ All real-time features working
✅ No memory leaks detected
✅ Cross-admin isolation verified
✅ Build passes with `npm run build`

---

## Implementation Order

**Do NOT skip steps.** Execute in order:

1. **Task 1** → CrmDashboard.tsx refactor
2. **Task 2** → AppointmentsTab.tsx refactor
3. **Task 3** → ActivitiesTab.tsx refactor
4. **Task 4** → PosPackagesTab.tsx refactor
5. **Task 5** → Verify CRUD modals
6. **Task 6** → Build & verification

After each task, verify:
- [ ] Component builds without errors
- [ ] No breaking changes to other components
- [ ] Real-time sync works in browser
- [ ] No console.error logs

---

## Rollback Plan

If any task fails:
1. Check git diff: `git diff src/components/`
2. Revert changes: `git checkout src/components/`
3. Re-read the failed component's current state
4. Identify the blocker and document it
5. Report to orchestrator with detailed error log

---

## Dependencies

- ✅ Phase 1 Complete: `src/lib/models.ts`, `src/hooks/useAdminSub.ts`, `src/hooks/useClubRecordSubscription.ts`
- ✅ Backend Schema: `amplify/data/resource.ts` (ClubRecord model with GSI1 & GSI2)
- ✅ AppSync API available and authenticated

---

## References

- **Design:** `.kiro/specs/phase2-std-component-refactoring/design.md`
- **Requirements:** `.kiro/specs/phase2-std-component-refactoring/requirements.md`
- **Models:** `src/lib/models.ts` (factory functions & type guards)
- **Hooks:** `src/hooks/useAdminSub.ts`, `src/hooks/useClubRecordSubscription.ts`
- **Architecture:** `.kiro/steering/architecture.md` (VidaBaile constraints)
