/**
 * DATABASE SERVICE: STD Access Layer
 *
 * This service enforces strict adherence to the Single-Table Design (STD) patterns
 * defined in the architecture steering document and src/lib/models.ts.
 *
 * ALL data operations MUST route through this service to ensure:
 * - Correct pk/sk/gsi1pk/gsi1sk/gsi2pk/gsi2sk construction
 * - Multi-tenant isolation via adminSub partition key
 * - Type-safe mutations with factory-validated payloads
 * - Real-time subscription management with automatic cleanup
 *
 * PATTERN REFERENCE:
 * - pk: Admin's Cognito SUB (partition key, multi-tenant isolation)
 * - sk: ENTITY#<identifier> (sort key, entity identification)
 * - gsi1pk: <adminSub>#<ENTITY_TYPE> (entity grouping)
 * - gsi1sk: STATUS#<status>[#TIER#<tier>] (filtering & sorting)
 * - gsi2pk: <adminSub>#<ENTITY_TYPE> (temporal grouping)
 * - gsi2sk: DATE#<date>[#TIME#<time>] (date-based sorting)
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  createMember,
  createCoach,
  createSchedule,
  createBooking,
  createPackage,
  createClaim,
  isMember,
  isCoach,
  isSchedule,
  isBooking,
  isPackage,
  isClaim,
  type Member,
  type Coach,
  type Schedule,
  type Booking,
  type Package,
  type Claim,
} from '../lib/models';

/**
 * CRUD OPERATIONS: Type-Safe Mutations
 *
 * Every function:
 * - Accepts adminSub as first parameter (partition key)
 * - Returns a Promise with the created/updated record
 * - Enforces strict key construction via factory functions
 * - Includes error handling with descriptive messages
 */

/**
 * Create a new member
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: MEMBER#<phone>
 * - gsi1pk: <adminSub>#MEMBERS
 * - gsi1sk: STATUS#<status>#TIER#<tier>
 *
 * @param adminSub Admin's Cognito SUB (partition key)
 * @param phone Member's phone number (unique per admin)
 * @param data Member details (name, status, tier, email)
 * @returns Created Member record with auto-generated createdAt/updatedAt
 */
