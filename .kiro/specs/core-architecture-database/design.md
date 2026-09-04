# Design Document — VidaBaile Core Architecture & Database Foundation

## Overview

VidaBaile is an AI-driven dance club management platform built entirely on AWS. This spec establishes the foundational layer that all other features depend on:

- A React 18 + TypeScript + Vite **Admin UI** with tab-based navigation and Amplify UI components
- An **Amplify Gen 2 code-first backend** (TypeScript) managing all infrastructure under the `amplify/` directory
- An **AWS AppSync GraphQL API** as the exclusive internal data interface
- A **single DynamoDB table** (`DancingClubData`) using Single-Table Design with six canonical entity types
- **Cognito User Pools** for Admin-only authentication, Secrets Manager for credentials, and least-privilege IAM roles for every Lambda function

The design here is intentionally foundational — it scaffolds the project structure, data model, and security posture that every subsequent feature (agent layer, bookings, POS, CRM, marketing) builds upon.

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single DynamoDB table | Yes (STD) | Reduces operational complexity; overloaded PK/SK with GSI1 covers all six primary access patterns |
| GraphQL-only internal API | AppSync | Consistent auth, real-time subscriptions, and type safety across Admin UI and Lambda tools |
| Tab navigation, no sidebar | AppTabs.tsx | Hard architectural constraint; tabs keep all content equally reachable on mobile |
| Amplify Gen 2 code-first | TypeScript IaC | Version-controlled, reproducible deployments; `ampx sandbox` for local dev |
| Cognito Groups auth | `Admins` group | Clean boundary: Admin staff only, no public access, group claim in JWT |
| Secrets Manager | ARN env vars | Zero hardcoded credentials; Lambda reads ARN from env, resolves at runtime |

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ADMIN WEB APP                                │
│  React 18 + Vite + Amplify UI + TypeScript (strict)                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ <Authenticator> (Cognito gate — no render until authed)     │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │ AppTabs.tsx                                           │  │   │
│  │  │ [Home][Activities][Facilities][Appointments]          │  │   │
│  │  │ [POS & Packages][CRM][PR/Marketing][Settings]         │  │   │
│  │  │                                                       │  │   │
│  │  │  ┌──────────────┐  active tab panel renders here      │  │   │
│  │  │  │  TabPanel.tsx │  per-tab component trees           │  │   │
│  │  │  └──────────────┘                                     │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ GraphQL over HTTPS
                          │ Authorization: Bearer <Cognito JWT>
┌─────────────────────────▼───────────────────────────────────────────┐
│                    AWS AppSync (GraphQL API)                         │
│  Auth modes: AMAZON_COGNITO_USER_POOLS (default) + AWS_IAM          │
│  Models: Member, Coach, Schedule, Booking, Package, Claim           │
│  Custom queries: listTodaySchedules, getMemberStats                 │
│  Subscriptions: onCreateBooking, onCreateOrUpdateSchedule           │
└──────┬─────────────────────────────────────┬────────────────────────┘
       │ DynamoDB Direct Resolver             │ Lambda Resolver
       │ (CRUD operations)                    │ (custom business logic)
┌──────▼──────────────────┐     ┌────────────▼──────────────────────┐
│   DancingClubData        │     │  Lambda Functions (Node 20.x)     │
│   (DynamoDB)             │     │  - whatsapp-webhook               │
│                          │     │  - strands-agent                  │
│  PK / SK (composite)     │     │  - book-coach                     │
│  GSI1: GSI1PK / GSI1SK   │     │  - pay-package                    │
│  PAY_PER_REQUEST         │     │  - postpone-session               │
│  PITR enabled            │     │  - query-membership               │
│                          │     │  - broadcast-marketing            │
└──────────────────────────┘     └───────────────────────────────────┘
                                              │
                              ┌───────────────▼──────────────────────┐
                              │  AWS Secrets Manager                  │
                              │  - whatsapp-api-token                 │
                              │  - pinpoint-credentials               │
                              │  (Lambda reads ARN from env var)      │
                              └──────────────────────────────────────┘
