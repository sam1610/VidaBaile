/**
 * FRONTEND DATA MODELS & INTERFACES
 *
 * These TypeScript interfaces enforce strong typing for ClubRecord entities
 * fetched from the STD backend. Each interface extends the base ClubRecord type
 * and adds entity-specific required/optional fields.
 *
 * USAGE:
 *   - Type guards: Use entityType discriminator to narrow types at runtime
 *   - Backend mutations: Construct payloads matching these interfaces
 *   - UI rendering: Components accept these types with full IDE autocomplete
 */

/**
 * BASE CLUB RECORD
 * Represents the raw DynamoDB ClubRecord as returned from AppSync
 */
export interface ClubRecord {
  pk: string;
  sk: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  entityType?: 'MEMBER' | 'COACH' | 'SCHEDULE' | 'BOOKING' | 'PACKAGE' | 'CLAIM' | 'SETTINGS' | 'FACILITY' | 'CATALOG';
  
  // Shared optional attributes
  phone?: string;
  name?: string;
  email?: string;
  status?: string;
  tier?: string;
  specialty?: string;
  bio?: string;
  date?: string; // ISO date
  startTime?: string;
  endTime?: string;
  facilityId?: string;
  activityType?: string;
  capacity?: number;
  coachPhone?: string;
  scheduleId?: string;
  bookedAt?: string; // ISO datetime
  notes?: string;
  packageId?: string;
  catalogPackageId?: string;  // Reference to CATALOG package template
  packageType?: string;
  totalCredits?: number;
  remainingCredits?: number;
  price?: number;
  validFrom?: string; // ISO date
  validUntil?: string; // ISO date
  creditsConsumed?: number;
  createdAt?: string; // Auto-managed by AppSync
  updatedAt?: string; // Auto-managed by AppSync
}

/**
 * MEMBER RECORD
 * entityType: 'MEMBER'
 * sk pattern: MEMBER#<phone>
 * gsi1pk pattern: <adminSub>#MEMBERS
 * gsi1sk pattern: STATUS#<status>#TIER#<tier>
 *
 * Multi-tenant member profile with package/booking history.
 */
export interface Member extends ClubRecord {
  entityType: 'MEMBER';
  phone: string; // +1-555-0001 (required, unique per admin)
  name: string; // Clara Rodriguez
  email?: string; // clara@vidabaile.local
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; // (required)
  tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM'; // (required)
}

/**
 * COACH RECORD
 * entityType: 'COACH'
 * sk pattern: COACH#<phone>
 * gsi1pk pattern: <adminSub>#COACHES
 * gsi1sk pattern: STATUS#<status>#SPECIALTY#<specialty>
 *
 * Dance coach/instructor profile with availability and specialties.
 */
export interface Coach extends ClubRecord {
  entityType: 'COACH';
  phone: string; // +1-555-0002 (required, unique per admin)
  name: string; // Juan Martinez
  email?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  specialty: string; // Salsa, Bachata, Merengue, etc.
  bio?: string; // Short biography
}

/**
 * SCHEDULE RECORD
 * entityType: 'SCHEDULE'
 * sk pattern: SCHEDULE#<scheduleId>
 * gsi1pk pattern: <adminSub>#SCHEDULES
 * gsi1sk pattern: COACH#<phone>#TIME#<startTime>
 * gsi2pk pattern: <adminSub>#SCHEDULES
 * gsi2sk pattern: DATE#<date>#TIME#<startTime>
 *
 * Dance class/activity schedule for a specific coach & facility.
 */
export interface Schedule extends ClubRecord {
  entityType: 'SCHEDULE';
  date: string; // 2024-09-03 (required, ISO date)
  startTime: string; // 18:00 (required)
  endTime: string; // 19:30 (required)
  facilityId: string; // facility-001 (required)
  activityType: string; // Salsa Beginner (required)
  coachPhone: string; // Reference to coach (required)
  capacity: number; // 20 (required)
}