export async function createMemberRecord(
  adminSub: string,
  phone: string,
  data: { name: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM'; email?: string }
): Promise<Member> {
  try {
    const client = generateClient<Schema>();

    const member = createMember(adminSub, phone, {
      name: data.name,
      status: data.status,
      tier: data.tier,
      email: data.email || '',
    });

    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(member);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create member');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

    if (!isMember(createdRecord)) {
      throw new Error('Created record is not a Member');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member';
    console.error('createMemberRecord error:', error);
    throw new Error(`Failed to create member: ${message}`);
  }
}

/**
 * Update a member's details
 *
 * Constructs the exact pk/sk and applies factory function to maintain STD patterns
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Member's phone (to construct sk)
 * @param updates Fields to update (name, status, tier, email)
 * @returns Updated Member record
 */
export async function updateMemberRecord(
  adminSub: string,
  phone: string,
  updates: Partial<{ name: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM'; email: string }>
): Promise<Member> {
  try {
    const client = generateClient<Schema>();

    const updatedMember = createMember(adminSub, phone, {
      name: updates.name || '',
      status: updates.status || 'ACTIVE',
      tier: updates.tier || 'STANDARD',
      email: updates.email || '',
    });

    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(updatedMember);

    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update member');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }

    if (!isMember(updatedRecord)) {
      throw new Error('Updated record is not a Member');
    }

    return updatedRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update member';
    console.error('updateMemberRecord error:', error);
    throw new Error(`Failed to update member: ${message}`);
  }
}

/**
 * Create a new coach
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: COACH#<phone>
 * - gsi1pk: <adminSub>#COACHES
 * - gsi1sk: STATUS#<status>#PHONE#<phone>
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Coach's phone (unique per admin)
 * @param data Coach details
 * @returns Created Coach record
 */
export async function createCoachRecord(
  adminSub: string,
  phone: string,
  data: { name: string; specialty: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; email?: string; bio?: string }
): Promise<Coach> {
  try {
    const client = generateClient<Schema>();

    const coach = createCoach(adminSub, phone, {
      name: data.name,
      specialty: data.specialty,
      status: data.status,
      email: data.email || '',
      bio: data.bio || '',
    });

    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(coach);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create coach');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

    if (!isCoach(createdRecord)) {
      throw new Error('Created record is not a Coach');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create coach';
    console.error('createCoachRecord error:', error);
    throw new Error(`Failed to create coach: ${message}`);
  }
}

/**
 * Update a coach's details
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Coach's phone
 * @param updates Fields to update
 * @returns Updated Coach record
 */
export async function updateCoachRecord(
  adminSub: string,
  phone: string,
  updates: Partial<{ name: string; specialty: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; email: string; bio: string }>
): Promise<Coach> {
  try {
    const client = generateClient<Schema>();

    const updatedCoach = createCoach(adminSub, phone, {
      name: updates.name || '',
      specialty: updates.specialty || '',
      status: updates.status || 'ACTIVE',
      email: updates.email || '',
      bio: updates.bio || '',
    });

    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(updatedCoach);

    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update coach');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }

    if (!isCoach(updatedRecord)) {
      throw new Error('Updated record is not a Coach');
    }

    return updatedRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update coach';
    console.error('updateCoachRecord error:', error);
    throw new Error(`Failed to update coach: ${message}`);
  }
}

/**
 * Delete a coach (soft or hard delete via status)
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Coach's phone
 * @returns Result of delete operation
 */
export async function deleteCoachRecord(
  adminSub: string,
  phone: string
): Promise<void> {
  try {
    const client = generateClient<Schema>();
    await (client.models as any).ClubRecord.delete({
      pk: adminSub,
      sk: `COACH#${phone}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete coach';
    console.error('deleteCoachRecord error:', error);
    throw new Error(`Failed to delete coach: ${message}`);
  }
}

/**
 * Create a new schedule
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: SCHEDULE#<scheduleId>
 * - gsi1pk: <adminSub>#SCHEDULES
 * - gsi1sk: COACH#<phone>#TIME#<startTime>
 * - gsi2pk: <adminSub>#SCHEDULES
 * - gsi2sk: DATE#<date>#TIME#<startTime>
 *
 * @param adminSub Admin's Cognito SUB
 * @param scheduleId Unique schedule ID
 * @param data Schedule details
 * @returns Created Schedule record
 */
export async function createScheduleRecord(
  adminSub: string,
  scheduleId: string,
  data: {
    date: string; // YYYY-MM-DD
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    facilityId: string;
    activityType: string;
    coachPhone: string;
    capacity: number;
    currentOccupancy?: number; // Current enrollment count
  }
): Promise<Schedule> {
  try {
    const client = generateClient<Schema>();

    const schedule = createSchedule(adminSub, scheduleId, {
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      facilityId: data.facilityId,
      activityType: data.activityType,
      coachPhone: data.coachPhone,
      capacity: data.capacity,
      currentOccupancy: data.currentOccupancy || 0,
    });

    console.log('[DB Service] Creating schedule with payload:', schedule);
    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(schedule);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create schedule');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

        if (!isSchedule(createdRecord)) {
      throw new Error('Created record is not a Schedule');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create schedule';
    console.error('createScheduleRecord error:', error);
    throw new Error(`Failed to create schedule: ${message}`);
  }
}

/**
 * Update an existing schedule (activity)
 * 
 * Update Strategy: Direct update on pk + sk
 * - pk: <adminSub>
 * - sk: SCHEDULE#<scheduleId>
 * - Only updates fields that have changed (partial update)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param scheduleId Schedule ID (from sk)
 * @param updates Partial update fields (date, startTime, endTime, facilityId, etc.)
 * @returns Updated Schedule record
 */
export async function updateScheduleRecord(
  adminSub: string,
  scheduleId: string,
  updates: {
    date: string;
    startTime: string;
    endTime: string;
    facilityId: string;
    activityType: string;
    coachPhone: string;
    capacity: number;
    currentOccupancy?: number; // Current enrollment count
  }
): Promise<Schedule> {
  try {
    const client = generateClient<Schema>();

    // Build COMPLETE payload with all required fields and recalculated GSI keys
    // GSI keys must be recalculated because date/time may have changed
    const schedule = {
      pk: adminSub,
      sk: `SCHEDULE#${scheduleId}`,
      entityType: 'SCHEDULE' as const,
      // All required Schedule fields (not partial)
      date: updates.date,
      startTime: updates.startTime,
      endTime: updates.endTime,
      facilityId: updates.facilityId,
      activityType: updates.activityType,
      coachPhone: updates.coachPhone,
      capacity: updates.capacity,
      currentOccupancy: updates.currentOccupancy || 0,
      // GSI keys for querying and filtering
      gsi1pk: `${adminSub}#SCHEDULES`,
      gsi1sk: `COACH#${updates.coachPhone}#TIME#${updates.startTime}`,
      gsi2pk: `${adminSub}#SCHEDULES`,
      gsi2sk: `DATE#${updates.date}#TIME#${updates.startTime}`,
    };

    console.log('[DB Service] Updating schedule with payload:', schedule);

    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(schedule);

    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update record');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }

    if (!isSchedule(updatedRecord)) {
      console.error('[DB Service] Updated record failed type guard. Result:', updatedRecord);
      throw new Error('Updated record is not a Schedule');
    }

    console.log(`[DB Service] Schedule ${scheduleId} updated successfully`);
    return updatedRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update schedule';
    console.error('updateScheduleRecord error:', error);
    throw new Error(`Failed to update schedule: ${message}`);
  }
}

/**
 * Delete an existing schedule (activity)
 * 
 * Delete Strategy: Direct delete on pk + sk
 * - pk: <adminSub>
 * - sk: SCHEDULE#<scheduleId>
 * - Deletes the entire schedule record (cannot be undone)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param scheduleId Schedule ID (from sk)
 * @returns Deleted Schedule record
 */
export async function deleteScheduleRecord(
  adminSub: string,
  scheduleId: string
): Promise<Schedule> {
  try {
    const client = generateClient<Schema>();

    const { data: deletedRecord, errors } = await (client.models as any).ClubRecord.delete({
      pk: adminSub,
      sk: `SCHEDULE#${scheduleId}`,
    });

    if (errors) {
      console.error('[DB Service] Amplify Delete Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to delete record');
    }

    if (!deletedRecord) {
      throw new Error('Delete returned no data.');
    }

    if (!isSchedule(deletedRecord)) {
      throw new Error('Deleted record is not a Schedule');
    }

    console.log(`[DB Service] Schedule ${scheduleId} deleted successfully`);
    return deletedRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete schedule';
    console.error('deleteScheduleRecord error:', error);
    throw new Error(`Failed to delete schedule: ${message}`);
  }
}

/**
 * Create a new booking
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: BOOKING#<bookingId>#MEMBER#<memberPhone>#SCHEDULE#<scheduleId>
 * - gsi1pk: <adminSub>#MEMBER#<memberPhone>
 * - gsi1sk: BOOKING#DATETIME#<bookedAt>
 * - gsi2pk: <adminSub>#SCHEDULE#<scheduleId>
 * - gsi2sk: DATETIME#<bookedAt>
 *
 * @param adminSub Admin's Cognito SUB
 * @param bookingId Unique booking ID
 * @param memberPhone Member's phone
 * @param data Booking details
 * @returns Created Booking record
 */
export async function createBookingRecord(
  adminSub: string,
  bookingId: string,
  memberPhone: string,
  data: { 
    scheduleId: string; 
    coachPhone: string; 
    bookedAt: string;
    activityType?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  }
): Promise<Booking> {
  try {
    const client = generateClient<Schema>();

    const booking = createBooking(adminSub, bookingId, memberPhone, {
      scheduleId: data.scheduleId,
      coachPhone: data.coachPhone,
      bookedAt: data.bookedAt,
      activityType: data.activityType,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(booking);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create booking');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

    if (!isBooking(createdRecord)) {
      throw new Error('Created record is not a Booking');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create booking';
    console.error('createBookingRecord error:', error);
    throw new Error(`Failed to create booking: ${message}`);
  }
}

/**
 * Create a new package
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: PACKAGE#<packageId>#MEMBER#<memberPhone>
 * - gsi1pk: <adminSub>#MEMBER#<memberPhone>
 * - gsi1sk: PACKAGE#TYPE#<packageType>
 * - gsi2pk: <adminSub>#PACKAGES
 * - gsi2sk: EXPIRY#<validUntil>#TYPE#<packageType>
 *
 * @param adminSub Admin's Cognito SUB
 * @param packageId Unique package ID
 * @param memberPhone Member's phone
 * @param data Package details
 * @returns Created Package record
 */
export async function createPackageRecord(
  adminSub: string,
  packageId: string,
  memberPhone: string,
  data: {
    packageType: string;
    totalCredits: number;
    remainingCredits: number;
    price: number;
    validFrom: string; // YYYY-MM-DD
    validUntil: string; // YYYY-MM-DD
  }
): Promise<Package> {
  try {
    const client = generateClient<Schema>();

    const pkg = createPackage(adminSub, packageId, memberPhone, {
      packageType: data.packageType,
      totalCredits: data.totalCredits,
      remainingCredits: data.remainingCredits,
      price: data.price,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
    });

    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(pkg);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create package');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

    if (!isPackage(createdRecord)) {
      throw new Error('Created record is not a Package');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create package';
    console.error('createPackageRecord error:', error);
    throw new Error(`Failed to create package: ${message}`);
  }
}

/**
 * Create a new claim (session usage tracker)
 *
 * STD Pattern:
 * - pk: <adminSub>
 * - sk: CLAIM#<claimId>#BOOKING#<bookingId>
 * - gsi1pk: <adminSub>#BOOKING#<bookingId>
 * - gsi1sk: CLAIM#DATETIME#<createdAt>
 * - gsi2pk: <adminSub>#PACKAGES
 * - gsi2sk: DATE#<date>#PACKAGE#<packageId>
 *
 * @param adminSub Admin's Cognito SUB
 * @param claimId Unique claim ID
 * @param data Claim details
 * @returns Created Claim record
 */
export async function createClaimRecord(
  adminSub: string,
  claimId: string,
  data: {
    bookingId: string;
    packageId: string;
    creditsConsumed: number;
  }
): Promise<Claim> {
  try {
    const client = generateClient<Schema>();

    const claim = createClaim(adminSub, claimId, {
      bookingId: data.bookingId,
      packageId: data.packageId,
      creditsConsumed: data.creditsConsumed,
    });

    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(claim);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create claim');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }

    if (!isClaim(createdRecord)) {
      throw new Error('Created record is not a Claim');
    }

    return createdRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create claim';
    console.error('createClaimRecord error:', error);
    throw new Error(`Failed to create claim: ${message}`);
  }
}

/**
 * QUERY OPERATIONS: Type-Safe Reads
 *
 * Query functions use GSI patterns for efficient data retrieval
 */

/**
 * Get all active members
 *
 * Query Pattern:
 * - gsi1pk = <adminSub>#MEMBERS
 * - gsi1sk begins_with STATUS#ACTIVE
 *
 * @param adminSub Admin's Cognito SUB
 * @returns Array of active Member records
 */
export async function queryActiveMembersRecord(adminSub: string): Promise<Member[]> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#MEMBERS`,
      gsi1sk: { beginsWith: 'STATUS#ACTIVE' },
    });

    return (result.data || []).filter(isMember);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query active members';
    console.error('queryActiveMembersRecord error:', error);
    throw new Error(`Failed to query active members: ${message}`);
  }
}

/**
 * Get all coaches
 *
 * Query Pattern:
 * - gsi1pk = <adminSub>#COACHES
 *
 * @param adminSub Admin's Cognito SUB
 * @returns Array of Coach records
 */
export async function queryCoachesRecord(adminSub: string): Promise<Coach[]> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#COACHES`,
    });

    return (result.data || []).filter(isCoach);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query coaches';
    console.error('queryCoachesRecord error:', error);
    throw new Error(`Failed to query coaches: ${message}`);
  }
}

/**
 * Get schedules for a specific date
 *
 * Query Pattern:
 * - gsi2pk = <adminSub>#SCHEDULES
 * - gsi2sk begins_with DATE#<date>
 *
 * @param adminSub Admin's Cognito SUB
 * @param date Date in YYYY-MM-DD format
 * @returns Array of Schedule records
 */
export async function querySchedulesByDateRecord(adminSub: string, date: string): Promise<Schedule[]> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.listByGsi2({
      gsi2pk: `${adminSub}#SCHEDULES`,
      gsi2sk: { beginsWith: `DATE#${date}` },
    });

    return (result.data || []).filter(isSchedule);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query schedules';
    console.error('querySchedulesByDateRecord error:', error);
    throw new Error(`Failed to query schedules: ${message}`);
  }
}