```

### Amplify Gen 2 Module Relationship

```
amplify/backend.ts
    ├── imports amplify/auth/resource.ts    → defineAuth(...)
    └── imports amplify/data/resource.ts    → defineData(schema, authorizationModes)
            ├── references Lambda fns for allow.resource(fn) rules
            └── references amplify/functions/* for custom resolvers

amplify/functions/
    ├── whatsapp-webhook/resource.ts        → defineFunction(...)
    ├── strands-agent/resource.ts
    ├── book-coach/resource.ts
    ├── pay-package/resource.ts
    ├── postpone-session/resource.ts
    ├── query-membership/resource.ts
    └── broadcast-marketing/resource.ts

amplify/custom/
    └── api-gateway-webhook/               → CDK L2 construct (API GW + Lambda integration)

src/lib/amplify-config.ts
    └── Amplify.configure(outputs)         → called once in main.tsx before any AppSync op
```

---

## Components and Interfaces

### Frontend Component Hierarchy

```
main.tsx
└── App.tsx
    └── <Authenticator>                          (from @aws-amplify/ui-react)
        └── <AppTabs />                          (src/components/layout/AppTabs.tsx)
            ├── Tab label bar (8 tabs, horizontal scroll on mobile)
            └── <TabPanel index={activeTab} />   (src/components/layout/TabPanel.tsx)
                ├── index=0  → <HomeTab />        (src/components/home/)
                ├── index=1  → <ActivitiesTab />  (src/components/activities/)
                ├── index=2  → <FacilitiesTab />  (src/components/facilities/)
                ├── index=3  → <AppointmentsTab />(src/components/appointments/)
                ├── index=4  → <POSPackagesTab /> (src/components/pos-packages/)
                ├── index=5  → <CRMTab />         (src/components/crm/)
                ├── index=6  → <PRMarketingTab /> (src/components/pr-marketing/)
                └── index=7  → <SettingsTab />    (src/components/settings/)
```

### AppTabs.tsx Interface

```typescript
// src/components/layout/AppTabs.tsx

const TAB_CONFIG = [
  { label: 'Home',          index: 0 },
  { label: 'Activities',    index: 1 },
  { label: 'Facilities',    index: 2 },
  { label: 'Appointments',  index: 3 },
  { label: 'POS & Packages',index: 4 },
  { label: 'CRM',           index: 5 },
  { label: 'PR/Marketing',  index: 6 },
  { label: 'Settings',      index: 7 },
] as const;

// Renders Amplify UI <Tabs> with horizontal-scroll container at < 768px
// Active tab indicated via Amplify UI token: backgroundColor, color, borderBottom
// No sidebar element is rendered at any breakpoint
```

### TabPanel.tsx Interface

```typescript
// src/components/layout/TabPanel.tsx

interface TabPanelProps {
  children: React.ReactNode;
  index: number;           // 0-7 matching TAB_CONFIG
  activeIndex: number;
}

// Renders children only when index === activeIndex
// On data-fetch error: displays <Alert variation="error"> within panel
// Does NOT unmount AppTabs or navigate away on error
```

### Amplify Configuration

```typescript
// src/lib/amplify-config.ts
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

export function configureAmplify(): void {
  Amplify.configure(outputs);
}

// src/main.tsx
import { configureAmplify } from './lib/amplify-config';
configureAmplify();  // MUST be called before any AppSync operation
```

### Custom Hooks

```typescript
// src/hooks/useAppSync.ts
// Wraps generateClient<Schema>() from aws-amplify/data
// Returns typed client, loading state, error state
// Re-exports model query/mutation helpers

// src/hooks/useAgent.ts
// (Future) Subscribes to agent status events via AppSync subscription
// Placeholder in this foundational spec
```

### Amplify Gen 2 Backend Interfaces

```typescript
// amplify/auth/resource.ts
export const auth = defineAuth({
  loginWith: { email: true },
  groups: ['Admins'],
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialCharacters: true,
  },
});

// amplify/data/resource.ts
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',  // Cognito JWT default
    // IAM mode enabled for Lambda-to-AppSync service calls
  },
});

// amplify/backend.ts
export const backend = defineBackend({ auth, data });
```

---

## Data Models

### AppSync GraphQL Schema — All Six Models

The schema is defined in `amplify/data/resource.ts`. All models use `a.model()` which auto-generates DynamoDB tables, CRUD operations, `createdAt`/`updatedAt` fields, and real-time subscriptions.

**Authorization pattern used throughout:**
- `allow.groups(['Admins'])` — full CRUD for authenticated Cognito Admins
- `allow.resource(fn)` — scoped access for specific Lambda functions

```typescript
// amplify/data/resource.ts (schema excerpt — illustrative, not exhaustive)

const schema = a.schema({

  // ── Member ────────────────────────────────────────────────────────
  Member: a.model({
    memberId:  a.id().required(),
    clubId:    a.string().required(),
    name:      a.string().required(),   // max 100 chars — validated in resolver
    phone:     a.string().required(),   // E.164 format — validated in resolver
    email:     a.string(),              // max 254 chars
    tier:      a.enum(['STANDARD','SILVER','GOLD','PLATINUM']),
    status:    a.enum(['ACTIVE','INACTIVE','SUSPENDED']).required(),
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(queryMembershipFn).to(['query']),
    allow.resource(bookCoachFn).to(['query']),
  ]),

  // ── Coach ─────────────────────────────────────────────────────────
  Coach: a.model({
    coachId:   a.id().required(),
    name:      a.string().required(),
    specialty: a.string().required(),
    bio:       a.string(),
    phone:     a.string(),
    email:     a.string(),
    status:    a.enum(['ACTIVE','INACTIVE','SUSPENDED']).required(),
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(bookCoachFn).to(['query']),
  ]),

  // ── Schedule ──────────────────────────────────────────────────────
  Schedule: a.model({
    scheduleId:   a.id().required(),
    date:         a.date().required(),
    startTime:    a.time().required(),
    endTime:      a.time().required(),
    coachId:      a.id().required(),
    facilityId:   a.string(),
    activityType: a.string().required(),  // max 100 chars
    capacity:     a.integer().required(), // [1, 500] — validated in resolver
    status:       a.enum(['SCHEDULED','CANCELLED','COMPLETED']).required(),
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(bookCoachFn).to(['query']),
  ]),

  // ── Booking ───────────────────────────────────────────────────────
  Booking: a.model({
    bookingId:  a.id().required(),
    memberId:   a.id().required(),
    scheduleId: a.id().required(),
    status:     a.enum(['CONFIRMED','CANCELLED','PENDING']).required(),
    bookedAt:   a.datetime().required(),
    notes:      a.string(),  // max 1000 chars
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(bookCoachFn).to(['query','mutate']),
    allow.resource(postponeSessionFn).to(['query','mutate']),
  ]),

  // ── Package ───────────────────────────────────────────────────────
  Package: a.model({
    packageId:        a.id().required(),
    memberId:         a.id(),
    packageType:      a.string().required(),
    totalCredits:     a.integer().required(),     // >= 1
    remainingCredits: a.integer().required(),     // >= 0, <= totalCredits
    price:            a.float().required(),       // [0.01, 999999.99]
    currency:         a.string().required(),      // exactly 3 chars, ISO 4217
    validFrom:        a.date().required(),
    validUntil:       a.date().required(),        // >= validFrom
    status:           a.enum(['ACTIVE','EXPIRED','SUSPENDED','EXHAUSTED']).required(),
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(payPackageFn).to(['query','mutate']),
    allow.resource(queryMembershipFn).to(['query']),
  ]),

  // ── Claim ─────────────────────────────────────────────────────────
  Claim: a.model({
    claimId:         a.id().required(),
    bookingId:       a.id().required(),
    packageId:       a.id().required(),
    memberId:        a.id().required(),
    creditsConsumed: a.integer().required(),  // >= 1
    claimedAt:       a.datetime().required(),
  }).authorization(allow => [
    allow.groups(['Admins']),
    allow.resource(payPackageFn).to(['query','mutate']),
    allow.resource(queryMembershipFn).to(['query']),
  ]),

});
```

> **Note on STD key mapping:** Amplify Gen 2 auto-creates one DynamoDB table per model by default. To use the canonical Single-Table Design (`DancingClubData`) with overloaded PK/SK, we override the table name and key schema using the CDK escape hatch in `amplify/backend.ts`. The `GSI1` is defined on the shared table with `GSI1PK`/`GSI1SK` projected ALL attributes. Lambda resolvers that perform STD queries use the AWS SDK's `DynamoDBClient` directly against `DancingClubData` rather than going through the generated client.

### DynamoDB Single-Table Design

#### Table Configuration

| Property | Value |
|---|---|
| Table name | `DancingClubData` |
| Partition key | `PK` (String) |
| Sort key | `SK` (String) |
| Billing | PAY_PER_REQUEST (on-demand) |
| PITR | Enabled (35-day rolling window) |
| GSI1 partition key | `GSI1PK` (String) |
| GSI1 sort key | `GSI1SK` (String) |
| GSI1 projection | ALL |

#### Entity Key Patterns

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Member | `MEMBER#<memberId>` | `PROFILE` | `CLUB#<clubId>` | `MEMBER#<memberId>` |
| Coach | `COACH#<coachId>` | `PROFILE` | `SPECIALTY#<specialty>` | `COACH#<coachId>` |
| Schedule | `SCHEDULE#<scheduleId>` | `DETAIL` | `DATE#<YYYY-MM-DD>` | `SCHEDULE#<scheduleId>` |
| Booking | `BOOKING#<bookingId>` | `DETAIL` | `MEMBER#<memberId>` | `BOOKING#<bookingId>` |
| Package | `PACKAGE#<packageId>` | `DETAIL` | `TYPE#<packageType>` | `PACKAGE#<packageId>` |
| Claim | `CLAIM#<claimId>` | `DETAIL` | `BOOKING#<bookingId>` | `CLAIM#<claimId>` |

#### Access Patterns

| Access Pattern | Key Condition | GSI |
|---|---|---|
| Get member by ID | `PK = MEMBER#<id>` AND `SK = PROFILE` | — (base table) |
| List members by club | `GSI1PK = CLUB#<clubId>` | GSI1 |
| Get coach by ID | `PK = COACH#<id>` AND `SK = PROFILE` | — |
| List coaches by specialty | `GSI1PK = SPECIALTY#<type>` | GSI1 |
| Get schedule by ID | `PK = SCHEDULE#<id>` AND `SK = DETAIL` | — |
| List schedules by date | `GSI1PK = DATE#<YYYY-MM-DD>` | GSI1 |
| Get booking by ID | `PK = BOOKING#<id>` AND `SK = DETAIL` | — |
| List bookings by member | `GSI1PK = MEMBER#<memberId>` | GSI1 |
| Get package by ID | `PK = PACKAGE#<id>` AND `SK = DETAIL` | — |
| List packages by type | `GSI1PK = TYPE#<packageType>` | GSI1 |
| Get claim by ID | `PK = CLAIM#<id>` AND `SK = DETAIL` | — |
| List claims by booking | `GSI1PK = BOOKING#<bookingId>` | GSI1 |

#### STD Table Layout (Conceptual)

```
PK                    SK        GSI1PK              GSI1SK               ...fields...
─────────────────────────────────────────────────────────────────────────────────────
MEMBER#m-001          PROFILE   CLUB#club-baires     MEMBER#m-001         name, phone, tier, status
MEMBER#m-002          PROFILE   CLUB#club-baires     MEMBER#m-002         ...
COACH#c-001           PROFILE   SPECIALTY#salsa      COACH#c-001          name, specialty, status
SCHEDULE#s-001        DETAIL    DATE#2026-10-01      SCHEDULE#s-001       date, startTime, coachId
SCHEDULE#s-002        DETAIL    DATE#2026-10-01      SCHEDULE#s-002       ...
BOOKING#b-001         DETAIL    MEMBER#m-001         BOOKING#b-001        scheduleId, status, bookedAt
PACKAGE#p-001         DETAIL    TYPE#MONTHLY         PACKAGE#p-001        totalCredits, price, currency
CLAIM#cl-001          DETAIL    BOOKING#b-001        CLAIM#cl-001         creditsConsumed, claimedAt
```

### Authentication Flow

```
[Admin Browser]
      │
      ▼
<Authenticator> (from @aws-amplify/ui-react)
      │ renders hosted login UI
      │ user submits credentials
      │
      ▼
[Cognito User Pool]
      │ validates password policy
      │ checks user belongs to 'Admins' group
      │ on success → issues ID token + access token (JWT)
      │ on failure → returns error to Authenticator component
      ▼
<Authenticator> unwraps children (AppTabs renders)
      │
      ▼
[AppSync GraphQL API]
      │ Authorization header: Bearer <Cognito Access Token>
      │ AppSync verifies JWT signature against Cognito public keys
      │ Extracts cognito:groups claim
      │ Evaluates allow.groups(['Admins']) rule → permit or deny
      │
      ▼
[DynamoDB / Lambda resolver executes]
```

**Session expiry handling:** The `Authenticator` component listens for Amplify's `tokenRefresh_failure` Hub event. On detection, the Admin UI clears protected state and redirects to login within 5 seconds via React Router's `useNavigate`.

**Non-Admin user:** If credentials are valid but the user is not in the `Admins` group, AppSync rejects every request with an Unauthorized error. The Admin UI interprets a 401/403 AppSync response and displays an "Insufficient permissions" message.

### Security Design

#### IAM Role per Lambda Function

Each function in `amplify/functions/` gets a distinct execution role with least-privilege grants:

| Function | DynamoDB Actions | Other AWS Actions |
|---|---|---|
| `whatsapp-webhook` | — | SecretsManager:GetSecretValue (WhatsApp token ARN) |
| `strands-agent` | — | Bedrock:InvokeModel, AppSync:GraphQL |
| `book-coach` | GetItem, PutItem, UpdateItem, Query | AppSync:GraphQL |
| `pay-package` | GetItem, PutItem, UpdateItem, Query | AppSync:GraphQL, SecretsManager:GetSecretValue |
| `postpone-session` | GetItem, UpdateItem, Query | AppSync:GraphQL |
| `query-membership` | GetItem, Query | AppSync:GraphQL |
| `broadcast-marketing` | — | Pinpoint:SendMessages, SecretsManager:GetSecretValue |

All DynamoDB grants are scoped to the `DancingClubData` table ARN and its GSI1 ARN only. No `*` resources.

#### Secrets Manager Integration Pattern

```typescript
// Pattern used in every Lambda that needs a secret
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

// ARN is injected as environment variable during deployment — never hardcoded
const SECRET_ARN = process.env.WHATSAPP_TOKEN_SECRET_ARN!;

export async function getWhatsAppToken(): Promise<string> {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_ARN })
  );
  if (!response.SecretString) {
    throw new Error('CONFIG_ERROR: WhatsApp token secret unavailable');
  }
  return response.SecretString;
}
```

Secrets are referenced in `amplify/functions/*/resource.ts` using:
```typescript
fn.addEnvironment('WHATSAPP_TOKEN_SECRET_ARN', secret.secretArn);
secret.grantRead(fn);
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