/**
 * BOOKING RECORD
 * entityType: 'BOOKING'
 * sk pattern: BOOKING#<bookingId>#MEMBER#<memberPhone>#SCHEDULE#<scheduleId>
 * gsi1pk pattern: <adminSub>#MEMBER#<memberPhone>
 * gsi1sk pattern: BOOKING#DATETIME#<bookedAt>
 * gsi2pk pattern: <adminSub>#SCHEDULE#<scheduleId>
 * gsi2sk pattern: DATETIME#<bookedAt>
 *
 * Session booking linking a member to a schedule.
 */
export interface Booking extends ClubRecord {
  entityType: 'BOOKING';
  scheduleId: string; // Reference to schedule (required)
  coachPhone: string; // Reference to coach (required)
  phone: string; // Member phone (required)
  bookedAt: string; // ISO datetime (required)
  status?: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  notes?: string;
}

/**
 * PACKAGE RECORD
 * entityType: 'PACKAGE'
 * sk pattern: PACKAGE#<packageId>#MEMBER#<memberPhone>
 * gsi1pk pattern: <adminSub>#MEMBER#<memberPhone>
 * gsi1sk pattern: PACKAGE#TYPE#<packageType>
 * gsi2pk pattern: <adminSub>#PACKAGES
 * gsi2sk pattern: EXPIRY#<validUntil>#TYPE#<packageType>
 *
 * Membership/credit package assigned to a member (e.g., 10 sessions, unlimited monthly).
 */
export interface Package extends ClubRecord {
  entityType: 'PACKAGE';
  phone: string; // Member phone (required)
  packageType: string; // 10 Sessions, Monthly Unlimited (required)
  totalCredits: number; // 10 (required)
  remainingCredits: number; // 8 (required)
  price: number; // 99.99 (required)
  validFrom: string; // 2024-09-01 (required, ISO date)
  validUntil: string; // 2024-12-01 (required, ISO date)
}

/**
 * CLAIM RECORD
 * entityType: 'CLAIM'
 * sk pattern: CLAIM#<claimId>#BOOKING#<bookingId>
 * gsi1pk pattern: <adminSub>#BOOKING#<bookingId>
 * gsi1sk pattern: CLAIM#DATETIME#<createdAt>
 * gsi2pk pattern: <adminSub>#PACKAGES
 * gsi2sk pattern: DATE#<date>#PACKAGE#<packageId>
 *
 * Session claim: records when a member completes a session and consumes package credits.
 */
export interface Claim extends ClubRecord {
  entityType: 'CLAIM';
  bookingId?: string; // Reference to booking
  packageId?: string; // Reference to package
  catalogPackageId?: string;  // Reference to CATALOG package template
  creditsConsumed: number; // 1 (required)
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
}

/**
 * TYPE GUARDS & RUNTIME DISCRIMINATORS
 * Use these functions to safely narrow union types and enable IDE autocomplete.
 */

export function isMember(record: ClubRecord): record is Member {
  return record.entityType === 'MEMBER';
}

export function isCoach(record: ClubRecord): record is Coach {
  return record.entityType === 'COACH';
}

export function isSchedule(record: ClubRecord): record is Schedule {
  return record.entityType === 'SCHEDULE';
}

export function isBooking(record: ClubRecord): record is Booking {
  return record.entityType === 'BOOKING';
}

export function isPackage(record: ClubRecord): record is Package {
  return record.entityType === 'PACKAGE';
}

export function isClaim(record: ClubRecord): record is Claim {
  return record.entityType === 'CLAIM';
}

/**
 * FACTORY FUNCTIONS FOR CREATING NEW RECORDS
 * Construct properly-keyed records before sending to backend.
 */

/**
 * Create a new Member record
 * @param adminSub Admin's Cognito SUB
 * @param phone Member phone number
 * @param data Member details
 * @returns Member ready for mutation
 */
