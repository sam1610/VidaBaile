# Implementation Plan: VidaBaile Core Architecture & Database Foundation

## Overview

This plan scaffolds the complete foundational layer for VidaBaile: Vite + React 18 + TypeScript frontend with Amplify UI tab navigation, Amplify Gen 2 code-first backend with AppSync GraphQL schema covering all six canonical entities, a Single-Table DynamoDB design via CDK escape hatch, shared validation library, Lambda function stubs with least-privilege IAM, property-based and unit tests, CDK snapshot tests, and CI enforcement scripts.

All tasks are incremental — each step compiles and integrates before the next begins. No orphaned code.

---

## Tasks

- [x] 1. Initialize Vite + React 18 + TypeScript project scaffold
  - [x] 1.1 Create Vite project with React 18 TypeScript template
    - Run `npm create vite@latest vidabaile -- --template react-ts` and verify scaffold output
    - Pin exact versions in `package.json`: `react`, `react-dom`, `@aws-amplify/ui-react`, `aws-amplify` (v6+), `vite`, `typescript`, `@vitejs/plugin-react` — no `^` or `~` range operators on any dependency
    - Add `fast-check`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` as exact-version devDependencies
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Configure TypeScript strict mode
    - Set `"strict": true` in `tsconfig.json` and `tsconfig.node.json`
    - Add `"noEmit": true`, `"skipLibCheck": false` to compiler options
    - Run `tsc --noEmit` and confirm zero errors on the empty scaffold
    - _Requirements: 1.3_

  - [x] 1.3 Create `src/` directory structure
    - Create empty index files under: `src/components/layout/`, `src/components/home/`, `src/components/activities/`, `src/components/facilities/`, `src/components/appointments/`, `src/components/pos-packages/`, `src/components/crm/`, `src/components/pr-marketing/`, `src/components/settings/`, `src/graphql/`, `src/hooks/`, `src/lib/`, `src/__tests__/`
    - Add `vitest.config.ts` with `globals: true`, `environment: 'jsdom'`, and test include patterns
    - _Requirements: 1.1_

- [x] 2. Amplify Gen 2 backend scaffold
  - [x] 2.1 Create `amplify/auth/resource.ts`
    - Call `defineAuth` with `loginWith: { email: true }`, `groups: ['Admins']`, and password policy: minLength 8, maxLength 128, requireUppercase, requireLowercase, requireNumbers, requireSpecialCharacters
    - Export `auth` constant
    - _Requirements: 3.3, 4.1, 4.2, 4.5_

  - [x] 2.2 Create `amplify/data/resource.ts` skeleton
    - Define `schema` using `a.schema({})` — empty models placeholder
    - Call `defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } })` with IAM mode also enabled
    - Export `data` constant and `Schema` type
    - _Requirements: 3.4_

  - [x] 2.3 Create `amplify/backend.ts`
    - Import and compose `auth` and `data` via `defineBackend({ auth, data })`
    - Export `backend` constant
    - Verify `tsc --noEmit` passes across `amplify/`
    - _Requirements: 3.1, 3.2_

- [x] 3. Lambda function stubs with IAM scoping
  - [x] 3.1 Create `amplify/functions/whatsapp-webhook/resource.ts`
    - Call `defineFunction` with Node.js 20.x runtime
    - Grant IAM action: `secretsmanager:GetSecretValue` scoped to `WHATSAPP_TOKEN_SECRET_ARN` only
    - Inject `WHATSAPP_TOKEN_SECRET_ARN` as environment variable referencing the secret ARN — no hardcoded values
    - Create `amplify/functions/whatsapp-webhook/handler.ts` stub that validates presence of `WHATSAPP_TOKEN_SECRET_ARN` at init and throws `CONFIG_ERROR` if absent
    - _Requirements: 3.8, 12.1, 12.3, 12.4_

  - [x] 3.2 Create `amplify/functions/strands-agent/resource.ts`
    - Call `defineFunction` with Node.js 20.x runtime
    - Grant IAM actions: `bedrock:InvokeModel`, `appsync:GraphQL` scoped to the AppSync API ARN
    - No DynamoDB access — agent calls AppSync, not DynamoDB directly
    - Create handler stub that throws `CONFIG_ERROR` if Bedrock model ID env var is absent
    - _Requirements: 3.8, 12.1_

  - [x] 3.3 Create `amplify/functions/book-coach/resource.ts`
    - Grant IAM DynamoDB actions: `GetItem`, `PutItem`, `UpdateItem`, `Query` scoped to `DancingClubData` table ARN and its GSI1 ARN — no wildcards
    - Grant `appsync:GraphQL` scoped to the AppSync API ARN
    - Create handler stub
    - _Requirements: 3.8, 12.1, 12.2_

  - [x] 3.4 Create `amplify/functions/pay-package/resource.ts`
    - Grant IAM DynamoDB actions: `GetItem`, `PutItem`, `UpdateItem`, `Query` scoped to `DancingClubData` table ARN and GSI1 ARN
    - Grant `appsync:GraphQL` and `secretsmanager:GetSecretValue` scoped to payment secret ARN
    - Inject payment secret ARN as environment variable
    - Create handler stub with `CONFIG_ERROR` guard
    - _Requirements: 3.8, 12.1, 12.3_

  - [x] 3.5 Create `amplify/functions/postpone-session/resource.ts`
    - Grant IAM DynamoDB actions: `GetItem`, `UpdateItem`, `Query` scoped to `DancingClubData` table ARN and GSI1 ARN
    - Grant `appsync:GraphQL` scoped to the AppSync API ARN
    - Create handler stub
    - _Requirements: 3.8, 12.1_

  - [x] 3.6 Create `amplify/functions/query-membership/resource.ts`
    - Grant IAM DynamoDB actions: `GetItem`, `Query` scoped to `DancingClubData` table ARN and GSI1 ARN
    - Grant `appsync:GraphQL` scoped to the AppSync API ARN
    - Create handler stub
    - _Requirements: 3.8, 12.1_

  - [x] 3.7 Create `amplify/functions/broadcast-marketing/resource.ts`
    - Grant IAM actions: `mobiletargeting:SendMessages` (Pinpoint) and `secretsmanager:GetSecretValue` scoped to Pinpoint credentials ARN
    - No DynamoDB access
    - Inject Pinpoint secret ARN as environment variable
    - Create handler stub with `CONFIG_ERROR` guard
    - _Requirements: 3.8, 12.1, 12.3_

- [x] 4. AppSync GraphQL schema — all six models
  - [x] 4.1 Implement `Member` model in `amplify/data/resource.ts`
    - Add `Member` model with fields per Requirement 5.1: `memberId` (id, required), `clubId` (string, required), `name` (string, required), `phone` (string, required), `email` (string, optional), `tier` (`a.enum(['STANDARD','SILVER','GOLD','PLATINUM'])`), `status` (`a.enum(['ACTIVE','INACTIVE','SUSPENDED'])`, required)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(queryMembershipFn).to(['query'])`, `allow.resource(bookCoachFn).to(['query'])`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 Implement `Coach` model in `amplify/data/resource.ts`
    - Add `Coach` model with fields per Requirement 6.1: `coachId` (id, required), `name` (string, required), `specialty` (string, required), `bio` (string), `phone` (string), `email` (string), `status` (`a.enum(['ACTIVE','INACTIVE','SUSPENDED'])`, required)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(bookCoachFn).to(['query'])`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.3 Implement `Schedule` model in `amplify/data/resource.ts`
    - Add `Schedule` model with fields per Requirement 7.1: `scheduleId` (id, required), `date` (AWSDate, required), `startTime` (AWSTime, required), `endTime` (AWSTime, required), `coachId` (id, required), `facilityId` (string, optional), `activityType` (string, required), `capacity` (integer, required), `status` (`a.enum(['SCHEDULED','CANCELLED','COMPLETED'])`, required)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(bookCoachFn).to(['query'])`
    - Define `onCreateOrUpdateSchedule` subscription
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

  - [x] 4.4 Implement `Booking` model in `amplify/data/resource.ts`
    - Add `Booking` model with fields per Requirement 8.1: `bookingId` (id, required), `memberId` (id, required), `scheduleId` (id, required), `status` (`a.enum(['CONFIRMED','CANCELLED','PENDING'])`, required), `bookedAt` (AWSDateTime, required), `notes` (string, optional)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(bookCoachFn).to(['query','mutate'])`, `allow.resource(postponeSessionFn).to(['query','mutate'])`
    - Define `onCreateBooking` subscription
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.5 Implement `Package` model in `amplify/data/resource.ts`
    - Add `Package` model with fields per Requirement 9.1: `packageId` (id, required), `memberId` (id, optional), `packageType` (string, required), `totalCredits` (integer, required), `remainingCredits` (integer, required), `price` (float, required), `currency` (string, required), `validFrom` (AWSDate, required), `validUntil` (AWSDate, required), `status` (`a.enum(['ACTIVE','EXPIRED','SUSPENDED','EXHAUSTED'])`, required)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(payPackageFn).to(['query','mutate'])`, `allow.resource(queryMembershipFn).to(['query'])`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.6 Implement `Claim` model in `amplify/data/resource.ts`
    - Add `Claim` model with fields per Requirement 10.1: `claimId` (id, required), `bookingId` (id, required), `packageId` (id, required), `memberId` (id, required), `creditsConsumed` (integer, required), `claimedAt` (AWSDateTime, required)
    - Authorization: `allow.groups(['Admins'])`, `allow.resource(payPackageFn).to(['query','mutate'])`, `allow.resource(queryMembershipFn).to(['query'])`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 5. Checkpoint — Schema compilation
  - Ensure `tsc --noEmit` passes across `amplify/` with all six models and Lambda resource definitions wired in
  - Ask the user if questions arise.