/**
 * Get all packages
 *
 * Query Pattern:
 * - gsi2pk = <adminSub>#PACKAGES
 *
 * @param adminSub Admin's Cognito SUB
 * @returns Array of Package records
 */
export async function queryPackagesRecord(adminSub: string): Promise<Package[]> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.listByGsi2({
      gsi2pk: `${adminSub}#PACKAGES`,
    });

    return (result.data || []).filter(isPackage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query packages';
    console.error('queryPackagesRecord error:', error);
    throw new Error(`Failed to query packages: ${message}`);
  }
}

/**
 * Get a specific member
 *
 * Query Pattern:
 * - pk = <adminSub>
 * - sk = MEMBER#<phone>
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Member's phone
 * @returns Member record or null if not found
 */
export async function getMemberByPhoneRecord(adminSub: string, phone: string): Promise<Member | null> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `MEMBER#${phone}`,
    });

    if (!result) return null;
    if (!isMember(result)) throw new Error('Retrieved record is not a Member');

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get member';
    console.error('getMemberByPhoneRecord error:', error);
    throw new Error(`Failed to get member: ${message}`);
  }
}

/**
 * Get a specific coach
 *
 * Query Pattern:
 * - pk = <adminSub>
 * - sk = COACH#<phone>
 *
 * @param adminSub Admin's Cognito SUB
 * @param phone Coach's phone
 * @returns Coach record or null if not found
 */
