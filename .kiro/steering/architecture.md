---
inclusion: always
---

# VidaBaile — Global Architectural Steering Document

> This document is the single source of truth for all code generation, prompt refinement loops, and bug-fix cycles in this project. Every generated artifact MUST conform to the constraints defined here. Deviations require explicit user approval and an update to this document first.

---

## 1. Product Vision

VidaBaile is an AI-driven dance club management platform that modernizes a legacy studio system. It has two completely separate user experiences:

| Audience | Interface | Technology |
|---|---|---|
| Members / Customers | WhatsApp messaging ONLY | Meta WhatsApp Business API → AWS |
| Admins / Staff | Responsive web application | React + Amplify Gen 2 |

There is **no customer-facing web or mobile app**. Members interact exclusively through WhatsApp natural-language conversations handled by the AI agent.

---

## 2. Hard Constraints — Never Violate

### 2.1 Admin UI Constraints

- **Navigation MUST use a Top-Level Tab-Based system.** Tabs include (but are not limited to): `Home`, `Activities`, `Facilities`, `Appointments`, `POS & Packages`, `CRM`, `PR/Marketing`, `Settings`.
- **A left-hand sidebar menu is strictly FORBIDDEN.** Do not generate sidebar navigation under any circumstance.
- The Admin Dashboard MUST be fully responsive across mobile, tablet, and desktop breakpoints.
- Use Amplify UI Components as the primary component library. Introduce third-party UI libraries only when Amplify UI has no equivalent and only with explicit approval.

### 2.2 Agentic AI Guardrails (WhatsApp Agent)

The member-facing AI agent is restricted to exactly **four supported intents**:

```
BOOK_COACH       — Book a session with a specific coach
PAY_PACKAGE      — Purchase or renew a membership package
POSTPONE_SESSION — Reschedule an existing booking
QUERY_MEMBERSHIP — Query membership status, balance, or history
```

- Any user request that maps outside these four intents MUST be intercepted and deflected.
- An **intent-interception loop** must be implemented: classify intent → if unsupported → respond with a guided correction message → re-prompt the user toward a supported action.
- Hallucination guards: the agent MUST NOT invent bookings, prices, schedules, or membership data. All responses must be grounded in live DynamoDB data fetched via AppSync tool calls.
- Agent responses must be concise, WhatsApp-friendly (short paragraphs, no markdown headers, no bullet lists unless the platform renders them).

### 2.3 Native AWS Only

- **Third-party automation platforms (Zapier, Make, n8n, Pipedream, etc.) are strictly FORBIDDEN.**
- All webhooks, routing, event buses, and integrations use native AWS services exclusively.
- Any proposed architecture using a forbidden service must be rejected and redesigned.

---

## 3. Technology Stack (Locked)

### 3.1 Frontend

| Concern | Technology | Version / Notes |
|---|---|---|
| Framework | React | 18+ |
| Language | TypeScript | Strict mode enabled |
| Bundler | Vite | Latest stable |
| UI Components | AWS Amplify UI Components | `@aws-amplify/ui-react` |
| Amplify Client | aws-amplify | v6+ (Gen 2 client) |
| Styling | Amplify UI tokens + CSS modules | No Tailwind unless approved |

### 3.2 Backend Infrastructure (IaC)

| Concern | Technology | Notes |
|---|---|---|
| IaC Framework | AWS Amplify Gen 2 | Code-first, TypeScript |
| Data Schema | `amplify/data/resource.ts` | AppSync model definitions |
| Auth | `amplify/auth/resource.ts` | Cognito User Pools |
| Functions | `amplify/functions/` | Node.js 20.x Lambda |
| Custom Resources | `amplify/custom/` | CDK L2/L3 constructs |

### 3.3 API Layer

- **Protocol:** GraphQL exclusively via **AWS AppSync**.
- REST endpoints are permitted **only** for external webhook ingestion (WhatsApp → API Gateway → Lambda). All internal data operations go through AppSync.
- Subscriptions (AppSync real-time) should be used for live dashboard updates where applicable.