These properties apply specifically to the **field validation logic** implemented in AppSync Lambda resolvers and schema-level constraints. They are pure functions that transform inputs to accept/reject decisions — exactly where property-based testing adds value. Infrastructure, IaC configuration, and UI rendering are tested via snapshot/integration tests instead (see Testing Strategy).

---

### Property 1: Invalid Member status is always rejected

*For any* string value supplied as the `status` field on a `createMember` or `updateMember` mutation that is not one of `ACTIVE`, `INACTIVE`, or `SUSPENDED`, the system SHALL reject the mutation with an error response and SHALL NOT write any item to the `DancingClubData` table.

**Validates: Requirements 5.5**

---

### Property 2: Invalid Member tier is always rejected

*For any* string value supplied as the `tier` field on a `createMember` or `updateMember` mutation that is not one of `STANDARD`, `SILVER`, `GOLD`, or `PLATINUM`, the system SHALL reject the mutation with an error response and SHALL NOT write any item to the `DancingClubData` table.

**Validates: Requirements 5.6**

---

### Property 3: Schedule capacity outside valid bounds is always rejected

*For any* integer value supplied as the `capacity` field on a `createSchedule` or `updateSchedule` mutation that is less than 1 or greater than 500, the system SHALL reject the mutation with an error response and SHALL NOT write any item to the `DancingClubData` table. Conversely, *for any* integer in the closed interval [1, 500], the mutation SHALL be accepted (assuming all other fields are valid).