export async function getCoachByPhoneRecord(adminSub: string, phone: string): Promise<Coach | null> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `COACH#${phone}`,
    });

    if (!result) return null;
    if (!isCoach(result)) throw new Error('Retrieved record is not a Coach');

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get coach';
    console.error('getCoachByPhoneRecord error:', error);
    throw new Error(`Failed to get coach: ${message}`);
  }
}

/**
 * REAL-TIME SUBSCRIPTION OPERATIONS
 *
 * These functions set up AppSync subscriptions for live data updates.
 * They use client.models.ClubRecord.observeQuery() filtered by GSI1 patterns.
 * The returned unsubscribe function MUST be called on component unmount to prevent memory leaks.
 */

/**
 * Subscribe to real-time coach updates
 *
 * Observes all coaches for the given admin using GSI1.
 * Filters by gsi1pk = <adminSub>#COACHES
 *
 * @param adminSub Admin's Cognito SUB
 * @param callback Callback fired when coaches change
 * @returns Unsubscribe function (call on unmount)
 */
export function observeCoaches(
  adminSub: string,
  callback: (data: Coach[]) => void
): (() => void) {
  console.log(`[DB Service] Starting Coach subscription for: ${adminSub}#COACHES`);
  
  const client = generateClient<Schema>();
  
  const subscription = (client.models as any).ClubRecord.observeQuery({
    filter: {
      gsi1pk: { eq: `${adminSub}#COACHES` }
    }
  }).subscribe({
    next: ({ items, isSynced }: { items: any[]; isSynced: boolean }) => {
      console.log(`[DB Service] Coach sync status: ${isSynced}, Items found:`, items.length);
      const coaches = items.filter(isCoach) as Coach[];
      callback(coaches);
    },
    error: (err: Error) => {
      console.error('[DB Service] Coach subscription error:', err);
    }
  });
  
  return () => {
    console.log(`[DB Service] Unsubscribing from Coach updates`);
    subscription.unsubscribe();
  };
}

/**
 * Subscribe to real-time member updates
 *
 * Observes all members for the given admin using GSI1.
 * Filters by gsi1pk = <adminSub>#MEMBERS
 *
 * @param adminSub Admin's Cognito SUB
 * @param callback Callback fired when members change
 * @returns Unsubscribe function (call on unmount)
 */
export function observeMembers(
  adminSub: string,
  callback: (data: Member[]) => void
): (() => void) {
  console.log(`[DB Service] Starting Member subscription for: ${adminSub}#MEMBERS`);
  
  const client = generateClient<Schema>();
  
  const subscription = (client.models as any).ClubRecord.observeQuery({
    filter: {
      gsi1pk: { eq: `${adminSub}#MEMBERS` }
    }
  }).subscribe({
    next: ({ items, isSynced }: { items: any[]; isSynced: boolean }) => {
      console.log(`[DB Service] Member sync status: ${isSynced}, Items found:`, items.length);
      const members = items.filter(isMember) as Member[];
      callback(members);
    },
    error: (err: Error) => {
      console.error('[DB Service] Member subscription error:', err);
    }
  });
  
  return () => {
    console.log(`[DB Service] Unsubscribing from Member updates`);
    subscription.unsubscribe();
  };
}


// ============================================================================
// FACILITY OPERATIONS: Dancing Halls Management (INDEX-BASED QUERIES ONLY)
// ============================================================================

/**
 * Create a new Facility record (Dancing Hall)
 * 
 * STD Pattern:
 * - pk: adminSub
 * - sk: FACILITY#{facilityId}
 * - gsi1pk: {adminSub}#FACILITIES (enables GSI1 query)
 * - gsi1sk: STATUS#{status}#NAME#{name} (for filtering + sorting)
 *
 * Query Strategy: Direct PUT (no scan)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param facilityData Facility object with required fields
 * @returns Created Facility record
 */
export async function createFacilityRecord(
  adminSub: string,
  facilityData: {
    facilityId: string;
    name: string;
    capacity: number;
    location: string;
    description?: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    currentOccupancy?: number;
  }
): Promise<any> {
  console.log(`[DB Service] Creating Facility: ${facilityData.name}`);
  
  const client = generateClient<Schema>();
  
  const facility = {
    pk: adminSub,
    sk: `FACILITY#${facilityData.facilityId}`,
    entityType: 'FACILITY',
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: `STATUS#${facilityData.status}#NAME#${facilityData.name}`,
    name: facilityData.name,
    capacity: facilityData.capacity,
    location: facilityData.location,
    description: facilityData.description || '',
    status: facilityData.status,
    currentOccupancy: facilityData.currentOccupancy || 0,
  };
  
  try {
    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(facility);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create record');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }
    console.log(`[DB Service] Facility created: ${facilityData.name}`);
    return createdRecord;
  } catch (error) {
    console.error('[DB Service] Failed to create facility:', error);
    throw error;
  }
}

/**
 * Get a Facility by ID (Direct PK/SK lookup - NO SCAN)
 * 
 * Query Strategy: Direct GET on primary keys (O(1) operation)
 * - Uses pk=adminSub + sk=FACILITY#{facilityId}
 * - No scan, no index needed
 * 
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 * @returns Facility record or null
 */
export async function getFacilityByIdRecord(
  adminSub: string,
  facilityId: string
): Promise<any | null> {
  console.log(`[DB Service] Getting Facility: ${facilityId}`);
  
  const client = generateClient<Schema>();
  
  try {
    const result = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `FACILITY#${facilityId}`,
    });
    
    if (result && result.data) {
      console.log(`[DB Service] Facility found: ${result.data.name}`);
      return result.data;
    }
    
    console.log(`[DB Service] Facility not found: ${facilityId}`);
    return null;
  } catch (error) {
    console.error('[DB Service] Failed to get facility:', error);
    return null;
  }
}

/**
 * Update a Facility record
 * 
 * Query Strategy: Direct UPDATE on primary keys
 * - Uses pk=adminSub + sk=FACILITY#{facilityId}
 * - Regenerates gsi1sk with new status/name
 * 
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 * @param updates Fields to update
 * @returns Updated Facility record
 */