- [x] 6. DynamoDB Single-Table Design override
  - [x] 6.1 Apply CDK escape hatch in `amplify/backend.ts` to rename all model tables
    - After `defineBackend(...)`, use `backend.data.resources.cfnResources.cfnTables` to access each model's underlying `CfnTable`
    - Override `tableName` to `DancingClubData` for all six model tables (Member, Coach, Schedule, Booking, Package, Claim) — this consolidates them into one logical STD table in DynamoDB
    - Each model's underlying table retains its own CloudFormation resource but is named `DancingClubData`; note this pattern means Amplify creates separate physical tables per model — document that a CDK custom resource approach or a single custom table defined in `amplify/custom/` is the correct path to a true single physical table
    - _Requirements: 11.1_

  - [x] 6.2 Configure composite PK/SK and billing on DancingClubData
    - For each `CfnTable` resource accessed via escape hatch, verify key schema has `PK` (HASH) and `SK` (RANGE) as String attributes
    - Set `billingMode: 'PAY_PER_REQUEST'` on each table — no provisioned throughput values
    - Enable point-in-time recovery: set `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }`
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

  - [x] 6.3 Add GSI1 to DancingClubData via CDK escape hatch
    - Add a GlobalSecondaryIndex named `GSI1` with `GSI1PK` (String, HASH) and `GSI1SK` (String, RANGE) key schema
    - Set `projection: { projectionType: 'ALL' }` on GSI1
    - Apply this GSI definition to the shared DancingClubData table resource
    - _Requirements: 11.2, 11.3_

