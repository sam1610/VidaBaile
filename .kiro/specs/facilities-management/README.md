# Facilities Management Specification

**Spec Name**: `facilities-management`  
**Status**: ✅ Ready for Implementation  
**Target Tab**: Settings  
**Priority**: Medium  
**Estimated Effort**: 12-17 hours  

---

## 📚 Specification Documents

### Core Documents

| Document | Purpose | Audience |
|---|---|---|
| **[requirements.md](./requirements.md)** | User stories, acceptance criteria, database schema | Product Managers, Designers, QA |
| **[design.md](./design.md)** | Architecture, component hierarchy, implementation patterns | Backend Developers, Frontend Developers |
| **[tasks.md](./tasks.md)** | 20 concrete implementation tasks with success criteria | Developers |

### Reference Guides

| Document | Purpose | Audience |
|---|---|---|
| **[QUICK_START.md](./QUICK_START.md)** | High-level overview and navigation guide | Everyone (start here!) |
| **[SPEC_SUMMARY.md](./SPEC_SUMMARY.md)** | Executive summary and compliance verification | Team Leads, Architects |
| **[QUERY_REFERENCE.md](./QUERY_REFERENCE.md)** | Detailed database query examples with no-scan verification | Backend Developers |

### Configuration

| File | Purpose |
|---|---|
| **.config** | Spec metadata (name, type, status, priority) |
| **README.md** | This file |

---

## 🎯 What You're Building

Facilities Management is a comprehensive feature enabling VidaBaile admins to manage dancing halls/facilities with full CRUD operations (Create, Read, Update, Delete) in the Settings tab.

### Key Capabilities

✅ **View** all facilities as responsive cards  
✅ **Create** new facilities via modal form  
✅ **Edit** facility details (name, capacity, location, description, status)  
✅ **Delete** facilities with confirmation  
✅ **Filter** by status (ACTIVE, MAINTENANCE, CLOSED)  

### Technical Highlights