### 3.4 Database

- **Single DynamoDB table:** `DancingClubData`
- Single-Table Design (STD) with overloaded PK/SK patterns.
- At minimum one **GSI1** (`GSI1PK` / `GSI1SK`) to support cross-entity access patterns.
- Additional GSIs may be added per access pattern — always document the pattern before adding a GSI.

#### Canonical Entity Key Patterns

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Member | `MEMBER#<memberId>` | `PROFILE` | `CLUB#<clubId>` | `MEMBER#<memberId>` |
| Schedule | `SCHEDULE#<scheduleId>` | `DETAIL` | `DATE#<YYYY-MM-DD>` | `SCHEDULE#<scheduleId>` |
| Booking | `BOOKING#<bookingId>` | `DETAIL` | `MEMBER#<memberId>` | `BOOKING#<bookingId>` |
| Package | `PACKAGE#<packageId>` | `DETAIL` | `TYPE#<packageType>` | `PACKAGE#<packageId>` |
| Claim | `CLAIM#<claimId>` | `DETAIL` | `BOOKING#<bookingId>` | `CLAIM#<claimId>` |
| Coach | `COACH#<coachId>` | `PROFILE` | `SPECIALTY#<type>` | `COACH#<coachId>` |

New entities MUST follow this naming convention before being implemented.

### 3.5 AI / Agentic Layer

Concern,Technology,Notes
LLM,Amazon Bedrock,"Amazon Nova Pro (complex tasks), Amazon Nova Micro (fast, low-cost responses)"
Knowledge Base,Bedrock Knowledge Bases,Backed by Amazon S3 Vectors (highly cost-effective storage)
Agent Framework,Strands SDK,Python-based Lambda tool orchestration
Tool Protocol,Model Context Protocol (MCP),Connects agent tools to AppSync/DynamoDB
Webhook Ingestion,API Gateway (REST) + Lambda,Receives Meta WhatsApp webhook events

### 3.6 Marketing & Notifications

| Concern | Technology | Notes |
|---|---|---|
| Broadcast Push | Amazon Pinpoint | Triggered from Admin UI via GraphQL mutation |
| WhatsApp Broadcast | WhatsApp Business API | Called directly from Lambda (no third-party broker) |
| Transactional SMS/Email | Amazon SES / SNS | For booking confirmations, reminders |

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADMIN WEB APP                            │
│  React 18 + Vite + Amplify UI + TypeScript                      │
│  [Home] [Activities] [Facilities] [Appointments]                │
│  [POS & Packages] [CRM] [PR/Marketing] [Settings]               │
│  (Tab-based navigation — NO sidebar)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GraphQL (AppSync)
┌──────────────────────────▼──────────────────────────────────────┐
│                    AWS AppSync (GraphQL API)                     │
│  Resolvers → DynamoDB Direct / Lambda Functions                 │
└──────┬───────────────────────────────────────┬──────────────────┘
       │                                       │
┌──────▼──────────────┐           ┌────────────▼─────────────────┐
│  DancingClubData    │           │   Lambda Functions           │
│  (DynamoDB STD)     │           │   - bookCoach                │
│  PK/SK + GSI1       │           │   - payPackage               │
└─────────────────────┘           │   - postponeSession          │
                                  │   - queryMembership          │
                                  │   - broadcastMarketing       │
                                  └────────────┬─────────────────┘
                                               │
┌──────────────────────────────────────────────▼──────────────────┐
│              AGENTIC AI LAYER (Strands SDK + MCP)               │
│  Amazon Bedrock (Claude) ←→ MCP Tools ←→ AppSync               │
│  Intent Classifier → Guardrail Loop → Supported Action          │
└──────────────────────────────────────────────┬──────────────────┘
                                               │