**Validates: Requirements 7.1**

---

### Property 4: Invalid Booking status is always rejected

*For any* string value supplied as the `status` field on a `createBooking` or `updateBooking` mutation that is not one of `CONFIRMED`, `CANCELLED`, or `PENDING`, the system SHALL reject the mutation with an error response and SHALL NOT persist the record.

**Validates: Requirements 8.5**

---

### Property 5: Booking referential integrity is always enforced

*For any* `createBooking` mutation where the supplied `memberId` does not correspond to an existing `MEMBER#<memberId>` item in the `DancingClubData` table, or where the supplied `scheduleId` does not correspond to an existing `SCHEDULE#<scheduleId>` item, the system SHALL reject the mutation with a referential integrity error and SHALL NOT persist the booking record.

**Validates: Requirements 8.6**

---

### Property 6: Package multi-constraint validation is always enforced

*For any* `createPackage` or `updatePackage` mutation, the system SHALL reject the operation (with an error identifying the specific violation) and SHALL NOT persist any data if ANY of the following conditions hold:

- `remainingCredits` is greater than `totalCredits`
- `validUntil` is strictly earlier than `validFrom`
- `price` is less than `0.01` or greater than `999999.99`
- `currency` is a string whose length is not exactly 3

**Validates: Requirements 9.4**