export function createMember(
  adminSub: string,
  phone: string,
  data: Omit<Member, 'pk' | 'sk' | 'entityType' | 'phone' | 'gsi1pk' | 'gsi1sk'>
): Member {
  return {
    pk: adminSub,
    sk: `MEMBER#${phone}`,
    entityType: 'MEMBER',
    gsi1pk: `${adminSub}#MEMBERS`,
    gsi1sk: `STATUS#${data.status}#TIER#${data.tier}`,
    phone,
    ...data,
  };
}

/**
 * Create a new Coach record
 * @param adminSub Admin's Cognito SUB
 * @param phone Coach phone number
 * @param data Coach details
 * @returns Coach ready for mutation
 */
export function createCoach(
  adminSub: string,
  phone: string,
  data: Omit<Coach, 'pk' | 'sk' | 'entityType' | 'phone' | 'gsi1pk' | 'gsi1sk'>
): Coach {
  return {
    pk: adminSub,
    sk: `COACH#${phone}`,
    entityType: 'COACH',
    gsi1pk: `${adminSub}#COACHES`,
    gsi1sk: `STATUS#${data.status}#PHONE#${phone}`,
    phone,
    ...data,
  };
}

/**
 * Create a new Schedule record
 * @param adminSub Admin's Cognito SUB
 * @param scheduleId Unique schedule ID
 * @param data Schedule details
 * @returns Schedule ready for mutation
 */
export function createSchedule(
  adminSub: string,
  scheduleId: string,
  data: Omit<Schedule, 'pk' | 'sk' | 'entityType' | 'gsi1pk' | 'gsi1sk' | 'gsi2pk' | 'gsi2sk'>
): Schedule {
  return {
    pk: adminSub,
    sk: `SCHEDULE#${scheduleId}`,
    entityType: 'SCHEDULE',
    gsi1pk: `${adminSub}#SCHEDULES`,
    gsi1sk: `COACH#${data.coachPhone}#TIME#${data.startTime}`,
    gsi2pk: `${adminSub}#SCHEDULES`,
    gsi2sk: `DATE#${data.date}#TIME#${data.startTime}`,
    ...data,
  };
}

/**
 * Create a new Booking record
 * @param adminSub Admin's Cognito SUB
 * @param bookingId Unique booking ID
 * @param memberPhone Member's phone
 * @param data Booking details
 * @returns Booking ready for mutation
 */
export function createBooking(
  adminSub: string,
  bookingId: string,
  memberPhone: string,
  data: Omit<Booking, 'pk' | 'sk' | 'entityType' | 'phone' | 'gsi1pk' | 'gsi1sk' | 'gsi2pk' | 'gsi2sk'>
): Booking {
  return {
    pk: adminSub,
    sk: `BOOKING#${bookingId}#MEMBER#${memberPhone}#SCHEDULE#${data.scheduleId}`,
    entityType: 'BOOKING',
    gsi1pk: `${adminSub}#MEMBER#${memberPhone}`,
    gsi1sk: `BOOKING#DATETIME#${data.bookedAt}`,
    gsi2pk: `${adminSub}#SCHEDULE#${data.scheduleId}`,
    gsi2sk: `DATETIME#${data.bookedAt}`,
    phone: memberPhone,
    ...data,
  };
}

/**
 * Create a new Package record
 * @param adminSub Admin's Cognito SUB
 * @param packageId Unique package ID
 * @param memberPhone Member's phone
 * @param data Package details
 * @returns Package ready for mutation
 */
export function createPackage(
  adminSub: string,
  packageId: string,
  memberPhone: string,
  data: Omit<Package, 'pk' | 'sk' | 'entityType' | 'phone' | 'gsi1pk' | 'gsi1sk' | 'gsi2pk' | 'gsi2sk'>
): Package {
  return {
    pk: adminSub,
    sk: `PACKAGE#${packageId}#MEMBER#${memberPhone}`,
    entityType: 'PACKAGE',
    gsi1pk: `${adminSub}#MEMBER#${memberPhone}`,
    gsi1sk: `PACKAGE#TYPE#${data.packageType}`,
    gsi2pk: `${adminSub}#PACKAGES`,
    gsi2sk: `EXPIRY#${data.validUntil}#TYPE#${data.packageType}`,
    phone: memberPhone,
    ...data,
  };
}

