# Requirements Document

## Introduction

This spec covers the core architecture and database foundation for VidaBaile — an AI-driven dance club management platform. The foundation includes: initializing the React 18 + Vite + TypeScript frontend, configuring AWS Amplify Gen 2 code-first backend, defining the AppSync GraphQL schema, and implementing a Single-Table DynamoDB design (`DancingClubData`) with all six canonical entities. All infrastructure is native AWS; no third-party automation platforms are permitted.

## Glossary

- **VidaBaile**: The AI-driven dance club management platform being built.
- **Admin_UI**: The responsive React web application used by staff and administrators.
- **Amplify_Gen2**: The AWS Amplify Generation 2 framework used for code-first, TypeScript-based infrastructure definition under the `amplify/` directory.
- **AppSync**: AWS AppSync, the managed GraphQL service used as the exclusive internal API layer.
- **DancingClubData**: The single DynamoDB table using Single-Table Design (STD) that holds all VidaBaile entities.
- **STD**: Single-Table Design — a DynamoDB modeling pattern where all entity types share one table with overloaded PK/SK keys.
- **PK**: Partition Key — the primary lookup key in DynamoDB.
- **SK**: Sort Key — secondary key used with PK for composite key lookups.
- **GSI1**: Global Secondary Index 1, defined with `GSI1PK` and `GSI1SK` attributes to support cross-entity access patterns.
- **Member**: A registered dance club customer who interacts exclusively via WhatsApp.
- **Coach**: A staff member who delivers classes or private sessions.
- **Schedule**: A class or session event with time, facility, and coach assignments.
- **Booking**: A reservation linking a Member to a Schedule slot.
- **Package**: A membership or session bundle purchased by a Member.
- **Claim**: A record of a Package credit being consumed against a Booking.
- **Cognito_User_Pool**: The AWS Cognito User Pool providing authentication for Admin staff only.
- **IAM**: AWS Identity and Access Management, used to enforce least-privilege access.
- **Secrets_Manager**: AWS Secrets Manager, used to store sensitive credentials (e.g., WhatsApp tokens).

---

## Requirements

### Requirement 1: Frontend Project Initialization

**User Story:** As a developer, I want a React 18 TypeScript project initialized with Vite and Amplify UI components, so that the Admin UI has a consistent, type-safe foundation ready for feature development.

#### Acceptance Criteria

1. THE Frontend_Project SHALL use React 18 or later, TypeScript in strict mode, and Vite as the bundler.
2. THE Frontend_Project SHALL include `@aws-amplify/ui-react` and `aws-amplify` v6 or later as dependencies with exact pinned versions (no range operators such as `^` or `~`).
3. THE Frontend_Project SHALL configure TypeScript with `"strict": true` in `tsconfig.json`, with zero errors reported by `tsc --noEmit`.
4. THE Frontend_Project SHALL include a `src/lib/amplify-config.ts` file that calls the Amplify Gen 2 client configuration using the generated backend outputs file; this file MUST be imported and executed once before any AppSync operation is performed.
5. IF a dependency other than `@aws-amplify/ui-react` providing UI components is added to `package.json`, THEN THE Frontend_Project SHALL fail the dependency-audit step and report an error identifying the disallowed package name.
6. WHEN `npm run build` is executed, THE Frontend_Project SHALL complete with exit code 0, zero TypeScript compilation errors, and zero Vite build errors.
7. WHEN the Vite development build is served and the application root route is loaded in a browser, THE Frontend_Project SHALL render without any console errors related to missing Amplify configuration or unresolved module imports.

---

### Requirement 2: Admin UI Tab-Based Navigation

**User Story:** As an admin user, I want a tab-based top-level navigation, so that I can move between functional areas of the platform without a sidebar obscuring content.

#### Acceptance Criteria