---

### Property 7: Package member referential integrity is always enforced

*For any* `createPackage` mutation where a `memberId` is supplied and that `memberId` does not correspond to an existing `MEMBER#<memberId>` item in the `DancingClubData` table, the system SHALL reject the operation with an error indicating the member does not exist and SHALL NOT persist the package record.

**Validates: Requirements 9.5**

---

### Property 8: Claim with non-positive creditsConsumed is always rejected

*For any* `createClaim` mutation where the `creditsConsumed` field is an integer less than or equal to zero, the system SHALL reject the mutation with an error response and SHALL NOT write any item to the `DancingClubData` table.

**Validates: Requirements 10.1**

---

## Error Handling

### AppSync Resolver Errors

All validation rejections return a structured GraphQL error response:

```json
{
  "errors": [
    {
      "message": "Validation failed: status must be one of ACTIVE, INACTIVE, SUSPENDED",
      "errorType": "ValidationError",
      "locations": [...],
      "path": ["createMember"]
    }
  ],
  "data": null
}
```

The error `message` identifies the specific field and constraint that failed (Properties 1–8). The `data` field is always `null` on validation failure — no partial data is returned.

### Lambda Initialization Errors

If a Lambda function cannot retrieve a required secret from Secrets Manager at initialization:

```typescript
// Pattern: fail fast with a structured error — no partial execution
export const handler = async (event: unknown) => {
  const token = await getWhatsAppToken().catch(() => {
    throw new Error('CONFIG_ERROR: Required secret unavailable. Aborting invocation.');
  });
  // ... rest of handler only runs if secrets are available
};
```