/**
 * Create a new Claim record
 * @param adminSub Admin's Cognito SUB
 * @param claimId Unique claim ID
 * @param data Claim details
 * @returns Claim ready for mutation
 */
export function createClaim(
  adminSub: string,
  claimId: string,
  data: Omit<Claim, 'pk' | 'sk' | 'entityType' | 'gsi1pk' | 'gsi1sk' | 'gsi2pk' | 'gsi2sk'>
): Claim {
  return {
    pk: adminSub,
    sk: `CLAIM#${claimId}#BOOKING#${data.bookingId}`,
    entityType: 'CLAIM',
    gsi1pk: `${adminSub}#BOOKING#${data.bookingId}`,
    gsi1sk: `CLAIM#DATETIME#${new Date().toISOString()}`,
    gsi2pk: `${adminSub}#PACKAGES`,
    gsi2sk: `DATE#${new Date().toISOString().split('T')[0]}#PACKAGE#${data.packageId}`,
    ...data,
  };
}

/**
 * CLUB SETTINGS RECORD
 * entityType: 'SETTINGS'
 * sk pattern: SETTINGS#GLOBAL
 * gsi1pk pattern: <adminSub>#SETTINGS
 *
 * Single settings record per admin containing club-wide configuration.
 * Store Name, Phone, Address, Operating Hours, Cancellation Policy, and Currency.
 */
export interface ClubSettings extends ClubRecord {
  entityType: 'SETTINGS';
  clubName: string; // Display name of the dance club
  address: string; // Physical address
  phone: string; // Primary phone number
  operatingHours: Array<{
    day: string; // "Monday", "Monday-Friday", "Saturday-Sunday"
    openTime: string; // HH:MM (24-hour format)
    closeTime: string; // HH:MM (24-hour format)
  }>;
  cancellationWindowHours: number; // How many hours before session to allow cancellation (0-168)
  currency: string; // ISO 4217 code (USD, BRL, EUR, etc.)
}

/**
 * FACILITY RECORD
 * entityType: 'FACILITY'
 * sk pattern: FACILITY#<facilityId>
 * gsi1pk pattern: <adminSub>#FACILITIES
 * gsi1sk pattern: STATUS#<status> (for future use)
 *
 * One or more facilities (dance halls, studios, courts) per admin.
 * Used to organize activities and manage space capacity.
 */
export interface Facility extends ClubRecord {
  entityType: 'FACILITY';
  facilityId: string;          // UUID or nanoid
  name: string;                // "Studio A", "Ballroom", etc.
  capacity: number;            // Max attendees (1-1000)
  location: string;            // Address or location descriptor
  description?: string;        // Facility details, amenities
  currentOccupancy?: number;   // Current number of people (0-capacity)
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
}

/**
 * TYPE GUARDS FOR SETTINGS & FACILITIES
 */

export function isClubSettings(record: ClubRecord): record is ClubSettings {
  return record.entityType === 'SETTINGS';
}

export function isFacility(record: ClubRecord): record is Facility {
  return record.entityType === 'FACILITY';
}

/**
 * FACTORY FUNCTIONS FOR SETTINGS & FACILITIES
 */

/**
 * Create a new ClubSettings record
 * @param adminSub Admin's Cognito SUB
 * @param data Settings details
 * @returns ClubSettings ready for mutation
 *
 * STD Pattern Example:
 * - pk: 'user-123-abc-def'
 * - sk: 'SETTINGS#GLOBAL'
 * - gsi1pk: 'user-123-abc-def#SETTINGS'
 * - gsi1sk: 'STATUS#ACTIVE' (future filtering)
 */
export function createClubSettings(
  adminSub: string,
  data: Omit<ClubSettings, 'pk' | 'sk' | 'entityType' | 'gsi1pk' | 'gsi1sk'>
): ClubSettings {
  return {
    pk: adminSub,
    sk: 'SETTINGS#GLOBAL',
    entityType: 'SETTINGS',
    gsi1pk: `${adminSub}#SETTINGS`,
    gsi1sk: 'STATUS#ACTIVE',
    ...data,
  };
}

