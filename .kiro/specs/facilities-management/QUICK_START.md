# Facilities Management - Quick Start Guide

## 📋 What is This Spec?

A complete feature specification for **Facilities Management** in VidaBaile's Settings tab. Admins can create, read, update, and delete dancing halls/facilities with full CRUD operations and index-optimized queries.

---

## 🎯 Core Requirements

### What Users Will Do
1. **View** all facilities as responsive cards showing name, capacity, occupancy, and status
2. **Create** new facilities via modal form (name, capacity, location, description, status)
3. **Edit** facility details (except facility ID, which is immutable)
4. **Delete** facilities with confirmation dialog
5. **Filter** facilities by status (ACTIVE, MAINTENANCE, CLOSED)

### What Developers Must Build
1. Update DynamoDB schema (add FACILITY entity type)
2. Implement 6 DatabaseService functions (all index-based, no scans)
3. Build 6 React components (container, grid, card, modal, filter, delete dialog)
4. Integrate into Settings tab
5. Write comprehensive tests (unit, component, E2E)

---

## 🏗️ Architecture at a Glance

```
User Interface (React)
   ↓
   FacilitiesManager (Container)
   ├── FacilitiesGrid (displays cards)
   ├── FacilityCard (individual card)
   ├── FacilityModal (create/edit form)
   ├── StatusFilter (filter dropdown)
   └── DeleteConfirmDialog (confirm delete)
   ↓
   DatabaseService Functions (Index-based queries)
   ├── createFacilityRecord()
   ├── getFacilityByIdRecord()
   ├── updateFacilityRecord()
   ├── deleteFacilityRecord()
   ├── queryAllFacilitiesRecord()      [GSI1 - no scan]
   └── queryFacilitiesByStatusRecord() [GSI1 - no scan]
   ↓
   AWS AppSync GraphQL API
   ↓
   DynamoDB (ClubRecord table)
```

---

## 🔑 Key Design Principles

### ✅ STD Compliance
- Entity: `FACILITY`
- Primary Key: `pk = {adminSub}`, `sk = FACILITY#{facilityId}`
- GSI1 for filtering: `gsi1pk = {adminSub}#FACILITIES`, `gsi1sk = STATUS#{status}#NAME#{name}`

### ✅ Index-Only Queries (NO Table Scans)
- All queries route through GSI1 or primary key
- CloudWatch logs should show ZERO scans

### ✅ Multi-Tenant Isolation
- Every query filtered by pk = adminSub
- Admin A cannot see Admin B's facilities
- Enforced at DynamoDB layer

### ✅ Tab-Based Navigation Only
- Facilities integrate into existing Settings tab
- NO new sidebar navigation
- Responsive layout (mobile, tablet, desktop)

---

## 📁 File Structure After Completion

```
amplify/data/resource.ts
  └─ Add 'FACILITY' to entityType enum
  └─ Add facility attributes

src/lib/models.ts
  └─ interface Facility
  └─ interface FacilityInput
  └─ function createFacility()
  └─ function isFacility()

src/services/DatabaseService.ts
  └─ createFacilityRecord()
  └─ getFacilityByIdRecord()
  └─ updateFacilityRecord()
  └─ deleteFacilityRecord()
  └─ queryAllFacilitiesRecord()
  └─ queryFacilitiesByStatusRecord()

src/components/facilities/
  ├─ FacilitiesManager.tsx         (Container)
  ├─ FacilitiesGrid.tsx            (Layout)
  ├─ FacilityCard.tsx              (Card presentation)
  ├─ FacilityModal.tsx             (Create/edit form)
  ├─ StatusFilter.tsx              (Filter dropdown)
  ├─ DeleteConfirmDialog.tsx       (Confirmation)
  └─ index.ts                      (Exports)

src/components/settings/SettingsTab.tsx
  └─ Import & render FacilitiesManager

src/components/facilities/*.test.tsx    (Tests)
src/services/DatabaseService.test.ts    (Tests)
```

---

## 🚀 Implementation Roadmap

### Phase 1: Backend (2-3 hours)
1. Update schema in `amplify/data/resource.ts`
2. Add Facility types to `src/lib/models.ts`
3. Implement 6 DatabaseService functions