export async function updateFacilityRecord(
  adminSub: string,
  facilityId: string,
  updates: Partial<{
    name: string;
    capacity: number;
    location: string;
    description: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    currentOccupancy: number;
  }>
): Promise<any> {
  console.log(`[DB Service] Updating Facility: ${facilityId}`);
  
  const client = generateClient<Schema>();
  
  // First, get current facility to preserve required fields
  const current = await getFacilityByIdRecord(adminSub, facilityId);
  if (!current) {
    throw new Error(`Facility not found: ${facilityId}`);
  }
  
  const updated = {
    pk: adminSub,
    sk: `FACILITY#${facilityId}`,
    entityType: 'FACILITY',
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: `STATUS#${updates.status || current.status}#NAME#${updates.name || current.name}`,
    name: updates.name || current.name,
    capacity: updates.capacity !== undefined ? updates.capacity : current.capacity,
    location: updates.location || current.location,
    description: updates.description !== undefined ? updates.description : current.description,
    status: updates.status || current.status,
    currentOccupancy: updates.currentOccupancy !== undefined ? updates.currentOccupancy : current.currentOccupancy,
  };
  
  try {
    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(updated);

    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update record');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }
    console.log(`[DB Service] Facility updated: ${facilityId}`);
    return updatedRecord;
  } catch (error) {
    console.error('[DB Service] Failed to update facility:', error);
    throw error;
  }
}

/**
 * Delete a Facility record
 * 
 * Query Strategy: Direct DELETE on primary keys (O(1) operation)
 * - Uses pk=adminSub + sk=FACILITY#{facilityId}
 * - No scan, no index needed
 * 
 * @param adminSub Admin's Cognito SUB
 * @param facilityId Facility ID
 * @returns Result of deletion
 */
export async function deleteFacilityRecord(
  adminSub: string,
  facilityId: string
): Promise<any> {
  console.log(`[DB Service] Deleting Facility: ${facilityId}`);
  
  const client = generateClient<Schema>();
  
  try {
    const { data: deletedRecord, errors } = await (client.models as any).ClubRecord.delete({
      pk: adminSub,
      sk: `FACILITY#${facilityId}`,
    });

    if (errors) {
      console.error('[DB Service] Amplify Delete Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to delete record');
    }

    if (!deletedRecord) {
      throw new Error('Delete returned no data.');
    }
    
    console.log(`[DB Service] Facility deleted: ${facilityId}`);
    return deletedRecord;
  } catch (error) {
    console.error('[DB Service] Failed to delete facility:', error);
    throw error;
  }
}

/**
 * Query all Facilities for an admin (GSI1 Query - NO TABLE SCAN)
 * 
 * Query Strategy: GSI1 Query
 * - gsi1pk = "{adminSub}#FACILITIES"
 * - Sorts by gsi1sk (STATUS#...#NAME#...)
 * - Returns sorted, filtered results
 * - NO table scan (query is on GSI1 partition)
 * 
 * @param adminSub Admin's Cognito SUB
 * @returns Array of Facility records
 */
export async function queryAllFacilitiesRecord(
  adminSub: string
): Promise<any[]> {
  console.log(`[DB Service] Querying all Facilities for: ${adminSub}`);
  
  const client = generateClient<Schema>();
  
  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#FACILITIES`,
    });
    
    const facilities = result.data || [];
    console.log(`[DB Service] Found ${facilities.length} facilities`);
    return facilities;
  } catch (error) {
    console.error('[DB Service] Failed to query facilities:', error);
    return [];
  }
}

/**
 * Query Facilities by status (GSI1 Range Query - NO TABLE SCAN)
 * 
 * Query Strategy: GSI1 Range Query
 * - gsi1pk = "{adminSub}#FACILITIES"
 * - gsi1sk BEGINS_WITH "STATUS#{status}"
 * - Results automatically sorted by name (secondary part of gsi1sk)
 * - NO table scan (range query on GSI1)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param status Facility status filter (ACTIVE, INACTIVE, MAINTENANCE)
 * @returns Array of Facility records with matching status
 */
export async function queryFacilitiesByStatusRecord(
  adminSub: string,
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
): Promise<any[]> {
  console.log(`[DB Service] Querying Facilities by status: ${status}`);
  
  const client = generateClient<Schema>();
  
  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#FACILITIES`,
      gsi1sk: { beginsWith: `STATUS#${status}` },
    });
    
    const facilities = result.data || [];
    console.log(`[DB Service] Found ${facilities.length} facilities with status ${status}`);
    return facilities;
  } catch (error) {
    console.error('[DB Service] Failed to query facilities by status:', error);
    return [];
  }
}

/**
 * Subscribe to real-time facility updates (GSI1 Subscription - NO TABLE SCAN)
 * 
 * Subscription Strategy: observeQuery on GSI1
 * - gsi1pk = "{adminSub}#FACILITIES"
 * - Real-time updates as facilities are added/modified/deleted
 * - NO table scan (subscription is on GSI1 partition)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param callback Called when facilities change
 * @returns Unsubscribe function
 */
export function observeFacilitiesRecord(
  adminSub: string,
  callback: (data: any[]) => void
): (() => void) {
  console.log(`[DB Service] Starting Facility subscription for: ${adminSub}#FACILITIES`);
  
  const client = generateClient<Schema>();
  
  const subscription = (client.models as any).ClubRecord.observeQuery({
    filter: {
      gsi1pk: { eq: `${adminSub}#FACILITIES` },
    },
  }).subscribe({
    next: ({ items, isSynced }: { items: any[]; isSynced: boolean }) => {
      console.log(`[DB Service] Facility sync status: ${isSynced}, Items found:`, items.length);
      callback(items);
    },
    error: (err: Error) => {
      console.error('[DB Service] Facility subscription error:', err);
    },
  });
  
  return () => {
    console.log(`[DB Service] Unsubscribing from Facility updates`);
    subscription.unsubscribe();
  };
}




// ============================================================================
// CATALOG OPERATIONS: Package Template Management (INDEX-BASED QUERIES ONLY)
// ============================================================================