/**
 * Create a new Facility record
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Unique facility ID (UUID or nanoid)
 * @param data Facility details
 * @returns Facility ready for mutation
 *
 * STD Pattern Example:
 * - pk: 'user-123-abc-def'
 * - sk: 'FACILITY#facility-001'
 * - gsi1pk: 'user-123-abc-def#FACILITIES'
 * - gsi1sk: 'STATUS#ACTIVE' (for filtering active facilities)
 */
export function createFacility(
  adminSub: string,
  facilityId: string,
  data: Omit<Facility, 'pk' | 'sk' | 'entityType' | 'facilityId' | 'gsi1pk' | 'gsi1sk'>
): Facility {
  return {
    pk: adminSub,
    sk: `FACILITY#${facilityId}`,
    entityType: 'FACILITY',
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: 'STATUS#ACTIVE',
    facilityId,
    ...data,
  };
}

/**
 * CATALOG RECORD (Package Template)
 * entityType: 'CATALOG'
 * sk pattern: CATALOG#<packageId>
 * gsi1pk pattern: <adminSub>#CATALOG
 * gsi1sk pattern: STATUS#<status>#EXPIRY#<validUntil>
 * gsi2pk pattern: <adminSub>#CATALOG
 * gsi2sk pattern: LAUNCH#<validFrom>
 *
 * Package template that serves as the blueprint for member enrollments.
 * One CATALOG record = one package offering (e.g., "10 Sessions", "Monthly Unlimited").
 * Members enroll into packages via PACKAGE records that reference the CATALOG packageId.
 */
export interface Catalog extends ClubRecord {
  entityType: 'CATALOG';
  packageId: string;            // Unique package ID (UUID or nanoid)
  name: string;                 // "10 Sessions", "Monthly Unlimited", "Trial Pack"
  totalCredits: number;         // 10 sessions, 30 classes, etc.
  price: number;                // 99.99 (currency defined in club settings)
  validFrom: string;            // 2024-09-01 (ISO date, when package becomes available)
  validUntil: string;           // 2024-12-31 (ISO date, when package expires from catalog)
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED'; // ACTIVE = available for new enrollments
  description?: string;         // "Best for beginners", "Unlimited access to all classes"
}

/**
 * TYPE GUARD FOR CATALOG
 */
export function isCatalog(record: ClubRecord): record is Catalog {
  return record.entityType === 'CATALOG';
}

/**
 * FACTORY FUNCTION FOR CREATING CATALOG RECORDS
 */

/**
 * Create a new Catalog (Package Template) record
 * @param adminSub Admin's Cognito SUB
 * @param packageId Unique package ID
 * @param data Catalog details
 * @returns Catalog ready for mutation
 *
 * STD Pattern Example:
 * - pk: 'user-123-abc-def'
 * - sk: 'CATALOG#pkg-10-sessions-001'
 * - gsi1pk: 'user-123-abc-def#CATALOG'
 * - gsi1sk: 'STATUS#ACTIVE#EXPIRY#2024-12-31'
 * - gsi2pk: 'user-123-abc-def#CATALOG'
 * - gsi2sk: 'LAUNCH#2024-09-01'
 */
export function createCatalog(
  adminSub: string,
  packageId: string,
  data: Omit<Catalog, 'pk' | 'sk' | 'entityType' | 'packageId' | 'gsi1pk' | 'gsi1sk' | 'gsi2pk' | 'gsi2sk'>
): Catalog {
  return {
    pk: adminSub,
    sk: `CATALOG#${packageId}`,
    entityType: 'CATALOG',
    gsi1pk: `${adminSub}#CATALOG`,
    gsi1sk: `STATUS#${data.status}#EXPIRY#${data.validUntil}`,
    gsi2pk: `${adminSub}#CATALOG`,
    gsi2sk: `LAUNCH#${data.validFrom}`,
    packageId,
    ...data,
  };
}