### Phase 2: Frontend (4-5 hours)
4. Build FacilitiesManager container
5. Build FacilitiesGrid, FacilityCard
6. Build FacilityModal (create/edit form)
7. Build StatusFilter, DeleteConfirmDialog
8. Update SettingsTab to include FacilitiesManager

### Phase 3: Styling (1-2 hours)
9. Add CSS/responsive styling

### Phase 4: Testing (3-4 hours)
10. Write unit tests (DatabaseService)
11. Write component tests (React)
12. Write E2E tests (user journeys)

### Phase 5: Deployment (2-3 hours)
13. Deploy to sandbox
14. Deploy to production
15. Monitor & gather feedback

---

## 🔍 Key Files to Review

### For Designers
- **requirements.md** — User stories and acceptance criteria

### For Backend Developers
- **design.md** (Section 3.2) — DatabaseService function contracts
- **requirements.md** (Section 2) — Database schema and key patterns

### For Frontend Developers
- **design.md** (Section 2) — Component hierarchy and responsibilities
- **design.md** (Sections 2.1-2.7) — Component specs with render details

### For QA/Testers
- **tasks.md** (Phase 4) — Detailed test scenarios
- **requirements.md** (Section 3) — Acceptance criteria

---

## 💾 Database Keys Cheat Sheet

### Create Facility
```typescript
pk:     "{adminSub}"
sk:     "FACILITY#{facilityId}"
gsi1pk: "{adminSub}#FACILITIES"
gsi1sk: "STATUS#{status}#NAME#{name}"
gsi2pk: "{adminSub}#FACILITIES"
gsi2sk: "CREATED#{createdAt}"
```

### Query All Facilities
```typescript
query {
  gsi1pk: "{adminSub}#FACILITIES"
  // No gsi1sk filter = all facilities
}
```

### Query by Status
```typescript
query {
  gsi1pk: "{adminSub}#FACILITIES"
  gsi1sk: { beginsWith: "STATUS#ACTIVE" }
  // Only ACTIVE facilities
}
```

### Get Single Facility
```typescript
get {
  pk: "{adminSub}"
  sk: "FACILITY#{facilityId}"
}
```

---

## ✅ Success Criteria Checklist

- [ ] All 6 DatabaseService functions implemented (index-only)
- [ ] All 6 React components built and integrated
- [ ] SettingsTab renders FacilitiesManager
- [ ] Unit tests pass (DatabaseService, components)
- [ ] E2E tests pass (create, edit, delete, filter)
- [ ] No table scans in CloudWatch logs
- [ ] Multi-tenant isolation verified
- [ ] Responsive on mobile/tablet/desktop
- [ ] Form validation prevents invalid data
- [ ] Error handling covers all edge cases
- [ ] Code follows VidaBaile patterns
- [ ] Deployed to production

---

## 🐛 Common Pitfalls to Avoid

### ❌ DO NOT
- Create table scans in DatabaseService (use GSI1/primary key only)
- Add sidebar navigation (tab-based only)
- Hard-code admin IDs (use adminSub from auth context)
- Forget to include pk = adminSub in all queries
- Use REST endpoints for internal queries (GraphQL via AppSync only)
- Skip form validation (validate frontend + backend)

### ✅ DO
- Use GSI1 for bulk facility queries
- Use primary key for individual facility lookups
- Include pk filter in every query
- Test multi-tenant isolation (separate admin accounts)
- Log query strategies in comments
- Test error scenarios (network failure, permission denied, etc.)

---

## 🔗 External References

- **VidaBaile Architecture**: `.kiro/steering/architecture.md`
- **Core Database Spec**: `.kiro/specs/core-architecture-database/`
- **Similar Feature (CRM)**: `src/components/crm/MemberCrudModal.tsx` (modal pattern)

---

## 📞 Questions?

- **Spec Questions** → Review `requirements.md` or `design.md`
- **Task Details** → Check `tasks.md` for success criteria
- **Architecture Questions** → See `.kiro/steering/architecture.md`
- **Component Patterns** → Look at existing CRM or Activities components

---

## 📊 Metrics to Track

After deployment:

- **Query Latency**: All GSI1 queries < 100ms (p95)
- **Table Scans**: Should be ZERO
- **Error Rate**: < 0.1% for facility operations
- **User Adoption**: % of admins using facility management
- **Feature Usage**: # of facilities created per club

---

**Next Step**: Start with Phase 1 tasks in `tasks.md`. Happy building! 🚀