/**
 * Create a new Catalog (Package Template) record
 * 
 * STD Pattern:
 * - pk: adminSub
 * - sk: CATALOG#{packageId}
 * - gsi1pk: {adminSub}#CATALOG
 * - gsi1sk: STATUS#{status}#EXPIRY#{validUntil}
 * - gsi2pk: {adminSub}#CATALOG
 * - gsi2sk: LAUNCH#{validFrom}
 * 
 * Query Strategy: Direct PUT (O(1) operation, no scan)
 */
export async function createCatalogTemplate(
  adminSub: string,
  packageId: string,
  catalogData: {
    name: string;
    totalCredits: number;
    price: number;
    validFrom: string;
    validUntil: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
    description?: string;
  }
): Promise<any> {
  console.log(`[DB Service] Creating Catalog Template: ${catalogData.name}`);

  const client = generateClient<Schema>();

  const catalog = {
    pk: adminSub,
    sk: `CATALOG#${packageId}`,
    entityType: 'CATALOG',
    gsi1pk: `${adminSub}#CATALOG`,
    gsi1sk: `STATUS#${catalogData.status}#EXPIRY#${catalogData.validUntil}`,
    gsi2pk: `${adminSub}#CATALOG`,
    gsi2sk: `LAUNCH#${catalogData.validFrom}`,
    packageId,
    name: catalogData.name,
    totalCredits: catalogData.totalCredits,
    price: catalogData.price,
    validFrom: catalogData.validFrom,
    validUntil: catalogData.validUntil,
    status: catalogData.status,
    description: catalogData.description || '',
  };

  try {
    const { data: createdRecord, errors } = await (client.models as any).ClubRecord.create(catalog);

    if (errors) {
      console.error('[DB Service] Amplify Create Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to create catalog');
    }

    if (!createdRecord) {
      throw new Error('Create returned no data.');
    }
    console.log(`[DB Service] Catalog created: ${catalogData.name}`);
    return createdRecord;
  } catch (error) {
    console.error('[DB Service] Failed to create catalog:', error);
    throw error;
  }
}

/**
 * Query all active Catalog templates (GSI1 Range Query - NO TABLE SCAN)
 */
export async function queryActiveCatalogsRecord(adminSub: string): Promise<any[]> {
  console.log(`[DB Service] Querying active Catalog templates for: ${adminSub}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#CATALOG`,
      gsi1sk: { beginsWith: 'STATUS#ACTIVE' },
    });

    const catalogs = result.data || [];
    console.log(`[DB Service] Found ${catalogs.length} active catalogs`);
    return catalogs;
  } catch (error) {
    console.error('[DB Service] Failed to query active catalogs:', error);
    return [];
  }
}

/**
 * Get all Catalogs (both active and inactive) for the admin (GSI1 Query - NO TABLE SCAN)
 */
export async function queryAllCatalogsRecord(adminSub: string): Promise<any[]> {
  console.log(`[DB Service] Querying all Catalog templates for: ${adminSub}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#CATALOG`,
    });

    const catalogs = result.data || [];
    console.log(`[DB Service] Found ${catalogs.length} catalogs (all statuses)`);
    return catalogs;
  } catch (error) {
    console.error('[DB Service] Failed to query all catalogs:', error);
    return [];
  }
}

// ============================================================================
// PACKAGE ENROLLMENT OPERATIONS: Member Package Analytics (INDEX-BASED QUERIES ONLY)
// ============================================================================

/**
 * Update member package status (e.g., ACTIVE → EXHAUSTED → DROPPED)
 * 
 * Query Strategy: Direct UPDATE on primary keys (O(1) operation, no scan)
 */
export async function updatePackageStatusRecord(
  adminSub: string,
  memberPhone: string,
  packageId: string,
  status: 'ACTIVE' | 'EXHAUSTED' | 'DROPPED',
  remainingCredits: number
): Promise<any> {
  console.log(`[DB Service] Updating package status for ${memberPhone}: ${packageId} -> ${status}`);

  const client = generateClient<Schema>();

  try {
    const current = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `PKG#${memberPhone}#${packageId}`,
    });

    if (!current.data) {
      throw new Error(`Package enrollment not found: ${memberPhone} -> ${packageId}`);
    }

    const updated = {
      ...current.data,
      gsi1sk: `PKGSTATUS#${status}`,
      remainingCredits,
    };

    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(updated);
    
    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update package status');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }

    console.log(`[DB Service] Package status updated: ${status}`);
    return updatedRecord;
  } catch (error) {
    console.error('[DB Service] Failed to update package status:', error);
    throw error;
  }
}

/**
 * Fetch real-time enrollment statistics for a specific package template
 * 
 * Query Pattern: GSI2 Query
 * - gsi2pk = {adminSub}#PACKAGETYPE#{packageId}
 * - Returns ALL enrollments (any status) for this package
 * - NO table scan (partition query on GSI2)
 * 
 * Read-Time Aggregation:
 * - Parse enrollment array locally
 * - Count total + filter by gsi1sk status prefix
 */
export async function getPackageEnrollmentStats(
  adminSub: string,
  packageId: string
): Promise<{
  packageId: string;
  totalHistoricallyEnrolled: number;
  active: number;
  exhausted: number;
  dropped: number;
}> {
  console.log(`[DB Service] Fetching enrollment stats for package: ${packageId}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi2({
      gsi2pk: `${adminSub}#PACKAGETYPE#${packageId}`,
    });

    const enrollments = result.data || [];
    console.log(`[DB Service] Retrieved ${enrollments.length} enrollments for analytics`);

    const active = enrollments.filter((e: any) => e.gsi1sk?.includes('PKGSTATUS#ACTIVE')).length;
    const exhausted = enrollments.filter((e: any) => e.gsi1sk?.includes('PKGSTATUS#EXHAUSTED')).length;
    const dropped = enrollments.filter((e: any) => e.gsi1sk?.includes('PKGSTATUS#DROPPED')).length;

    const stats = {
      packageId,
      totalHistoricallyEnrolled: enrollments.length,
      active,
      exhausted,
      dropped,
    };

    console.log(`[DB Service] Enrollment stats computed:`, stats);
    return stats;
  } catch (error) {
    console.error('[DB Service] Failed to fetch enrollment stats:', error);
    return {
      packageId,
      totalHistoricallyEnrolled: 0,
      active: 0,
      exhausted: 0,
      dropped: 0,
    };
  }
}