1. THE Admin_UI SHALL render a top-level tab bar with exactly these tabs in order: `Home`, `Activities`, `Facilities`, `Appointments`, `POS & Packages`, `CRM`, `PR/Marketing`, `Settings`.
2. THE Admin_UI SHALL NOT render any sidebar, drawer, or left-hand navigation element as primary navigation.
3. THE Admin_UI SHALL implement tab navigation using `src/components/layout/AppTabs.tsx` and `src/components/layout/TabPanel.tsx`.
4. THE Admin_UI SHALL be fully responsive across mobile (≥ 320px), tablet (≥ 768px), and desktop (≥ 1280px) breakpoints.
5. WHEN a tab is selected, THE Admin_UI SHALL render the corresponding tab panel content without a full page reload.
6. WHEN a tab is selected, THE Admin_UI SHALL visually distinguish the active tab from inactive tabs using a distinct Amplify UI token-based style (e.g., border, background, or color change) such that the active tab is unambiguously identifiable without subjective judgment.
7. THE Admin_UI SHALL use Amplify UI tokens for all spacing, color, and typography — no Tailwind CSS classes.
8. WHEN the viewport width is less than 768px, THE Admin_UI SHALL render the tab bar in a horizontally scrollable or collapsed format such that all 8 tabs remain accessible without requiring a page reload or navigation to a separate menu.
9. IF a tab's content panel fails to load (e.g., due to a data-fetching error), THEN THE Admin_UI SHALL display an error message within the tab panel area indicating that content could not be loaded, without unmounting the tab bar or navigating away from the current tab.

---

### Requirement 3: Amplify Gen 2 Backend Configuration

**User Story:** As a developer, I want an Amplify Gen 2 code-first backend configured in TypeScript, so that all infrastructure is version-controlled, reproducible, and deployable via `ampx sandbox` or CI/CD.

#### Acceptance Criteria

1. THE Amplify_Gen2 backend SHALL be defined entirely under the `amplify/` directory using TypeScript with strict mode enabled.
2. THE Amplify_Gen2 backend SHALL include an `amplify/backend.ts` root file that composes all backend resources, referencing at minimum the auth and data resource modules.
3. THE Amplify_Gen2 backend SHALL define authentication in `amplify/auth/resource.ts` using Cognito User Pools, configured to allow sign-in exclusively for users belonging to the `Admins` group, with no unauthenticated or public access permitted.
4. THE Amplify_Gen2 backend SHALL define the data layer in `amplify/data/resource.ts` using `a.schema()` and `a.model()` constructs, with every model specifying at least one authorization rule using `allow.groups(["Admins"])` or `allow.custom()`.
5. IF any infrastructure definition uses raw CDK constructs outside the `amplify/custom/` directory, THEN THE Amplify_Gen2 backend SHALL be considered non-compliant and must be corrected before deployment.
6. THE Amplify_Gen2 backend SHALL NOT use Amplify Gen 1 patterns, including `amplify push`, `aws-exports.js`, or `API.graphql` imported from `aws-amplify/api`.
7. WHEN the backend is deployed via `ampx sandbox` or a CI/CD pipeline, THE Amplify_Gen2 backend SHALL complete deployment without errors, producing a valid `amplify_outputs.json` file consumed by the frontend.
8. IF a Lambda function is defined under `amplify/functions/`, THEN THE Amplify_Gen2 backend SHALL configure that function with an explicitly scoped IAM role granting least-privilege access, with no hardcoded credentials present in any function source file.

---

### Requirement 4: Cognito Authentication — Admin Only

**User Story:** As an admin staff member, I want secure login via Cognito, so that only authorized staff can access the Admin UI and all AppSync operations are authenticated.

#### Acceptance Criteria