CloudWatch Logs capture the `CONFIG_ERROR` prefix. An SNS alarm on `ERROR` log patterns notifies the ops team.

### Authentication Errors

| Scenario | Response |
|---|---|
| Missing JWT | AppSync: 401 Unauthorized — no resolver executes |
| Expired JWT | AppSync: 401 Unauthorized — Authenticator component detects refresh failure and redirects within 5s |
| Valid JWT, not in Admins group | AppSync: 403 Forbidden — Admin UI displays "Insufficient permissions" message |
| Incorrect credentials at login | Cognito: INVALID_CREDENTIALS — Authenticator displays generic error (does not reveal whether username or password was wrong) |

### Tab Panel Error Boundary

```typescript
// TabPanel.tsx wraps children in a React Error Boundary
// On data-fetch error: renders <Alert variation="error"> inside the panel
// AppTabs tab bar is outside the boundary — it is never unmounted
```

### DynamoDB Empty Results

A GSI1 query returning zero items is not an error. All Lambda resolvers treat an empty DynamoDB result set as a valid empty-collection response and return `{ items: [] }` rather than propagating a fault.

### CI Enforcement

| Rule | Trigger | Action |
|---|---|---|
| Forbidden third-party import | Pre-commit / PR check | Fail build, report file + line number |
| Hardcoded AWS credential literal | PR scan (e.g., truffleHog or custom regex) | Fail build, block merge |
| TypeScript strict mode errors | `tsc --noEmit` in CI | Fail build |
| Disallowed UI library in package.json | Dependency audit script | Fail build, report package name |

---

## Testing Strategy

### Dual Approach

This spec covers infrastructure (IaC), UI configuration, and GraphQL schema validation. The testing strategy is split accordingly:

- **Unit + integration tests** for all IaC, UI rendering, and configuration concerns
- **Property-based tests** exclusively for the field validation logic identified in Properties 1–8 (pure resolver/validator functions)

### Property-Based Tests (Properties 1–8)