- [x] 7. Shared validation library
  - [x] 7.1 Create `src/lib/validators.ts` with all eight validator functions
    - `validateMemberStatus(value: string): ValidationResult` — accepts `ACTIVE | INACTIVE | SUSPENDED` only
    - `validateMemberTier(value: string): ValidationResult` — accepts `STANDARD | SILVER | GOLD | PLATINUM` only
    - `validateScheduleCapacity(value: number): ValidationResult` — accepts integers in closed interval [1, 500]
    - `validateBookingStatus(value: string): ValidationResult` — accepts `CONFIRMED | CANCELLED | PENDING` only
    - `validatePackageConstraints(params: PackageConstraintParams): ValidationResult` — rejects if `remainingCredits > totalCredits`, `validUntil < validFrom`, `price < 0.01 || price > 999999.99`, or `currency.length !== 3`; `ValidationResult` carries `{ valid: boolean; error?: string }` with specific violation message
    - `validatePackageMemberRef(memberId: string | undefined, existingMemberIds: Set<string>): ValidationResult` — rejects if `memberId` is provided but not found in the set
    - `validateClaimCredits(creditsConsumed: number): ValidationResult` — rejects if value <= 0
    - Export `ValidationResult` interface and all validator functions
    - _Requirements: 5.5, 5.6, 7.1, 8.5, 8.6, 9.4, 9.5, 10.1_

- [x] 8. Amplify configuration and entry point
  - [x] 8.1 Create `src/lib/amplify-config.ts`
    - Import `Amplify` from `aws-amplify` and `outputs` from `../../amplify_outputs.json`
    - Export `configureAmplify(): void` that calls `Amplify.configure(outputs)` exactly once
    - _Requirements: 1.4_

  - [x] 8.2 Create `src/main.tsx` entry point
    - Import and call `configureAmplify()` as the very first statement before any React render or AppSync operation
    - Mount `<App />` into `#root` via `ReactDOM.createRoot`
    - _Requirements: 1.4, 1.7_