1. THE Cognito_User_Pool SHALL authenticate Admin staff exclusively — public/unauthenticated access SHALL NOT be permitted on any AppSync model.
2. THE Cognito_User_Pool SHALL define a Cognito User Group named `Admins` used for AppSync authorization rules, where every AppSync model authorization rule references the `Admins` group using `allow.groups(["Admins"])`.
3. THE Admin_UI SHALL use the `Authenticator` component from `@aws-amplify/ui-react` as the authentication gate, wrapping the entire application such that no protected route or component renders before authentication is confirmed.
4. WHEN an authenticated session expires, THE Admin_UI SHALL redirect the user to the login screen within 5 seconds of the expiry being detected, without rendering any protected data after expiry.
5. THE Cognito_User_Pool SHALL enforce password complexity: minimum 8 characters, maximum 128 characters, at least one uppercase letter, one lowercase letter, one numeric digit, and one special character from the set `! @ # $ % ^ & * ( ) _ + - = [ ] { } | '`.
6. IF a login attempt fails due to incorrect credentials, THEN THE Admin_UI SHALL display an error message indicating invalid credentials and allow the user to retry, without revealing whether the username or password was incorrect.
7. IF a user account is not a member of the `Admins` Cognito User Group, THEN THE Admin_UI SHALL deny access and display an error message indicating insufficient permissions, regardless of whether the Cognito credentials are otherwise valid.

---

### Requirement 5: AppSync GraphQL Schema — Member Entity

**User Story:** As a developer, I want the Member entity defined in the AppSync schema with correct STD key patterns, so that member data can be stored, queried, and listed by club.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Member` model with fields: `memberId` (ID, required), `clubId` (String, required), `name` (String, required, maximum 100 characters), `phone` (String, required, matching E.164 format), `email` (String, optional, maximum 254 characters), `tier` (String, optional, one of: `STANDARD`, `SILVER`, `GOLD`, `PLATINUM`), `status` (String, required, one of: `ACTIVE`, `INACTIVE`, `SUSPENDED`), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Member` model to DynamoDB key pattern: `PK = MEMBER#<memberId>`, `SK = PROFILE`, `GSI1PK = CLUB#<clubId>`, `GSI1SK = MEMBER#<memberId>`.
3. THE AppSync schema SHALL define authorization for `Member` as `allow.groups(["Admins"])` for Admin users and `allow.custom()` via IAM for the agent Lambda, with no other authorization modes permitted.
4. WHEN a `Member` item is created, THE DancingClubData table SHALL store `PK`, `SK`, `GSI1PK`, and `GSI1SK` attributes alongside all model fields.
5. IF a `Member` creation or update request contains a `status` value outside of `ACTIVE`, `INACTIVE`, or `SUSPENDED`, THEN THE AppSync schema SHALL reject the request with an error indicating an invalid field value, and no item SHALL be written to the DancingClubData table.
6. IF a `Member` creation or update request contains a `tier` value outside of `STANDARD`, `SILVER`, `GOLD`, or `PLATINUM`, THEN THE AppSync schema SHALL reject the request with an error indicating an invalid field value, and no item SHALL be written to the DancingClubData table.

---

### Requirement 6: AppSync GraphQL Schema — Coach Entity

**User Story:** As a developer, I want the Coach entity defined in the AppSync schema with correct STD key patterns, so that coaches can be stored and looked up by specialty.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Coach` model with fields: `coachId` (ID, required), `name` (String, required), `specialty` (String, required), `bio` (String), `phone` (String), `email` (String), `status` (String, required, one of: `ACTIVE`, `INACTIVE`, `SUSPENDED`), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Coach` model to DynamoDB key pattern: `PK = COACH#<coachId>`, `SK = PROFILE`, `GSI1PK = SPECIALTY#<specialty>`, `GSI1SK = COACH#<coachId>`.
3. THE AppSync schema SHALL define authorization for `Coach` such that `allow.groups(["Admins"])` grants Admin users full read and write access, and `allow.custom()` via IAM grants the agent Lambda read-only access. Unauthenticated access SHALL NOT be permitted on any operation.

---

### Requirement 7: AppSync GraphQL Schema — Schedule Entity