/**
 * Update a Catalog (Package Template) record
 * 
 * Query Strategy: Direct UPDATE on primary keys (O(1) operation, no scan)
 * - Uses pk=adminSub + sk=CATALOG#{packageId}
 * - Regenerates gsi1sk with new status/validUntil for filtering
 * 
 * @param adminSub Admin's Cognito SUB
 * @param packageId Package template ID
 * @param updates Fields to update (name, price, totalCredits, validFrom, validUntil, status, description)
 * @returns Updated Catalog record
 */
export async function updateCatalogTemplate(
  adminSub: string,
  packageId: string,
  updates: Partial<{
    name: string;
    totalCredits: number;
    price: number;
    validFrom: string;
    validUntil: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
    description?: string;
  }>
): Promise<any> {
  console.log(`[DB Service] Updating Catalog Template: ${packageId}`);

  const client = generateClient<Schema>();

  try {
    // First, get current catalog to preserve required fields
    const current = await (client.models as any).ClubRecord.get({
      pk: adminSub,
      sk: `CATALOG#${packageId}`,
    });

    if (!current.data) {
      throw new Error(`Catalog not found: ${packageId}`);
    }

    const updated = {
      ...current.data,
      name: updates.name ?? current.data.name,
      totalCredits: updates.totalCredits ?? current.data.totalCredits,
      price: updates.price ?? current.data.price,
      validFrom: updates.validFrom ?? current.data.validFrom,
      validUntil: updates.validUntil ?? current.data.validUntil,
      status: updates.status ?? current.data.status,
      description: updates.description ?? current.data.description,
      gsi1sk: `STATUS#${updates.status ?? current.data.status}#EXPIRY#${updates.validUntil ?? current.data.validUntil}`,
    };

    const { data: updatedRecord, errors } = await (client.models as any).ClubRecord.update(updated);
    
    if (errors) {
      console.error('[DB Service] Amplify Update Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to update catalog');
    }

    if (!updatedRecord) {
      throw new Error('Update returned no data.');
    }

    console.log(`[DB Service] Catalog updated: ${packageId}`);
    return updatedRecord;
  } catch (error) {
    console.error('[DB Service] Failed to update catalog:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time Catalog template updates (GSI1 Subscription - NO TABLE SCAN)
 * 
 * Subscription Strategy: observeQuery on GSI1
 * - gsi1pk = "{adminSub}#CATALOG"
 * - Real-time updates as catalogs are added/modified/deleted
 * - NO table scan (subscription is on GSI1 partition)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param callback Called when catalogs change
 * @returns Unsubscribe function
 */
export function observeCatalogTemplates(
  adminSub: string,
  callback: (data: any[]) => void
): (() => void) {
  console.log(`[DB Service] Starting Catalog subscription for: ${adminSub}#CATALOG`);

  const client = generateClient<Schema>();

  const subscription = (client.models as any).ClubRecord.observeQuery({
    filter: {
      gsi1pk: { eq: `${adminSub}#CATALOG` },
    },
  }).subscribe({
    next: ({ items, isSynced }: { items: any[]; isSynced: boolean }) => {
      console.log(`[DB Service] Catalog sync status: ${isSynced}, Items found:`, items.length);
      callback(items);
    },
    error: (err: Error) => {
      console.error('[DB Service] Catalog subscription error:', err);
    },
  });

  return () => {
    console.log(`[DB Service] Unsubscribing from Catalog updates`);
    subscription.unsubscribe();
  };
}



// ============================================================================
// SCHEDULE OPERATIONS: Activities & Classes (Real-Time Range Queries)
// ============================================================================

/**
 * Subscribe to schedules within a date range (GSI2 Between Query - NO TABLE SCAN)
 * 
 * Subscription Strategy: observeQuery on GSI2 with range
 * - gsi2pk = "{adminSub}#SCHEDULES"
 * - gsi2sk BETWEEN "DATE#{startDate}" AND "DATE#{endDate}T23:59:59"
 * - Real-time updates as schedules are added/modified/deleted
 * - NO table scan (subscription is on GSI2 partition with range)
 * 
 * @param adminSub Admin's Cognito SUB
 * @param startDate Start date (YYYY-MM-DD format)
 * @param endDate End date (YYYY-MM-DD format)
 * @param callback Called when schedules change
 * @returns Unsubscribe function
 */
export function observeSchedulesByDateRange(
  adminSub: string,
  startDate: string,
  endDate: string,
  callback: (data: any[]) => void
): (() => void) {
  console.log(`[DB Service] Starting Schedule subscription for: ${startDate} to ${endDate}`);

  const client = generateClient<Schema>();

  const subscription = (client.models as any).ClubRecord.observeQuery({
    filter: {
      and: [
        { gsi2pk: { eq: `${adminSub}#SCHEDULES` } },
        {
          gsi2sk: {
            between: [
              `DATE#${startDate}`,
              `DATE#${endDate}T23:59:59`
            ]
          }
        }
      ]
    }
  }).subscribe({
    next: ({ items, isSynced }: { items: any[]; isSynced: boolean }) => {
      console.log(`[DB Service] Schedule sync status: ${isSynced}, Items found:`, items.length);
      callback(items);
    },
    error: (err: Error) => {
      console.error('[DB Service] Schedule subscription error:', err);
    },
  });

  return () => {
    console.log(`[DB Service] Unsubscribing from Schedule updates`);
    subscription.unsubscribe();
  };
}

/**
 * Query all active Coaches (for activity scheduling dropdown)
 * 
 * Query Strategy: GSI1 Range Query (NO TABLE SCAN)
 * - gsi1pk = "{adminSub}#COACHES"
 * - gsi1sk BEGINS_WITH "STATUS#ACTIVE"
 * - Returns coaches available for scheduling
 * 
 * @param adminSub Admin's Cognito SUB
 * @returns Array of active Coach records
 */
export async function queryCoachesForScheduling(adminSub: string): Promise<any[]> {
  console.log(`[DB Service] Querying active coaches for: ${adminSub}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#COACHES`,
      gsi1sk: { beginsWith: 'STATUS#ACTIVE' },
    });

    const coaches = result.data || [];
    console.log(`[DB Service] Found ${coaches.length} active coaches`);
    return coaches;
  } catch (error) {
    console.error('[DB Service] Failed to query coaches:', error);
    return [];
  }
}

/**
 * Query all active Facilities (for activity scheduling dropdown)
 * 
 * Query Strategy: GSI1 Query (NO TABLE SCAN)
 * - gsi1pk = "{adminSub}#FACILITIES"
 * - Returns all facilities regardless of expiry (admin can schedule in any facility)
 * 
 * @param adminSub Admin's Cognito SUB
 * @returns Array of Facility records
 */
export async function queryFacilitiesForScheduling(adminSub: string): Promise<any[]> {
  console.log(`[DB Service] Querying facilities for: ${adminSub}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#FACILITIES`,
    });

    const facilities = result.data || [];
    console.log(`[DB Service] Found ${facilities.length} facilities`);
    return facilities;
  } catch (error) {
    console.error('[DB Service] Failed to query facilities:', error);
    return [];
  }
}