- [x] 9. Per-tab placeholder components
  - [x] 9.1 Create skeleton tab components for all 8 tabs
    - Create `src/components/home/HomeTab.tsx` — renders a `<View>` with heading "Home"
    - Create `src/components/activities/ActivitiesTab.tsx` — renders heading "Activities"
    - Create `src/components/facilities/FacilitiesTab.tsx` — renders heading "Facilities"
    - Create `src/components/appointments/AppointmentsTab.tsx` — renders heading "Appointments"
    - Create `src/components/pos-packages/POSPackagesTab.tsx` — renders heading "POS & Packages"
    - Create `src/components/crm/CRMTab.tsx` — renders heading "CRM"
    - Create `src/components/pr-marketing/PRMarketingTab.tsx` — renders heading "PR/Marketing"
    - Create `src/components/settings/SettingsTab.tsx` — renders heading "Settings"
    - All components use Amplify UI `<View>`, `<Heading>` — no Tailwind classes, no sidebar elements
    - _Requirements: 2.1, 2.7_

- [x] 10. Admin UI layout — TabPanel and AppTabs
  - [x] 10.1 Create `src/components/layout/TabPanel.tsx`
    - Accept props `{ children: React.ReactNode; index: number; activeIndex: number }`
    - Render children only when `index === activeIndex`
    - Wrap children in a React Error Boundary class component; on caught error render `<Alert variation="error">` inside the panel — the tab bar is NOT inside this boundary and must never unmount
    - _Requirements: 2.3, 2.5, 2.9_

  - [x] 10.2 Create `src/components/layout/AppTabs.tsx`
    - Define `TAB_CONFIG` array with exactly 8 entries in order: `Home`, `Activities`, `Facilities`, `Appointments`, `POS & Packages`, `CRM`, `PR/Marketing`, `Settings`
    - Use Amplify UI `<Tabs>` component to render the tab bar; no sidebar, drawer, or left-hand nav element at any breakpoint
    - Track `activeIndex` in `useState`; pass it to each `<TabPanel>`
    - Apply horizontal-scrollable container (`overflowX: 'auto'`) on the tab bar wrapper when viewport width < 768px using CSS module or inline style with Amplify UI tokens
    - Visually distinguish the active tab using Amplify UI token: `backgroundColor`, `color`, or `borderBottomColor` change — no Tailwind classes
    - Map `TAB_CONFIG` to corresponding tab panel content components imported from step 9.1
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 11. Authentication gate and session handling
  - [x] 11.1 Create `src/App.tsx` with Authenticator wrapper
    - Wrap `<AppTabs />` inside `<Authenticator>` from `@aws-amplify/ui-react`; nothing inside renders before authentication is confirmed
    - Subscribe to Amplify Hub `auth` channel for `tokenRefresh_failure` event; on detection clear protected state and call `navigate('/login')` within 5 seconds using `setTimeout`
    - Intercept AppSync 401/403 responses in a global error handler: display an `<Alert variation="error">` with "Insufficient permissions" message for non-Admins rejections
    - _Requirements: 4.3, 4.4, 4.6, 4.7_

- [x] 12. Custom hooks
  - [x] 12.1 Create `src/hooks/useAppSync.ts`
    - Call `generateClient<Schema>()` from `aws-amplify/data` and memoize the client instance
    - Return `{ client, loading, error }` with typed model query/mutation helpers re-exported
    - _Requirements: 1.4_

  - [x] 12.2 Create `src/hooks/useAgent.ts` placeholder
    - Export `useAgent()` hook returning `{ status: 'idle' }` as a typed placeholder
    - Add a `// TODO: subscribe to agent status events via AppSync subscription` comment
    - _Requirements: 3.4_

- [x] 13. Checkpoint — Frontend compilation and build
  - Run `tsc --noEmit` across `src/` and confirm zero errors
  - Run `npm run build` and confirm exit code 0, zero TypeScript and Vite errors
  - Ask the user if questions arise.