**User Story:** As a developer, I want the Schedule entity defined in the AppSync schema with correct STD key patterns, so that class schedules can be queried by date for the Home dashboard and booking flows.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Schedule` model with fields: `scheduleId` (ID, required), `date` (AWSDate, required), `startTime` (AWSTime, required), `endTime` (AWSTime, required), `coachId` (ID, required), `facilityId` (String, optional), `activityType` (String, required, maximum 100 characters), `capacity` (Int, required, minimum value 1, maximum value 500), `status` (String, required, one of: `SCHEDULED`, `CANCELLED`, `COMPLETED`), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Schedule` model to DynamoDB key pattern: `PK = SCHEDULE#<scheduleId>`, `SK = DETAIL`, `GSI1PK = DATE#<YYYY-MM-DD>`, `GSI1SK = SCHEDULE#<scheduleId>`, where `<YYYY-MM-DD>` is derived from the `date` field value.
3. THE AppSync schema SHALL define authorization for `Schedule` such that `allow.groups(["Admins"])` grants full read and write access to Admin users authenticated via Cognito, and `allow.custom()` via IAM grants read-only access to the agent Lambda function.
4. WHEN the `listTodaySchedules` query is invoked, THE AppSync schema SHALL return all `Schedule` records where `GSI1PK` equals `DATE#<today>`, with `<today>` resolved to the UTC calendar date at query execution time, returning an empty list when no schedules exist for that date.
5. IF the `listTodaySchedules` query fails due to a DynamoDB or resolver error, THEN THE AppSync schema SHALL return a GraphQL error response indicating the query failed, without returning partial schedule data.
6. WHEN a `Schedule` record is created or updated, THE AppSync schema SHALL publish a real-time subscription event to connected Admin UI clients.

---

### Requirement 8: AppSync GraphQL Schema — Booking Entity

**User Story:** As a developer, I want the Booking entity defined in the AppSync schema with correct STD key patterns, so that bookings can be created, queried by member, and managed via the Appointments tab.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Booking` model with fields: `bookingId` (ID, required), `memberId` (ID, required), `scheduleId` (ID, required), `status` (String, required, maximum 50 characters, one of: `CONFIRMED`, `CANCELLED`, `PENDING`), `bookedAt` (AWSDateTime, required), `notes` (String, maximum 1000 characters), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Booking` model to DynamoDB key pattern: `PK = BOOKING#<bookingId>`, `SK = DETAIL`, `GSI1PK = MEMBER#<memberId>`, `GSI1SK = BOOKING#<bookingId>`.
3. THE AppSync schema SHALL define authorization for `Booking` as `allow.groups(["Admins"])` for Admin users and `allow.custom()` via IAM for the agent Lambda, and SHALL NOT permit unauthenticated access.
4. WHEN a new `Booking` record is created, THE AppSync schema SHALL define a real-time subscription `onCreateBooking` that delivers the created `Booking` payload to all connected Admin UI subscribers within 5 seconds.
5. IF the `status` field value is not one of `CONFIRMED`, `CANCELLED`, or `PENDING`, THEN THE AppSync schema SHALL reject the mutation with an error indicating an invalid status value and SHALL NOT persist the record.
6. IF a `createBooking` mutation references a `memberId` or `scheduleId` that does not correspond to an existing `Member` or `Schedule` record, THEN THE AppSync schema SHALL reject the mutation with an error indicating a referential integrity violation and SHALL NOT persist the record.

---

### Requirement 9: AppSync GraphQL Schema — Package Entity

