import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

/**
 * SINGLE-TABLE DESIGN (STD) BACKEND SCHEMA
 *
 * All data for a club (across Members, Coaches, Schedules, Bookings, Packages, Claims)
 * lives in a single DynamoDB table `ClubRecord` with composite keys and multiple GSIs.
 *
 * KEY DESIGN PRINCIPLES:
 * 1. Multi-Tenant Isolation: pk = Admin Cognito SUB (guarantees data separation)
 * 2. Human Entity Anchors: Members & Coaches use phone number in sk
 * 3. Relational Grouping: GSI1/GSI2 enable efficient bulk queries
 * 4. Scalable Indexing: Each GSI serves specific access patterns
 *
 * RATIONALE:
 * - Single table simplifies deployment, backup, and capacity planning
 * - Composite keys (pk+sk) enable flexible hierarchical data organization
 * - GSIs support multiple access patterns without denormalization
 * - Admin SUB as pk enforces strict tenant boundaries at the database layer
 */

const schema = a.schema({
  ClubRecord: a
    .model({
      // =========================================================================
      // PRIMARY KEYS: Partition & Sort (DynamoDB Primary Index)
      // =========================================================================
      
      /**
       * pk (Partition Key):
       * - Value: Admin's Cognito SUB (e.g., "us-east-1:a1b2c3d4-...")
       * - Purpose: MULTI-TENANT ISOLATION
       * - Guarantees: All queries filtered by pk automatically belong to one admin
       * - Pattern: Used for all operations to ensure data separation
       *
       * Examples:
       *   - pk: "us-east-1:admin123"
       *   - Query: All records where pk = "us-east-1:admin123"
       *   - Result: Only this admin's Members, Coaches, Schedules, etc.
       */
      pk: a.string().required(),

      /**
       * sk (Sort Key):
       * - Value: Composite identifier encoding entity type + unique identifier
       * - Purpose: PRIMARY ENTITY IDENTIFICATION within tenant
       * - Pattern: <ENTITY_TYPE>#<IDENTIFIER>[#<SUB_IDENTIFIER>]
       *
       * Examples:
       *   - MEMBER#<phone>              (e.g., "MEMBER#+1-555-0001")
       *   - COACH#<phone>               (e.g., "COACH#+1-555-0002")
       *   - SCHEDULE#<id>               (e.g., "SCHEDULE#sched-123")
       *   - BOOKING#<id>#MEMBER#<phone> (e.g., "BOOKING#book-456#MEMBER#+1-555-0001")
       *   - PACKAGE#<id>#MEMBER#<phone> (e.g., "PACKAGE#pkg-789#MEMBER#+1-555-0001")
       *   - CLAIM#<id>#BOOKING#<id>    (e.g., "CLAIM#claim-111#BOOKING#book-456")
       *
       * Benefits:
       *   - Human phone number in MEMBER#/COACH# enables WhatsApp lookups
       *   - Nested format (e.g., BOOKING#...#MEMBER#...) groups related entities
       *   - Sortable: Allows range queries like sk > "MEMBER#" AND sk < "MEMBER#~"
       */
      sk: a.string().required(),

      // =========================================================================
      // GSI 1: Entity Filtering & Status-Based Queries
      // =========================================================================

      /**
       * gsi1pk (GSI 1 Partition Key):
       * - Value: Tenant + Entity Type + Optional Context
       * - Purpose: ENTITY GROUPING & FILTERING
       * - Pattern: <adminSub>#<ENTITY_TYPE> or <adminSub>#<ENTITY_TYPE>#<SUB_CONTEXT>
       *
       * Examples:
       *   - "<adminSub>#MEMBERS"                (All members for this admin)
       *   - "<adminSub>#COACHES"                (All coaches for this admin)
       *   - "<adminSub>#SCHEDULES"              (All schedules for this admin)
       *   - "<adminSub>#BOOKINGS"               (All bookings for this admin)
       *   - "<adminSub>#PACKAGES"               (All packages for this admin)
       *   - "<adminSub>#MEMBER#<phone>"        (All records tied to specific member)
       *   - "<adminSub>#COACH#<phone>"         (All records tied to specific coach)
       *
       * Use Cases:
       *   - Query: "Get all active members" → gsi1pk="<sub>#MEMBERS" + filter by gsi1sk
       *   - Query: "Get all bookings for this member" → gsi1pk="<sub>#MEMBER#<phone>"
       */
      gsi1pk: a.string(),

      /**
       * gsi1sk (GSI 1 Sort Key):
       * - Value: Composite sorting key for filtering & ordering
       * - Purpose: ATTRIBUTE-BASED FILTERING & SORTING
       * - Pattern: <ATTRIBUTE>#<VALUE>[#<SECONDARY_ATTRIBUTE>#<VALUE>]
       *
       * Examples:
       *   - "STATUS#ACTIVE"                    (All active members/coaches)
       *   - "STATUS#ACTIVE#TIER#GOLD"          (Active members, tier=GOLD)
       *   - "STATUS#SUSPENDED"                 (All suspended entities)
       *   - "DATETIME#2024-09-03T14:30:00"    (Chronological booking order)
       *   - "BALANCE#100"                      (Member balance sorting)
       *
       * Benefits:
       *   - Range queries: gsi1sk BETWEEN "STATUS#ACTIVE" AND "STATUS#ACTIVE~"
       *   - Sorting: Results auto-sorted by status, then tier, etc.
       *   - Filtering: Supports complex queries like "Active GOLD members"
       */
      gsi1sk: a.string(),

      // =========================================================================
      // GSI 2: Temporal & Relational Queries
      // =========================================================================

      /**
       * gsi2pk (GSI 2 Partition Key):
       * - Value: Tenant + Entity Type (for bulk temporal operations)
       * - Purpose: RELATIONAL GROUPING & TIME-BASED QUERIES
       * - Pattern: <adminSub>#<ENTITY_TYPE> (simpler than GSI1 for broad queries)
       *
       * Examples:
       *   - "<adminSub>#SCHEDULES"            (All schedules for bulk listing/filtering)
       *   - "<adminSub>#BOOKINGS"             (All bookings for date range queries)
       *   - "<adminSub>#PACKAGES"             (All packages for expiration checks)
       *
       * Use Cases:
       *   - Query: "Get all schedules for week of Sept 3" 
       *     → gsi2pk="<sub>#SCHEDULES" + filter by gsi2sk range
       *   - Query: "Get all expired packages"
       *     → gsi2pk="<sub>#PACKAGES" + filter where validUntil < today
       */
      gsi2pk: a.string(),

      /**
       * gsi2sk (GSI 2 Sort Key):
       * - Value: Temporal or hierarchical sorting
       * - Purpose: DATE-BASED FILTERING & CHRONOLOGICAL ORDERING
       * - Pattern: <DATE_COMPONENT>#<VALUE> or <TIMESTAMP>
       *
       * Examples:
       *   - "DATE#2024-09-03"                  (For schedule queries by date)
       *   - "DATETIME#2024-09-03T14:30:00"    (For precise chronological sorting)
       *   - "EXPIRY#2024-09-10"                (For package expiration queries)
       *   - "CREATED#2024-09-01T10:00:00"    (For newest-first sorting)
       *
       * Benefits:
       *   - Range queries: gsi2sk BETWEEN "DATE#2024-09-03" AND "DATE#2024-09-04"
       *   - Efficient pagination: Sort by datetime for consistent ordering
       *   - Archival: Identify old records for deletion or archival
       */
      gsi2sk: a.string(),

      // =========================================================================
      // ENTITY TYPE DISCRIMINATOR
      // =========================================================================

      /**
       * entityType: 
       * - Value: One of MEMBER, COACH, SCHEDULE, BOOKING, PACKAGE, CLAIM
       * - Purpose: RUNTIME TYPE DISCRIMINATION
       * - Usage: After querying, filter or cast based on entityType
       * - Example:
       *   records.filter(r => r.entityType === 'MEMBER')
       *   records.filter(r => r.entityType === 'COACH')
       */
      entityType: a.enum(['MEMBER', 'COACH', 'SCHEDULE', 'BOOKING', 'PACKAGE', 'CLAIM', 'FACILITY', 'CATALOG']),

      // =========================================================================
      // SHARED OPTIONAL ATTRIBUTES
      // =========================================================================
      // All attributes are optional to support flexible schema.
      // Frontend validates and populates based on entityType.

      /** MEMBER & COACH Attributes */
      phone: a.string(),              // +1-555-0001 (unique per member/coach)
      name: a.string(),               // "Clara Rodriguez"
      email: a.string(),              // "clara@vidabaile.local"
      status: a.string(),             // ACTIVE, INACTIVE, SUSPENDED
      tier: a.string(),               // MEMBER only: STANDARD, SILVER, GOLD, PLATINUM
      specialty: a.string(),          // COACH only: Salsa, Bachata, Merengue, etc.
      bio: a.string(),                // COACH only: Short biography

      /** SCHEDULE Attributes */
      date: a.date(),                 // 2024-09-03 (for schedule queries)
      startTime: a.time(),            // 18:00:00
      endTime: a.time(),              // 19:30:00
      facilityId: a.string(),         // facility-001
      activityType: a.string(),       // "Salsa Beginner", "Bachata Advanced"
      capacity: a.integer(),          // 20 (max attendees)
      currentOccupancy: a.integer(),  // Current enrollment count (denormalized from BOOKING records)

      /** BOOKING Attributes */
      coachPhone: a.string(),         // Reference to coach (used in BOOKING records)
      scheduleId: a.string(),         // Reference to schedule
      bookedAt: a.datetime(),         // Timestamp of booking creation

      /** PACKAGE & CLAIM Attributes */
      packageId: a.string(),          // Reference to package
      notes: a.string(),              // Admin notes for booking/package

      // PACKAGE-specific
      packageType: a.string(),        // "10 Sessions", "Monthly Unlimited"
      totalCredits: a.integer(),      // 10
      remainingCredits: a.integer(),  // 8 (after some sessions)
      price: a.float(),               // 99.99
      validFrom: a.date(),            // 2024-09-01
      validUntil: a.date(),           // 2024-12-01

      // CLAIM-specific (tracks session usage)

      // FACILITY-specific (Dancing Halls)
      location: a.string(),           // Address or location descriptor
      description: a.string(),        // Facility details, amenities
      creditsConsumed: a.integer(),   // 1 (per session)
      themeColor: a.string(),         // Hex color for facility (e.g., "#FF6B6B" for Hall-1)
    })
    .identifier(['pk', 'sk'])
    .secondaryIndexes((index) => [
      /**
       * GSI 1: Entity Filtering & Status Queries
       * - Use: Query all members, coaches, etc. with optional status filtering
       * - Example: "Get all active GOLD members"
       *   Query: gsi1pk = "<sub>#MEMBERS", gsi1sk begins_with "STATUS#ACTIVE#TIER#GOLD"
       */
      index('gsi1pk').sortKeys(['gsi1sk']).queryField('listByGsi1'),

      /**
       * GSI 2: Temporal & Relational Queries
       * - Use: Query schedules by date, packages by expiry, bookings by time
       * - Example: "Get all schedules for this week"
       *   Query: gsi2pk = "<sub>#SCHEDULES", gsi2sk BETWEEN "DATE#2024-09-03" AND "DATE#2024-09-10"
       */
      index('gsi2pk').sortKeys(['gsi2sk']).queryField('listByGsi2'),
    ])
    .authorization((allow) => [
      allow.groups(['Admins']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