- [x] 14. Property-based tests (Properties 1–8)
  - [x] 14.1 Write property test P1 — invalid Member status always rejected
    - In `src/__tests__/validation.property.test.ts`, use `fc.string().filter(s => !['ACTIVE','INACTIVE','SUSPENDED'].has(s))` as arbitrary
    - Assert `validateMemberStatus(invalid).valid === false` and `error` is defined for all generated values
    - Tag: `// Feature: core-architecture-database, Property 1: invalid Member status is always rejected`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 5.5_

  - [x] 14.2 Write property test P2 — invalid Member tier always rejected
    - Use `fc.string().filter(s => !['STANDARD','SILVER','GOLD','PLATINUM'].has(s))` as arbitrary
    - Assert `validateMemberTier(invalid).valid === false`
    - Tag: `// Feature: core-architecture-database, Property 2: invalid Member tier is always rejected`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 5.6_

  - [x] 14.3 Write property test P3 — Schedule capacity outside [1,500] always rejected; within [1,500] always accepted
    - Use `fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 501 }))` for invalid range
    - Assert `validateScheduleCapacity(invalid).valid === false`
    - Use `fc.integer({ min: 1, max: 500 })` for valid range; assert `.valid === true`
    - Tag: `// Feature: core-architecture-database, Property 3: Schedule capacity outside valid bounds is always rejected`
    - Configure `{ numRuns: 100 }` for each assertion
    - _Requirements: 7.1_

  - [x] 14.4 Write property test P4 — invalid Booking status always rejected
    - Use `fc.string().filter(s => !['CONFIRMED','CANCELLED','PENDING'].has(s))` as arbitrary
    - Assert `validateBookingStatus(invalid).valid === false`
    - Tag: `// Feature: core-architecture-database, Property 4: invalid Booking status is always rejected`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 8.5_

  - [x] 14.5 Write property test P5 — Booking referential integrity always enforced
    - Generate arbitrary `memberId` and `scheduleId` strings and an arbitrary `Set<string>` of existing IDs that does NOT contain those values
    - Call `validatePackageMemberRef` (or a dedicated `validateBookingRefs` function if preferred) and assert rejection
    - Tag: `// Feature: core-architecture-database, Property 5: Booking referential integrity is always enforced`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 8.6_

  - [x] 14.6 Write property test P6 — Package multi-constraint validation always enforced
    - Sub-case a: `fc.integer().chain(total => fc.integer({ min: total + 1 }).map(remaining => ({ total, remaining })))` — assert rejection
    - Sub-case b: generate date pair where `validUntil` < `validFrom` using `fc.date()` chain — assert rejection
    - Sub-case c: `fc.oneof(fc.float({ max: 0.009 }), fc.float({ min: 1000000 }))` for invalid price — assert rejection
    - Sub-case d: `fc.string().filter(s => s.length !== 3)` for invalid currency — assert rejection
    - Tag: `// Feature: core-architecture-database, Property 6: Package multi-constraint validation is always enforced`
    - Configure `{ numRuns: 100 }` per sub-case
    - _Requirements: 9.4_

  - [x] 14.7 Write property test P7 — Package member referential integrity always enforced
    - Generate arbitrary `memberId` and a `Set<string>` that does not contain it
    - Assert `validatePackageMemberRef(memberId, existingSet).valid === false`
    - Tag: `// Feature: core-architecture-database, Property 7: Package member referential integrity is always enforced`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 9.5_

  - [x] 14.8 Write property test P8 — Claim with non-positive creditsConsumed always rejected
    - Use `fc.integer({ max: 0 })` as arbitrary (includes zero and negatives)
    - Assert `validateClaimCredits(invalid).valid === false`
    - Tag: `// Feature: core-architecture-database, Property 8: Claim with non-positive creditsConsumed is always rejected`
    - Configure `{ numRuns: 100 }`
    - _Requirements: 10.1_

- [x] 15. Unit tests — frontend components
  - [x] 15.1 Write unit tests for AppTabs
    - Test: renders exactly 8 tab labels in the correct order (`Home`, `Activities`, `Facilities`, `Appointments`, `POS & Packages`, `CRM`, `PR/Marketing`, `Settings`)
    - Test: no element with role `navigation` using `aria-label` pattern associated with sidebar; assert zero elements matching sidebar selectors
    - Test: simulating click on a non-default tab updates active state — active tab has a visually distinct attribute (e.g., `aria-selected="true"`, or Amplify token class)
    - Test: at viewport 320px the tab container has `overflow-x: auto` or equivalent scrollable style
    - _Requirements: 2.1, 2.2, 2.6, 2.8_

  - [x] 15.2 Write unit tests for TabPanel
    - Test: children render when `index === activeIndex`, hidden when not equal
    - Test: when a child throws a render error, `<Alert variation="error">` appears inside the panel and the tab bar (rendered outside) remains mounted
    - _Requirements: 2.5, 2.9_

  - [x] 15.3 Write unit test for `amplify-config.ts` initialization order
    - Mock `Amplify.configure` and assert it is called with the outputs object before any AppSync client is instantiated in `main.tsx`
    - _Requirements: 1.4, 1.7_

  - [x] 15.4 Write dependency audit script and unit test
    - Create `scripts/audit-deps.ts` that reads `package.json` and fails with an error if any disallowed UI library is present (`antd`, `@mui/material`, `chakra-ui`, `tailwindcss`, etc.)
    - Write a test in `src/__tests__/audit.test.ts` that asserts the script returns an error when a mock `package.json` contains a forbidden package
    - _Requirements: 1.5_