**Library:** [fast-check](https://github.com/dubzzz/fast-check) (TypeScript, well-maintained, strong arbitrary generators)

**Location:** `src/__tests__/validation.property.test.ts` (and `amplify/functions/__tests__/validation.property.test.ts` for resolver-level tests)

**Configuration:** Minimum 100 iterations per property (fast-check default is 100 runs with `fc.assert`).

**Tag format:** `// Feature: core-architecture-database, Property N: <property_text>`

**Example structure:**

```typescript
import fc from 'fast-check';
import { validateMemberStatus } from '../lib/validators';

// Feature: core-architecture-database, Property 1: invalid Member status is always rejected
test('Property 1: invalid Member status rejected for all non-enum strings', () => {
  const validStatuses = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
  fc.assert(
    fc.property(
      fc.string().filter(s => !validStatuses.has(s)),
      (invalidStatus) => {
        const result = validateMemberStatus(invalidStatus);
        return result.valid === false && result.error !== undefined;
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: core-architecture-database, Property 3: Schedule capacity bounds
test('Property 3: capacity outside [1,500] rejected', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 501 })),
      (invalidCapacity) => {
        const result = validateScheduleCapacity(invalidCapacity);
        return result.valid === false;
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: core-architecture-database, Property 6: Package multi-constraint
test('Property 6a: remainingCredits > totalCredits rejected', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0 }).chain(total =>
        fc.integer({ min: total + 1 }).map(remaining => ({ total, remaining }))
      ),
      ({ total, remaining }) => {
        const result = validatePackageCredits(remaining, total);
        return result.valid === false;
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit and Integration Tests

| Concern | Type | Description |
|---|---|---|
| AppTabs renders 8 tabs in order | Unit (Vitest + React Testing Library) | Assert 8 tab labels in exact order, no sidebar |
| Active tab is visually distinguished | Unit | Simulate click, assert active CSS token |
| Tab panel renders correct component | Unit | Simulate tab selection, assert child component renders |
| Tab panel error boundary | Unit | Mock fetch error, assert Alert in panel, tab bar still mounted |
| Responsive tab bar at 320px | Unit | Render at 320px width, assert scrollable container |
| `configureAmplify()` called before AppSync | Unit | Assert Amplify.configure called in main.tsx entry |
| Dependency audit rejects forbidden packages | Unit | Assert audit script returns error for `antd`, `zapier-client`, etc. |
| listTodaySchedules returns today's schedules | Integration (AppSync) | Seed schedules for today + another date; assert only today returned |
| listTodaySchedules returns empty for no schedules | Integration | Empty table; assert `[]` not error |
| onCreateBooking subscription fires | Integration (AppSync) | Create booking; assert subscription event received within 5s |
| Cognito Admins group grants AppSync access | Integration (Cognito + AppSync) | Auth as Admins user; assert query succeeds |
| Non-Admins user is denied | Integration | Auth as non-Admins user; assert 403 on every model |
| Lambda initialization fails without secret | Unit (Lambda handler) | Mock Secrets Manager to throw; assert handler returns CONFIG_ERROR |
| PK/SK format validation on DynamoDB write | Integration | Write item with malformed PK; assert write rejected |
| PITR is enabled on DancingClubData | Integration (CDK assertions) | Assert `pointInTimeRecovery: true` in synthesized CloudFormation |
| GSI1 projection is ALL | Integration (CDK assertions) | Assert GSI1 ProjectionType is ALL in synthesized template |
| No hardcoded credentials in source | CI (truffleHog / grep scan) | Scan `amplify/` and `src/` for AWS credential patterns |
| No third-party automation imports | CI (eslint / grep scan) | Scan for zapier, make.com, pipedream URL patterns |
| TypeScript strict compilation | CI (`tsc --noEmit`) | Zero errors across `src/` and `amplify/` |

### Snapshot Tests (IaC)

CDK assertions via `aws-cdk-lib/assertions` verify that the synthesized CloudFormation template matches expected resource shapes for:

- `DancingClubData` table: composite PK/SK, PAY_PER_REQUEST, PITR, GSI1 with ALL projection
- Cognito User Pool: password policy fields, `Admins` group
- Each Lambda function: distinct IAM execution role, no inline credentials

These run as part of `amplify/` unit tests via `vitest` or `jest` with the CDK assertions library.

### Test Execution

```bash
# Unit + property tests (frontend + resolver logic)
npx vitest --run

# Amplify backend unit + CDK snapshot tests
npx vitest --run --root amplify/

# Integration tests (requires deployed sandbox)
npx vitest --run --config vitest.integration.config.ts
```