┌──────────────────────────────────────────────▼──────────────────┐
│              WhatsApp WEBHOOK INGESTION                         │
│  Meta Platform → API Gateway (REST) → Lambda → Agent           │
└─────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Amazon Pinpoint / SES / SNS │
                    │  (Broadcast & Transactional) │
                    └──────────────────────────────┘
```

---

## 5. Amplify Gen 2 Project Structure

```
amplify/
├── auth/
│   └── resource.ts              # Cognito User Pool (Admin staff only)
├── data/
│   └── resource.ts              # AppSync schema: all models + custom mutations
├── functions/
│   ├── whatsapp-webhook/        # Ingests Meta webhook, invokes agent
│   ├── strands-agent/           # Strands SDK agent runtime (Python 3.12)
│   ├── book-coach/              # Tool: BOOK_COACH
│   ├── pay-package/             # Tool: PAY_PACKAGE
│   ├── postpone-session/        # Tool: POSTPONE_SESSION
│   ├── query-membership/        # Tool: QUERY_MEMBERSHIP
│   └── broadcast-marketing/     # Admin-triggered Pinpoint/WhatsApp broadcast
├── custom/
│   └── api-gateway-webhook/     # CDK: API Gateway for WhatsApp webhook
└── backend.ts                   # Root Amplify backend definition
```

Frontend structure:

```
src/
├── components/
│   ├── layout/
│   │   ├── AppTabs.tsx          # Root tab navigation (NO sidebar)
│   │   └── TabPanel.tsx
│   ├── home/
│   ├── activities/
│   ├── facilities/
│   ├── appointments/
│   ├── pos-packages/
│   ├── crm/
│   ├── pr-marketing/
│   └── settings/
├── graphql/                     # Generated AppSync client types
├── hooks/                       # Custom React hooks (useAppSync, useAgent)
├── lib/
│   └── amplify-config.ts
└── main.tsx
```

---

## 6. Agent Intent Interception Loop (Implementation Contract)

Every WhatsApp message MUST pass through this pipeline:

```
1. RECEIVE   → API Gateway receives webhook POST from Meta
2. VALIDATE  → Lambda verifies Meta webhook signature (HMAC-SHA256)
3. EXTRACT   → Parse message body, sender phone number, timestamp
4. CLASSIFY  → Bedrock Claude classifies intent:
               { intent: "BOOK_COACH" | "PAY_PACKAGE" | "POSTPONE_SESSION" 
                         | "QUERY_MEMBERSHIP" | "UNSUPPORTED" }
5. GUARD     → If intent == "UNSUPPORTED":
                 → Respond: guided deflection message (no tool calls)
                 → Log unsupported intent to DynamoDB for analytics
                 → END (do not proceed to agent tools)