- [x] 16. CDK snapshot and integration tests for infrastructure
  - [x] 16.1 Write CDK assertion tests for DancingClubData table
    - In `amplify/__tests__/infrastructure.test.ts`, synthesize the Amplify backend stack and use `aws-cdk-lib/assertions` `Template` to assert:
      - At least one `AWS::DynamoDB::Table` resource with `BillingMode: PAY_PER_REQUEST`
      - PITR specification: `PointInTimeRecoveryEnabled: true`
      - GSI named `GSI1` with `ProjectionType: ALL`, `GSI1PK` as HASH key, `GSI1SK` as RANGE key
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

  - [x] 16.2 Write CDK assertion tests for Cognito User Pool
    - Assert `AWS::Cognito::UserPool` resource has password policy: MinLength 8, RequireUppercase true, RequireLowercase true, RequireNumbers true, RequireSymbols true
    - Assert `AWS::Cognito::UserPoolGroup` resource named `Admins` exists
    - _Requirements: 3.3, 4.2, 4.5_

  - [x] 16.3 Write CDK assertion tests for Lambda IAM roles
    - For each of the 7 Lambda functions, assert a distinct `AWS::IAM::Role` resource is synthesized (7 separate roles — no shared role)
    - Assert no role has `"Resource": "*"` on DynamoDB actions — all DynamoDB grants must be scoped to the specific table ARN
    - Assert no `AWS::IAM::Policy` or `AWS::IAM::Role` inline document contains a literal AWS access key pattern (`AKIA[A-Z0-9]{16}`)
    - _Requirements: 3.8, 12.1, 12.2_

- [x] 17. CI enforcement scripts
  - [x] 17.1 Create `scripts/scan-credentials.sh`
    - Use `grep -rn` with patterns for AWS access key IDs (`AKIA[A-Z0-9]{16}`) and secret access key patterns across `amplify/` and `src/`
    - Exit with code 1 and print violating file path and line number if any match is found
    - Designed to run as a CI step; exit 0 on clean scan
    - _Requirements: 12.2, 12.7_

  - [x] 17.2 Create `scripts/scan-forbidden-imports.sh`
    - Use `grep -rn` with patterns for forbidden third-party automation URLs and imports: `zapier.com`, `make.com`, `hooks.zapier`, `n8n.io`, `pipedream.com`
    - Exit with code 1 and print violating file path and line number if any match is found
    - _Requirements: 13.1, 13.3_

  - [x] 17.3 Create `scripts/check-ts-strict.sh`
    - Run `tsc --noEmit --project tsconfig.json` and `tsc --noEmit --project amplify/tsconfig.json`
    - Exit with code 1 if either run produces errors; surface the error output
    - _Requirements: 1.3, 3.1_

- [x] 18. Final checkpoint — All tests green
  - Run `npx vitest --run` across the full project and confirm all property, unit, and CDK assertion tests pass
  - Run `npm run build` and confirm exit code 0
  - Run `scripts/scan-credentials.sh` and `scripts/scan-forbidden-imports.sh` and confirm both exit 0
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- No tasks are marked optional in this foundational spec — all tasks are required to meet the security, auth, and validation requirements
- The CDK escape hatch approach in task 6 achieves the STD key configuration; a true single physical table requires defining the table in `amplify/custom/` (noted inline in task 6.1 for future refactoring)
- Property tests (tasks 14.x) validate the pure validator functions in `src/lib/validators.ts` — the same functions called by AppSync Lambda resolvers
- CDK snapshot tests (tasks 16.x) provide infrastructure correctness guarantees without a deployed environment
- CI scripts (tasks 17.x) are designed to run on every commit as lightweight guards

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "9.1"] },
    { "id": 3, "tasks": ["2.3", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 5, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "8.2", "10.1"] },
    { "id": 7, "tasks": ["10.2", "12.1", "12.2"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8"] },
    { "id": 10, "tasks": ["15.1", "15.2", "15.3", "15.4", "16.1", "16.2", "16.3"] },
    { "id": 11, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