**User Story:** As a developer, I want the Package entity defined in the AppSync schema with correct STD key patterns, so that membership packages can be sold, assigned to members, and queried by type from the POS & Packages tab.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Package` model with fields: `packageId` (ID, required), `memberId` (ID, optional), `packageType` (String, required), `totalCredits` (Int, required, minimum value 1), `remainingCredits` (Int, required, minimum value 0, maximum value equal to `totalCredits`), `price` (Float, required, range 0.01 to 999999.99), `currency` (String, required, exactly 3 characters, ISO 4217 format), `validFrom` (AWSDate, required), `validUntil` (AWSDate, required, must be greater than or equal to `validFrom`), `status` (String, required, one of: `ACTIVE`, `EXPIRED`, `SUSPENDED`, `EXHAUSTED`), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Package` model to DynamoDB key pattern: `PK = PACKAGE#<packageId>`, `SK = DETAIL`, `GSI1PK = TYPE#<packageType>`, `GSI1SK = PACKAGE#<packageId>`.
3. THE AppSync schema SHALL define authorization for `Package` as `allow.groups(["Admins"])` for Admin users and `allow.custom()` via IAM for the agent Lambda, with no unauthenticated access permitted.
4. IF a `createPackage` or `updatePackage` mutation is submitted with `remainingCredits` greater than `totalCredits`, or with `validUntil` earlier than `validFrom`, or with `price` outside the range 0.01 to 999999.99, or with a `currency` value that is not exactly 3 characters, THEN the AppSync schema SHALL reject the operation and return an error indicating the specific validation failure without persisting any data.
5. WHEN a `createPackage` mutation is executed without an existing `MEMBER#<memberId>` record in the `DancingClubData` table for the provided `memberId`, THEN the AppSync schema SHALL reject the operation and return an error indicating the member does not exist without persisting any data.

---

### Requirement 10: AppSync GraphQL Schema — Claim Entity

**User Story:** As a developer, I want the Claim entity defined in the AppSync schema with correct STD key patterns, so that credit consumption against bookings is tracked and auditable.

#### Acceptance Criteria

1. THE AppSync schema SHALL define a `Claim` model with fields: `claimId` (ID, required), `bookingId` (ID, required), `packageId` (ID, required), `memberId` (ID, required), `creditsConsumed` (Int, required, minimum value of 1), `claimedAt` (AWSDateTime, required), `createdAt` (AWSDateTime, auto-managed), `updatedAt` (AWSDateTime, auto-managed).
2. THE AppSync schema SHALL map the `Claim` model to DynamoDB key pattern: `PK = CLAIM#<claimId>`, `SK = DETAIL`, `GSI1PK = BOOKING#<bookingId>`, `GSI1SK = CLAIM#<claimId>`.
3. THE AppSync schema SHALL define authorization for `Claim` such that `allow.groups(["Admins"])` grants Admin users full create, read, update, and delete access, and `allow.custom()` via IAM grants the agent Lambda create and read access only.

---

### Requirement 11: DynamoDB Single-Table Design — Table Configuration

**User Story:** As a developer, I want the DancingClubData DynamoDB table configured with proper key schema and GSI1, so that all six entity types can coexist in one table and support their access patterns efficiently.

#### Acceptance Criteria

1. THE DancingClubData table SHALL have a composite primary key: `PK` (String, partition key) and `SK` (String, sort key).
2. THE DancingClubData table SHALL define `GSI1` with partition key `GSI1PK` (String) and sort key `GSI1SK` (String), using PAY_PER_REQUEST billing mode, and SHALL project ALL attributes onto GSI1.
3. THE DancingClubData table SHALL support the following six access patterns via GSI1, where each pattern queries by exact GSI1PK value and returns all matching items sorted ascending by GSI1SK:
   - List all members for a club: `GSI1PK = CLUB#<clubId>`
   - List all schedules for a date: `GSI1PK = DATE#<YYYY-MM-DD>`
   - List all bookings for a member: `GSI1PK = MEMBER#<memberId>`
   - List all packages by type: `GSI1PK = TYPE#<packageType>`
   - List all claims for a booking: `GSI1PK = BOOKING#<bookingId>`
   - List all coaches by specialty: `GSI1PK = SPECIALTY#<type>`