// ============================================================================
// UNIFIED EXPORT: All functions exported here (ONE export default only)
// ============================================================================


/**
 * Delete a booking record
 * 
 * Delete Pattern:
 * - pk: <adminSub>
 * - sk: BOOKING#<bookingId>#MEMBER#<memberPhone>#SCHEDULE#<scheduleId>
 */
export async function deleteBookingRecord(
  adminSub: string,
  bookingId: string,
  memberPhone: string,
  scheduleId: string
): Promise<void> {
  try {
    const client = generateClient<Schema>();

    const { data: deletedRecord, errors } = await (client.models as any).ClubRecord.delete({
      pk: adminSub,
      sk: `BOOKING#${bookingId}#MEMBER#${memberPhone}#SCHEDULE#${scheduleId}`,
    });

    if (errors) {
      console.error('[DB Service] Amplify Delete Errors:', errors);
      throw new Error(errors[0]?.message || 'Failed to delete booking');
    }

    if (!deletedRecord) {
      throw new Error('Delete returned no data.');
    }

    console.log(`[DB Service] Booking ${bookingId} deleted successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete booking';
    console.error('[DB Service] deleteBookingRecord error:', error);
    throw new Error(`Failed to delete booking: ${message}`);
  }
}

/**
 * Query all bookings for a specific schedule
 * 
 * Query Pattern: GSI2 query (ZERO table scans)
 * - gsi2pk: <adminSub>#SCHEDULE#<scheduleId>
 * 
 * @param adminSub Admin's Cognito SUB
 * @param scheduleId Schedule ID to query bookings for
 * @returns Array of booking records with member phone enrollment
 */
export async function queryBookingsBySchedule(
  adminSub: string,
  scheduleId: string
): Promise<any[]> {
  console.log(`[DB Service] Querying bookings for schedule: ${scheduleId}`);

  const client = generateClient<Schema>();

  try {
    const result = await (client.models as any).ClubRecord.listByGsi2({
      gsi2pk: `${adminSub}#SCHEDULE#${scheduleId}`,
    });

    const bookings = result.data || [];
    console.log(`[DB Service] Found ${bookings.length} bookings for schedule ${scheduleId}`);
    return bookings;
  } catch (error) {
    console.error('[DB Service] Failed to query bookings by schedule:', error);
    return [];
  }
}

export default {
  // CRUD Operations
  createMemberRecord,
  updateMemberRecord,
  createCoachRecord,
  updateCoachRecord,
  deleteCoachRecord,
  createScheduleRecord,
  updateScheduleRecord,
  deleteScheduleRecord,
  createBookingRecord,
  deleteBookingRecord,
  queryBookingsBySchedule,
  createPackageRecord,
  createClaimRecord,

  // Query Operations
  queryActiveMembersRecord,
  queryCoachesRecord,
  querySchedulesByDateRecord,
  queryPackagesRecord,
  getMemberByPhoneRecord,
  getCoachByPhoneRecord,

  // Subscription Operations
  observeCoaches,
  observeMembers,
  observeSchedulesByDateRange,

  // Facility Operations
  createFacilityRecord,
  getFacilityByIdRecord,
  updateFacilityRecord,
  deleteFacilityRecord,
  queryAllFacilitiesRecord,
  queryFacilitiesByStatusRecord,
  observeFacilitiesRecord,

  // Catalog Operations (Package Templates)
  createCatalogTemplate,
  updateCatalogTemplate,
  queryActiveCatalogsRecord,
  queryAllCatalogsRecord,
  observeCatalogTemplates,

  // Scheduling Query Operations
  queryCoachesForScheduling,
  queryFacilitiesForScheduling,

  // Package Enrollment Operations
  updatePackageStatusRecord,
  getPackageEnrollmentStats,
};

/**
 * Query all bookings for a specific member
 *
 * Query Pattern:
 * - gsi1pk = <adminSub>#MEMBER#<memberPhone>
 * - gsi1sk begins with BOOKING#
 *
 * @param adminSub Admin's Cognito SUB
 * @param memberPhone Member's phone number
 * @returns Array of Booking records
 */
export async function queryBookingsByMember(
  adminSub: string,
  memberPhone: string
): Promise<any[]> {
  try {
    const client = generateClient<Schema>();

    const result = await (client.models as any).ClubRecord.listByGsi1({
      gsi1pk: `${adminSub}#MEMBER#${memberPhone}`,
      gsi1sk: { beginsWith: 'BOOKING#' },
    });

    return (result.data || []).map((item: any) => ({
      bookingId: item.sk?.replace('BOOKING#', ''),
      scheduleId: item.scheduleId,
      coachPhone: item.coachPhone,
      memberPhone: item.memberPhone,
      bookedAt: item.bookedAt || item.createdAt,
      // Include denormalized schedule data stored on booking
      activityType: item.activityType,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query bookings';
    console.error('queryBookingsByMember error:', error);
    throw new Error(`Failed to query bookings for member: ${message}`);
  }
}