6. EXECUTE   → If intent is supported: invoke corresponding MCP tool
7. RESPOND   → Format tool result as WhatsApp-friendly message
8. DELIVER   → Call WhatsApp Business API to send reply
```

Deflection message template (customize tone but keep structure):
> "I can help you with booking a coach, purchasing a package, rescheduling a session, or checking your membership. Which of these can I help you with today?"

---

## 7. GraphQL Schema Conventions

- All AppSync models defined in `amplify/data/resource.ts` using `a.model()`.
- Every model MUST have `createdAt` and `updatedAt` auto-managed fields.
- Custom mutations that invoke Lambda must use `a.mutation()` with explicit `handler: a.handler.function(...)`.
- Subscriptions must be defined for any entity where real-time Admin UI updates are needed (e.g., new bookings, new WhatsApp messages).
- Authorization:
  - Admin users: `allow.groups(["Admins"])` via Cognito.
  - Agent Lambda: `allow.custom()` using IAM role for service-to-service.
  - Public/unauthenticated: NOT permitted on any model.

---

## 8. Security Requirements

- All Lambda functions operate under least-privilege IAM roles.
- WhatsApp webhook endpoint MUST validate Meta's `X-Hub-Signature-256` header before processing any payload.
- DynamoDB access from Lambda uses resource-based IAM policies — no hardcoded credentials.
- Bedrock model invocation is IAM-controlled; no API keys stored in code.
- Cognito JWT tokens are verified by AppSync on every Admin API call.
- Secrets (WhatsApp token, Pinpoint keys) stored in AWS Secrets Manager, referenced via Lambda environment variable ARNs.

---

## 9. Prompt Engineering Rules for Code Generation

When generating code or specifications for this project, always:

1. **Check nav pattern first** — Any Admin UI feature must attach to an existing tab, never create a new sidebar or drawer nav.
2. **Verify intent scope** — Any agent feature must map to one of the four supported intents. New intents require explicit approval and a document update.
3. **Use STD key patterns** — Any new DynamoDB entity must follow the `ENTITY#<id>` PK/SK convention defined in Section 4.
4. **GraphQL over REST** — Internal data operations always go through AppSync. Never add a REST endpoint for internal use.
5. **No third-party platforms** — Reject any suggestion involving Zapier, Make, or similar. Redesign using native AWS.
6. **Amplify Gen 2 code-first** — Infrastructure is defined in TypeScript under `amplify/`. Never use Amplify Gen 1 or raw CDK outside of `amplify/custom/`.
7. **Agent tools are Lambda functions** — Each MCP tool corresponds to a single Lambda function with a single responsibility.
8. **Security by default** — Every generated Lambda must reference its IAM role. Every AppSync operation must specify its auth rule.

---

## 10. Admin Tab Feature Ownership

| Tab | Primary Features | Key Mutations |
|---|---|---|
| Home | Dashboard KPIs, today's schedule, alerts | `listTodaySchedules`, `getMemberStats` |
| Activities | Class/workshop management, coach assignment | `createActivity`, `updateActivity`, `assignCoach` |
| Facilities | Room/court availability, maintenance flags | `createFacility`, `updateFacilityStatus` |
| Appointments | Booking calendar, manual override | `createBooking`, `cancelBooking`, `rescheduleBooking` |
| POS & Packages | Package sales, payment recording | `createPackage`, `recordPayment`, `assignPackageToMember` |
| CRM | Member profiles, notes, tier management | `getMember`, `updateMember`, `addMemberNote` |
| PR/Marketing | Broadcast composer, segment selector, send | `triggerBroadcast` → Lambda → Pinpoint/WhatsApp |
| Settings | Staff management, club config, integrations | `createStaffUser`, `updateClubConfig` |

---

## 11. Non-Functional Requirements

| Concern | Target |
|---|---|
| Admin UI load time | < 2s on 4G mobile (Lighthouse ≥ 85) |
| WhatsApp response latency | < 3s end-to-end (p95) |
| DynamoDB read latency | < 10ms (p99, single-item reads) |
| Bedrock inference | Claude Haiku for sub-1s classification, Sonnet for complex reasoning |
| Availability | 99.9% (multi-AZ by default via AppSync + DynamoDB) |
| Data retention | 7-year DynamoDB TTL-based archival for bookings |

---

## 12. Forbidden Patterns — Auto-Reject

The following patterns must never appear in generated code or architecture proposals:

- `import { Layout, Sider } from 'antd'` or any Ant Design sidebar
- Any sidebar/drawer as primary navigation
- `axios.post('https://hooks.zapier.com/...')` or any Zapier/Make webhook URL
- `new AWS.DynamoDB.DocumentClient()` with hardcoded credentials
- Agent responding to intents outside the four supported ones without the guardrail loop
- REST API calls for internal Admin UI data fetching (must use AppSync)
- Amplify Gen 1 patterns (`amplify push`, `aws-exports.js`, `API.graphql` from `aws-amplify/api`)

---

*Last updated: September 1, 2026 — VidaBaile v1.0 baseline*