4. THE DancingClubData table SHALL enable point-in-time recovery (PITR) to support the 7-year data retention requirement, retaining continuous backups for a minimum rolling window of 35 days as provided by PITR, with archival beyond 35 days handled via a separate TTL-based archival mechanism.
5. THE DancingClubData table SHALL NOT be provisioned with hardcoded throughput values; PAY_PER_REQUEST (on-demand) billing SHALL be used.
6. WHEN an item is written to the DancingClubData table, THE table SHALL reject any write where `PK` or `SK` does not conform to the `ENTITY#<id>` format defined for one of the six canonical entity types (Member, Schedule, Booking, Package, Claim, Coach).
7. IF a GSI1 query returns zero items for a valid GSI1PK value, THEN THE DancingClubData table SHALL return an empty result set without error, and the calling function SHALL treat this as a valid empty-collection response rather than a fault condition.

---

### Requirement 12: Security — IAM Least-Privilege and Secrets Management

**User Story:** As a platform operator, I want all Lambda functions to operate under least-privilege IAM roles and all secrets stored in AWS Secrets Manager, so that the platform meets security best practices and no credentials are hardcoded in source code.

#### Acceptance Criteria

1. THE Amplify_Gen2 backend SHALL define a distinct IAM execution role for each Lambda function, where each role grants only the DynamoDB actions (`GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`) on the `DancingClubData` table and only the specific AWS service actions documented for that function's single responsibility.
2. THE Amplify_Gen2 backend SHALL grant DynamoDB access to Lambda functions exclusively via resource-based IAM policies attached to each function's execution role — no AWS access key ID, secret access key, or session token SHALL appear as a literal string in any file under `amplify/` or `src/`.
3. THE Amplify_Gen2 backend SHALL expose external secrets (WhatsApp API token, Pinpoint credentials, and any third-party API credentials) to Lambda functions exclusively as environment variable references to AWS Secrets Manager ARNs — the resolved secret value SHALL NOT appear as a literal string in any file under `amplify/` or `src/`.
4. IF a Lambda function cannot retrieve a required secret from AWS Secrets Manager at initialisation, THEN THE Lambda function SHALL abort invocation and return an error response indicating a configuration failure — no partial execution SHALL occur.
5. WHEN an Admin GraphQL operation is received by the AppSync API, THE AppSync API SHALL verify the Cognito JWT token in the `Authorization` header before executing any resolver.
6. IF the Cognito JWT token is absent, expired, or fails signature validation on an Admin GraphQL operation, THEN THE AppSync API SHALL reject the request with an unauthorised error response and SHALL NOT execute the resolver or return any data.
7. IF a CI pipeline scan detects a literal AWS access key ID, AWS secret access key, or hardcoded API token string in any file within `amplify/` or `src/`, THEN THE CI pipeline SHALL fail the build, block deployment, and surface the file path and line number of the violation in the build output.

---

### Requirement 13: Native AWS — No Third-Party Automation Platforms

**User Story:** As a platform architect, I want all integrations and event routing implemented using native AWS services exclusively, so that the platform has no external dependencies on third-party automation vendors.

#### Acceptance Criteria

1. THE Amplify_Gen2 backend SHALL NOT include any dependency on Zapier, Make, n8n, Pipedream, or equivalent third-party automation platforms.
2. THE Amplify_Gen2 backend SHALL route all webhook events through API Gateway (REST) → Lambda — no third-party webhook brokers SHALL be used.
3. IF a code review detects an import or HTTP call targeting a third-party automation platform endpoint, THEN THE CI pipeline SHALL fail the build within 10 minutes of commit, producing an error message indicating the violating file and line number, without merging or deploying any code from that commit.
4. THE Amplify_Gen2 backend SHALL use Amazon EventBridge, SNS, or SQS for any internal event routing requirements — no third-party message brokers SHALL be introduced.
5. WHEN a new Lambda function is added to `amplify/functions/`, THE Amplify_Gen2 backend SHALL restrict that function's outbound HTTP calls to AWS service endpoints and the Meta WhatsApp Business API exclusively, rejecting any call to a non-approved external host.
6. WHEN the WhatsApp webhook delivers an inbound event, THE Amplify_Gen2 backend SHALL complete ingestion and enqueue the event for agent processing within 5 seconds, using only API Gateway and Lambda — no intermediate third-party service SHALL handle the event in transit.