✅ **Index-Only Queries** — All queries use GSI1 or primary key (ZERO table scans)  
✅ **STD Compliance** — Canonical key patterns (FACILITY#{id})  
✅ **Multi-Tenant Isolation** — Partition by adminSub at DB layer  
✅ **Tab-Based Navigation** — Integrates into Settings tab (no sidebar)  
✅ **Responsive Design** — Works on mobile, tablet, desktop  

---

## 🚀 Getting Started

### For Designers/Product Managers
1. Start with [QUICK_START.md](./QUICK_START.md) — 5 min overview
2. Read [requirements.md](./requirements.md) — User stories & AC
3. Review component specs in [design.md](./design.md) (Sections 2.1-2.7)

### For Frontend Developers
1. Start with [QUICK_START.md](./QUICK_START.md) — 5 min overview
2. Read [design.md](./design.md) — Component architecture
3. Review [tasks.md](./tasks.md) (Phase 2) — React component tasks
4. Use [design.md](./design.md) (Sections 2.2-2.7) as component specs

### For Backend Developers
1. Start with [QUICK_START.md](./QUICK_START.md) — 5 min overview
2. Read [design.md](./design.md) (Section 3) — DatabaseService functions
3. Read [requirements.md](./requirements.md) (Section 2) — Database schema
4. Use [QUERY_REFERENCE.md](./QUERY_REFERENCE.md) for detailed query patterns
5. Review [tasks.md](./tasks.md) (Phase 1) — Backend tasks

### For QA/Testers
1. Start with [QUICK_START.md](./QUICK_START.md) — 5 min overview
2. Read [requirements.md](./requirements.md) (Section 1) — Acceptance criteria
3. Review [tasks.md](./tasks.md) (Phase 4) — Test scenarios
4. Use [QUERY_REFERENCE.md](./QUERY_REFERENCE.md) to verify no-scan requirement

### For Architects
1. Read [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) — Compliance & design decisions
2. Review [QUERY_REFERENCE.md](./QUERY_REFERENCE.md) — Index strategy
3. Check [design.md](./design.md) (Section 9) — Security & multi-tenancy

---

## 📖 Document Navigation

### [requirements.md](./requirements.md) — START HERE for User Stories

**Sections**:
- 1. User Stories (6 stories with acceptance criteria)
- 2. Database Requirements (entity structure, key patterns, access patterns)
- 3. UI/UX Requirements (card display, modal, dialog)
- 4. Non-Functional Requirements (performance, security, reliability)
- 5. Compliance with Architecture (steering doc alignment)
- 6. Out of Scope
- 7. Success Criteria

**When to read**:
- Understanding feature requirements ✅
- Writing acceptance tests ✅
- Defining done criteria ✅

---

### [design.md](./design.md) — START HERE for Architecture

**Sections**:
- 1. Architecture Overview (system diagram)
- 2. Component Hierarchy (6 React components with detailed specs)
- 3. DatabaseService Extensions (6 functions, STD patterns, query strategies)
- 4. Data Schema Update (what to add to amplify/data/resource.ts)
- 5. API Integration Patterns (GraphQL mutations, subscriptions)
- 6. Error Handling Strategy (scenarios & messages)
- 7. Testing Strategy (unit, integration, E2E)
- 8. Performance Optimization (query, UI, caching)
- 9. Security Considerations (multi-tenant, input validation, rate limiting)
- 10. Migration & Rollout (deployment steps)

**When to read**:
- Understanding overall architecture ✅
- Component implementation details ✅
- Database query patterns ✅
- Error handling approach ✅
- Testing strategy ✅

---

### [tasks.md](./tasks.md) — START HERE for Implementation

**Sections**:
- Phase 1: Backend Setup (3 tasks)
- Phase 2: Frontend Components (6 tasks)
- Phase 3: Styling & Polish (1 task)
- Phase 4: Testing (5 tasks)
- Phase 5: Integration & Deployment (5 tasks)

**Each task includes**:
- Clear description
- Acceptance criteria (success definition)
- Estimated scope

**When to use**:
- Tracking implementation progress ✅
- Defining done for each component ✅
- Breaking work into sprints ✅
- QA test planning ✅

---

### [QUICK_START.md](./QUICK_START.md) — 5-Minute Orientation

**Sections**:
- What is this spec?
- Core requirements (users, developers)
- Architecture at a glance
- Key design principles
- File structure after completion
- Implementation roadmap (phases & timing)
- Key files to review (by role)
- Database keys cheat sheet
- Success criteria checklist
- Common pitfalls to avoid

**When to read**:
- First-time orientation ✅
- Quick reference during implementation ✅
- Team onboarding ✅

---

### [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) — Design Decisions & Compliance

**Sections**:
- Specification overview
- Key design decisions (6 decisions with rationale)
- Compliance verification (VidaBaile steering doc)
- Database schema changes
- Implementation phases (timing)
- Features (completed + optional future)
- Query patterns (no scans verification)
- Security & multi-tenancy
- Testing strategy
- Deployment checklist
- Estimated effort

**When to read**:
- Verifying compliance with architecture ✅
- Understanding design rationale ✅
- Team lead/architect review ✅

---

### [QUERY_REFERENCE.md](./QUERY_REFERENCE.md) — Database Query Examples

**Sections**:
- Query index (6 operations)
- 1. Create Facility (PUT, no scan)
- 2. Get by ID (primary key, no scan)
- 3. Update (direct update + GSI1 regen)
- 4. Delete (direct delete, no scan)
- 5. List All (GSI1 query, no scan)
- 6. Filter by Status (GSI1 range query, no scan)
- Query performance comparison (efficient vs inefficient)
- Multi-tenant isolation verification
- Common mistakes to avoid
- Monitoring & validation
- Summary table

**When to read**:
- Implementing DatabaseService functions ✅
- Verifying no-scan requirement ✅
- Debugging query performance issues ✅
- Code review (query validation) ✅

---

## 📋 Spec Checklist

### Pre-Implementation
- [ ] Read QUICK_START.md (5 min)
- [ ] Read requirements.md (15 min)
- [ ] Read design.md (30 min)
- [ ] Review QUERY_REFERENCE.md (15 min)
- [ ] Team alignment meeting (30 min)

### During Implementation
- [ ] Track progress against tasks.md
- [ ] Cross-reference design.md for component specs
- [ ] Use QUERY_REFERENCE.md for database queries
- [ ] Validate compliance with requirements.md

### Before Deployment
- [ ] All 20 tasks completed
- [ ] All tests passing (unit + E2E)
- [ ] No table scans in CloudWatch logs
- [ ] Multi-tenant isolation verified
- [ ] Code review approved
- [ ] SPEC_SUMMARY.md compliance checklist ✅

---

## 🏗️ File Structure Reference

```
.kiro/specs/facilities-management/
├── README.md                  (This file — navigation guide)
├── .config                    (Spec metadata)
├── requirements.md            (User stories, AC, schema, compliance)
├── design.md                  (Architecture, components, patterns)
├── tasks.md                   (20 implementation tasks)
├── QUICK_START.md             (5-min orientation)
├── SPEC_SUMMARY.md            (Design decisions & compliance)
└── QUERY_REFERENCE.md         (Database query examples & patterns)
```

---

## 🎓 How to Use This Spec

### Scenario 1: "I'm new to this project, where do I start?"
1. Read QUICK_START.md (5 min)
2. Skim design.md (Section 1) for architecture overview
3. Ask questions in team chat

### Scenario 2: "I'm implementing FacilitiesManager component"
1. Read design.md (Section 2.1) for component spec
2. Look at existing CRM MemberCrudModal.tsx for pattern
3. Implement to match design spec
4. Reference design.md acceptance criteria

### Scenario 3: "I'm implementing DatabaseService functions"
1. Read design.md (Section 3.2) for function signatures
2. Read QUERY_REFERENCE.md (Sections 1-6) for detailed examples
3. Verify each query in QUERY_REFERENCE.md uses indexes (no scans)
4. Implement exactly as specified

### Scenario 4: "I'm writing tests for this feature"
1. Read requirements.md (Section 1) for acceptance criteria
2. Read tasks.md (Phase 4) for test scenarios
3. Review QUERY_REFERENCE.md to verify no-scan requirement
4. Write tests matching the scenarios

### Scenario 5: "I need to do a code review"
1. Read SPEC_SUMMARY.md for design decisions
2. Check requirements.md acceptance criteria
3. Use QUERY_REFERENCE.md to verify query patterns
4. Verify compliance with design.md specifications

### Scenario 6: "Something doesn't match the spec"
1. Check requirements.md (Section 1) for user story
2. Check design.md for component/function specification
3. Check tasks.md for acceptance criteria
4. File a bug with references to spec sections

---

## 🔍 Key Compliance Requirements

### Architecture Steering Document

✅ **Tab Navigation Only** (Section 2.1)
- Facilities in Settings tab
- NO sidebar navigation

✅ **Index-Only Queries** (Section 5)
- All queries use GSI1 or primary key
- ZERO table scans

✅ **STD Compliance** (Section 3.4)
- Entity: FACILITY
- Keys: pk={adminSub}, sk=FACILITY#{id}
- GSI1: {adminSub}#FACILITIES

✅ **Native AWS Only** (Section 2.3)
- AppSync GraphQL only
- No Zapier/Make/third-party platforms

✅ **Multi-Tenant Isolation** (Section 8)
- Partition by adminSub
- Every query filtered by pk
- AppSync auth guard

---

## ⏱️ Time Estimates

| Phase | Tasks | Time |
|---|---|---|
| Backend Setup | 3 | 2-3 hours |
| Frontend Components | 6 | 4-5 hours |
| Styling & Polish | 1 | 1-2 hours |
| Testing | 5 | 3-4 hours |
| Deployment | 5 | 2-3 hours |
| **TOTAL** | **20** | **12-17 hours** |

---

## 🚦 Status Tracking

### Spec Status: ✅ Complete

| Aspect | Status | Evidence |
|---|---|---|
| Requirements | ✅ Complete | requirements.md (7 sections) |
| Design | ✅ Complete | design.md (10 sections) |
| Tasks | ✅ Complete | tasks.md (20 tasks) |
| Reference | ✅ Complete | QUERY_REFERENCE.md (6 patterns) |
| Compliance | ✅ Verified | SPEC_SUMMARY.md compliance table |

### Ready for Implementation: ✅ YES

---

## 💬 Q&A

**Q: Where do I find database schema changes?**  
A: design.md Section 4 + requirements.md Section 2.1

**Q: How do I verify my queries don't scan?**  
A: Use QUERY_REFERENCE.md as reference + CloudWatch logs

**Q: What's the component hierarchy?**  
A: design.md Section 1 (diagram) + Section 2 (details)

**Q: How do I ensure multi-tenant isolation?**  
A: QUERY_REFERENCE.md Section "MultiTenant Isolation Verification"

**Q: What are the acceptance criteria?**  
A: requirements.md Section 1 (user stories) + tasks.md (success criteria)

**Q: Is there a checklist?**  
A: Yes! QUICK_START.md success criteria + SPEC_SUMMARY.md deployment checklist

**Q: What if something in my code doesn't match the spec?**  
A: Check requirements.md (acceptance) + design.md (architecture)

---

## 🔗 Related Documentation

- **VidaBaile Architecture**: `.kiro/steering/architecture.md`
- **Core Database Spec**: `.kiro/specs/core-architecture-database/`
- **CRM Feature** (similar): `src/components/crm/` (modal pattern reference)
- **Activities Feature** (similar): `src/components/activities/` (component patterns)

---

## ✅ Completed

- ✅ Requirements documented
- ✅ Architecture designed
- ✅ 20 tasks defined
- ✅ Query patterns verified
- ✅ Compliance checked
- ✅ Effort estimated
- ✅ Ready for sprint planning

**Next Step**: Create sprint tasks based on tasks.md and begin Phase 1 (Backend Setup)

---

**Last Updated**: September 3, 2024  
**Spec Type**: Feature  
**Priority**: Medium  
**Status**: Ready for Implementation

