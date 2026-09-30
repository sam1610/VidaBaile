/**
 * @vitest-environment node
 *
 * vidaBaileSchedulingEngine — unit tests for the deterministic scheduling pipeline.
 *
 * Strategy
 * ─────────
 * All DynamoDB calls are intercepted with aws-sdk-client-mock.
 * The mock is ordered to match the exact call sequence the handler makes:
 *
 *   Call 1  QueryCommand — fetchPendingBookings (GSI1: #BOOKINGS + PENDING_SCHEDULING)
 *   Call 2  QueryCommand — fetchFacilities      (pk=adminSub, sk begins_with FACILITY#)
 *   Call 3  QueryCommand — fetchMatchingCoaches (pk=adminSub, sk begins_with COACH#)
 *   Call 4  QueryCommand — isCoachOnLeave       (GSI1: #UNAVAIL#<phone> BETWEEN …)
 *   Call 5  QueryCommand — isCoachAlreadyBooked (GSI2: #SCHEDULES + date prefix)
 *   Call 6  PutItemCommand  — writeDraftSchedule
 *   Calls 7-9 UpdateItemCommand × 3 — patchBookings (one per booking)
 *
 * Test Case A verifies grouping (headcount = 3, single group).
 * Test Case B verifies DynamoDB writes: PutItemCommand has status DRAFT_PROPOSAL,
 *   UpdateItemCommand × 3 each patch status → DRAFT_PROPOSAL.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// ── DynamoDB mock ────────────────────────────────────────────────────────────
const ddbMock = mockClient(DynamoDBClient);

// ── Shared constants ─────────────────────────────────────────────────────────
const ADMIN_SUB   = 'test-admin-sub-001';
const DANCE_STYLE = 'Salsa';
const SCHED_DATE  = '2026-10-15';
const COACH_PHONE = '+97333001001';
const FACILITY_ID = 'hall-1';

// ── Mock DynamoDB item builders ──────────────────────────────────────────────

function makePendingBooking(index: number) {
  const id = `booking-id-${index}`;
  const phone = `+9733300000${index}`;
  return {
    pk:         { S: ADMIN_SUB },
    sk:         { S: `BOOKING#${id}#MEMBER#${phone}` },
    entityType: { S: 'BOOKING' },
    gsi1pk:     { S: `${ADMIN_SUB}#BOOKINGS` },
    gsi1sk:     { S: 'STATUS#PENDING_SCHEDULING' },
    gsi2pk:     { S: `${ADMIN_SUB}#BOOKINGS` },
    gsi2sk:     { S: `DATE#${SCHED_DATE}` },
    date:       { S: SCHED_DATE },
    packageId:  { S: DANCE_STYLE },
    startTime:  { S: '18:00:00' },
    status:     { S: 'PENDING_SCHEDULING' },
  };
}

function makeFacilityItem() {
  return {
    pk:         { S: ADMIN_SUB },
    sk:         { S: `FACILITY#${FACILITY_ID}` },
    entityType: { S: 'FACILITY' },
    name:       { S: 'Hall 1' },
    capacity:   { N: '20' },
    status:     { S: 'ACTIVE' },
  };
}

function makeCoachItem() {
  return {
    pk:         { S: ADMIN_SUB },
    sk:         { S: `COACH#${COACH_PHONE}` },
    entityType: { S: 'COACH' },
    name:       { S: 'Juan Martinez' },
    specialty:  { S: 'Salsa, Bachata' },
    status:     { S: 'ACTIVE' },
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('vidaBaileSchedulingEngine', () => {

  beforeEach(() => {
    ddbMock.reset();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test Case A — Grouping
  // 3 bookings on the same date + packageId must collapse into 1 group
  // with headcount = 3.  We verify this by checking the PutItemCommand
  // writes capacity = 3 and currentOccupancy = 3.
  // ─────────────────────────────────────────────────────────────────────────
  it('A: Groups 3 same-date same-style bookings into a single headcount:3 slot', async () => {
    const bookings = [
      makePendingBooking(1),
      makePendingBooking(2),
      makePendingBooking(3),
    ];

    // Ordered mock responses — one per QueryCommand call the handler issues
    ddbMock
      // Call 1: fetchPendingBookings
      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi1pkAndGsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: `${ADMIN_SUB}#BOOKINGS` },
          ':prefix': { S: 'STATUS#PENDING_SCHEDULING' },
        },
      })
      .resolves({ Items: bookings, Count: 3, LastEvaluatedKey: undefined })

      // Call 2: fetchFacilities
      .on(QueryCommand, {
        ExpressionAttributeValues: {
          ':pk':     { S: ADMIN_SUB },
          ':prefix': { S: 'FACILITY#' },
        },
      })
      .resolves({ Items: [makeFacilityItem()], Count: 1 })

      // Call 3: fetchMatchingCoaches
      .on(QueryCommand, {
        ExpressionAttributeValues: {
          ':pk':     { S: ADMIN_SUB },
          ':prefix': { S: 'COACH#' },
          ':active': { S: 'ACTIVE' },
        },
      })
      .resolves({ Items: [makeCoachItem()], Count: 1 })

      // Call 4: isCoachOnLeave — return 0 (not on leave)
      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi1pkAndGsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: `${ADMIN_SUB}#UNAVAIL#${COACH_PHONE}` },
        },
      })
      .resolves({ Items: [], Count: 0 })

      // Call 5: isCoachAlreadyBooked — return 0 (no conflict)
      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi2pkAndGsi2sk',
        ExpressionAttributeValues: {
          ':gsi2pk': { S: `${ADMIN_SUB}#SCHEDULES` },
        },
      })
      .resolves({ Items: [], Count: 0 });

    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(UpdateItemCommand).resolves({});

    // Act
    const { handler } = await import(
      '../../amplify/functions/vidaBaileSchedulingEngine/handler.js'
    ).catch(() =>
      import('../../amplify/functions/vidaBaileSchedulingEngine/handler')
    );

    const result = await handler({ arguments: { adminSub: ADMIN_SUB } });

    // One group → one schedule written
    expect(result.processed).toBe(1);
    expect(result.schedules).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    // PutItemCommand must reflect headcount = 3
    const putCalls = ddbMock.commandCalls(PutItemCommand);
    expect(putCalls).toHaveLength(1);

    const item = putCalls[0].args[0].input.Item ?? {};
    expect(item.capacity?.N).toBe('3');
    expect(item.currentOccupancy?.N).toBe('3');
    expect(item.packageId?.S).toBe(DANCE_STYLE);
    expect(item.date?.S).toBe(SCHED_DATE);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test Case B — Resource Allocation & Output
  // Verify:
  //   • SCHEDULE PutItemCommand has status = DRAFT_PROPOSAL + __typename = ClubRecord
  //   • 3 UpdateItemCommands patch each booking to status = DRAFT_PROPOSAL
  //   • Each UpdateItemCommand receives the scheduleId returned by PutItemCommand
  // ─────────────────────────────────────────────────────────────────────────
  it('B: Writes DRAFT_PROPOSAL SCHEDULE and patches all 3 bookings', async () => {
    const bookings = [
      makePendingBooking(1),
      makePendingBooking(2),
      makePendingBooking(3),
    ];

    ddbMock
      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi1pkAndGsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: `${ADMIN_SUB}#BOOKINGS` },
          ':prefix': { S: 'STATUS#PENDING_SCHEDULING' },
        },
      })
      .resolves({ Items: bookings, Count: 3 })

      .on(QueryCommand, {
        ExpressionAttributeValues: {
          ':pk':     { S: ADMIN_SUB },
          ':prefix': { S: 'FACILITY#' },
        },
      })
      .resolves({ Items: [makeFacilityItem()], Count: 1 })

      .on(QueryCommand, {
        ExpressionAttributeValues: {
          ':pk':     { S: ADMIN_SUB },
          ':prefix': { S: 'COACH#' },
          ':active': { S: 'ACTIVE' },
        },
      })
      .resolves({ Items: [makeCoachItem()], Count: 1 })

      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi1pkAndGsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: `${ADMIN_SUB}#UNAVAIL#${COACH_PHONE}` },
        },
      })
      .resolves({ Items: [], Count: 0 })

      .on(QueryCommand, {
        IndexName: 'clubRecordsByGsi2pkAndGsi2sk',
      })
      .resolves({ Items: [], Count: 0 });

    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(UpdateItemCommand).resolves({});

    const { handler } = await import(
      '../../amplify/functions/vidaBaileSchedulingEngine/handler.js'
    ).catch(() =>
      import('../../amplify/functions/vidaBaileSchedulingEngine/handler')
    );

    const result = await handler({ adminSub: ADMIN_SUB });

    // ── Assert SCHEDULE PutItemCommand ────────────────────────────────────
    const putCalls = ddbMock.commandCalls(PutItemCommand);
    expect(putCalls).toHaveLength(1);

    const scheduleItem = putCalls[0].args[0].input.Item ?? {};

    // sk must start with SCHEDULE#
    expect(scheduleItem.sk?.S).toMatch(/^SCHEDULE#/);

    // status = DRAFT_PROPOSAL
    expect(scheduleItem.status?.S).toBe('DRAFT_PROPOSAL');

    // __typename = ClubRecord (required for AppSync to recognise the record)
    expect(scheduleItem.__typename?.S).toBe('ClubRecord');

    // entityType = SCHEDULE
    expect(scheduleItem.entityType?.S).toBe('SCHEDULE');

    // facilityId and coachPhone are set (not undefined)
    expect(scheduleItem.facilityId?.S).toBeTruthy();
    expect(scheduleItem.coachPhone?.S).toBeTruthy();

    // GSI1 keys for status-based query
    expect(scheduleItem.gsi1sk?.S).toBe('STATUS#DRAFT_PROPOSAL');

    // ── Assert 3 booking UpdateItemCommands ──────────────────────────────
    const updateCalls = ddbMock.commandCalls(UpdateItemCommand);
    expect(updateCalls).toHaveLength(3);

    // Extract the scheduleId the engine used
    const writtenScheduleId = (scheduleItem.sk?.S ?? '').replace('SCHEDULE#', '');

    for (const call of updateCalls) {
      const input      = call.args[0].input;
      const exprValues = input.ExpressionAttributeValues ?? {};

      // Each booking pk must match adminSub
      expect(input.Key?.pk?.S).toBe(ADMIN_SUB);

      // sk must start with BOOKING#
      expect(input.Key?.sk?.S).toMatch(/^BOOKING#/);

      // status → DRAFT_PROPOSAL
      expect(exprValues[':status']?.S).toBe('DRAFT_PROPOSAL');

      // scheduleId linked correctly
      expect(exprValues[':sid']?.S).toBe(writtenScheduleId);

      // gsi1sk updated so the booking no longer appears in PENDING_SCHEDULING queries
      expect(exprValues[':gsi1sk']?.S).toBe('STATUS#DRAFT_PROPOSAL');
    }

    // Sanity: engine reports 1 processed schedule, no errors
    expect(result.processed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bonus edge-case — missing adminSub returns early with an error message
  // ─────────────────────────────────────────────────────────────────────────
  it('returns error when adminSub is missing', async () => {
    const { handler } = await import(
      '../../amplify/functions/vidaBaileSchedulingEngine/handler.js'
    ).catch(() =>
      import('../../amplify/functions/vidaBaileSchedulingEngine/handler')
    );

    const result = await handler({});
    expect(result.processed).toBe(0);
    expect(result.errors).toContain('Missing adminSub');
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bonus edge-case — no pending bookings → returns early, no DDB writes
  // ─────────────────────────────────────────────────────────────────────────
  it('returns processed:0 when no PENDING_SCHEDULING bookings exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

    const { handler } = await import(
      '../../amplify/functions/vidaBaileSchedulingEngine/handler.js'
    ).catch(() =>
      import('../../amplify/functions/vidaBaileSchedulingEngine/handler')
    );

    const result = await handler({ adminSub: ADMIN_SUB });
    expect(result.processed).toBe(0);
    expect(result.schedules).toHaveLength(0);
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });
});
