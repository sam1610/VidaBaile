/**
 * vidaBaileSchedulingEngine Lambda
 *
 * Deterministic Scheduling Engine — processes all PENDING_SCHEDULING bookings
 * for one admin tenant, groups them by (date, packageId / dance style), then
 * for every group:
 *   1. Proposes a 90-minute time slot.
 *   2. Selects the smallest-fitting available facility.
 *   3. Selects the first conflict-free coach whose specialty matches.
 *   4. Writes a SCHEDULE record (status = DRAFT_PROPOSAL).
 *   5. Patches every booking in the group to status = DRAFT_PROPOSAL + scheduleId.
 *
 * If a coach or facility cannot be found the slot is still written with
 * coachPhone = "UNASSIGNED" / facilityId = "UNASSIGNED" so the Admin
 * Dashboard can show a warning and let the admin resolve manually.
 *
 * STD Key patterns used (single-table DancingClubData / ClubRecord):
 *   BOOKING read  : pk=adminSub, sk begins_with BOOKING#
 *                   gsi1pk=<adminSub>#BOOKINGS, gsi1sk=STATUS#PENDING_SCHEDULING
 *   FACILITY read : pk=adminSub, sk begins_with FACILITY#
 *   COACH read    : pk=adminSub, sk begins_with COACH#
 *   UNAVAILABILITY: gsi1pk=<adminSub>#UNAVAIL#<coachPhone>
 *                   gsi1sk between DATETIME#<start> and DATETIME#<end>
 *   SCHEDULE read : gsi2pk=<adminSub>#SCHEDULES
 *                   gsi2sk DATE#<date>
 *   SCHEDULE write: pk=adminSub, sk=SCHEDULE#<uuid>
 *                   gsi1pk=<adminSub>#SCHEDULES, gsi1sk=STATUS#DRAFT_PROPOSAL
 *                   gsi2pk=<adminSub>#SCHEDULES, gsi2sk=DATE#<date>#TIME#<startTime>
 *   BOOKING patch : pk=adminSub, sk=<original booking sk>
 */

import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";

const ddb        = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RawItem { [key: string]: { S?: string; N?: string; BOOL?: boolean } }

interface Booking {
  sk: string;                 // BOOKING#<id>#MEMBER#<phone>
  memberPhone: string;
  packageId: string;          // dance style group key
  requestedDate: string;      // YYYY-MM-DD
  requestedTime?: string;     // HH:MM (optional hint from member)
}

interface Facility {
  sk: string;                 // FACILITY#<id>
  facilityId: string;
  name: string;
  capacity: number;           // max headcount
}

interface Coach {
  sk: string;                 // COACH#<phone>
  coachPhone: string;
  name: string;
  specialty: string;
}

interface Group {
  date: string;               // YYYY-MM-DD
  packageId: string;          // dance style key
  bookings: Booking[];
  headcount: number;
}

interface SlotProposal {
  date: string;
  startTime: string;          // HH:MM:SS
  endTime: string;            // HH:MM:SS
  startISO: string;           // full ISO for overlap checks
  endISO: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Fetch all PENDING_SCHEDULING bookings
// GSI1: gsi1pk = <adminSub>#BOOKINGS, gsi1sk begins_with STATUS#PENDING_SCHEDULING
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPendingBookings(adminSub: string): Promise<Booking[]> {
  const items: RawItem[] = [];
  let lastKey: any = undefined;

  do {
    const res = await ddb.send(new QueryCommand({
      TableName:              TABLE_NAME,
      IndexName:              "clubRecordsByGsi1pkAndGsi1sk",
      KeyConditionExpression: "gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: `${adminSub}#BOOKINGS` },
        ":prefix": { S: "STATUS#PENDING_SCHEDULING" },
      },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []) as RawItem[]);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`[Engine] Step 1: ${items.length} PENDING_SCHEDULING booking(s) found`);

  return items
    .filter(i => i.entityType?.S === "BOOKING")
    .map(i => {
      // sk = BOOKING#<id>#MEMBER#<phone>  →  memberPhone = last segment
      const skParts = (i.sk?.S ?? "").split("#");
      const memberPhone = skParts[skParts.length - 1] ?? "";
      // requestedDate: stored in gsi2sk as DATE#<YYYY-MM-DD> or in date field
      const gsi2sk = i.gsi2sk?.S ?? "";
      const requestedDate =
        i.date?.S ??
        (gsi2sk.startsWith("DATE#") ? gsi2sk.replace("DATE#", "").slice(0, 10) : "");
      // requestedTime: optional hint stored in startTime field (HH:MM:SS)
      const requestedTime = i.startTime?.S?.slice(0, 5); // keep HH:MM
      return {
        sk:            i.sk?.S ?? "",
        memberPhone,
        packageId:     i.packageId?.S ?? i.activityType?.S ?? "UNKNOWN",
        requestedDate,
        requestedTime,
      } as Booking;
    })
    .filter(b => b.sk && b.requestedDate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Group bookings by (date, packageId)
// ─────────────────────────────────────────────────────────────────────────────

function groupBookings(bookings: Booking[]): Group[] {
  const map = new Map<string, Group>();
  for (const b of bookings) {
    const key = `${b.requestedDate}::${b.packageId}`;
    if (!map.has(key)) {
      map.set(key, { date: b.requestedDate, packageId: b.packageId, bookings: [], headcount: 0 });
    }
    const g = map.get(key)!;
    g.bookings.push(b);
    g.headcount++;
  }
  const groups = [...map.values()];
  console.log(`[Engine] Step 2: ${groups.length} group(s) formed`);
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2b — Propose a time slot for a group (90-minute block)
// Uses the most common requestedTime hint in the group; defaults to 18:00.
// ─────────────────────────────────────────────────────────────────────────────

function proposeSlot(group: Group): SlotProposal {
  const SESSION_MINUTES = 90;

  // Vote on requested time hint
  const tally = new Map<string, number>();
  for (const b of group.bookings) {
    if (b.requestedTime) tally.set(b.requestedTime, (tally.get(b.requestedTime) ?? 0) + 1);
  }
  let startHHMM = "18:00";
  let best = 0;
  for (const [t, count] of tally) {
    if (count > best) { startHHMM = t; best = count; }
  }

  const [hh, mm] = startHHMM.split(":").map(Number);
  const startMinutes  = hh * 60 + mm;
  const endMinutes    = startMinutes + SESSION_MINUTES;
  const endHH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const endMM = String(endMinutes % 60).padStart(2, "0");

  const startTime = `${startHHMM.padEnd(8, ":00")}`.slice(0, 8).replace(/^(\d\d:\d\d)$/, "$1:00");
  const endTime   = `${endHH}:${endMM}:00`;

  const startISO = `${group.date}T${startTime.padStart(8, "0")}Z`;
  const endISO   = `${group.date}T${endTime}Z`;

  return { date: group.date, startTime, endTime, startISO, endISO };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Fetch all FACILITY records for this tenant
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFacilities(adminSub: string): Promise<Facility[]> {
  const items: RawItem[] = [];
  let lastKey: any = undefined;

  do {
    const res = await ddb.send(new QueryCommand({
      TableName:              TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk":     { S: adminSub },
        ":prefix": { S: "FACILITY#" },
      },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []) as RawItem[]);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  const facilities: Facility[] = items
    .filter(i => i.entityType?.S === "FACILITY" && i.status?.S !== "INACTIVE")
    .map(i => ({
      sk:         i.sk?.S ?? "",
      facilityId: (i.sk?.S ?? "").replace("FACILITY#", ""),
      name:       i.name?.S ?? i.sk?.S ?? "",
      capacity:   Number(i.capacity?.N ?? "0"),
    }))
    .filter(f => f.capacity > 0)
    .sort((a, b) => a.capacity - b.capacity); // ascending — pick smallest fitting room

  console.log(`[Engine] Step 3: ${facilities.length} usable facility(ies)`);
  return facilities;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3b — Pick a facility: smallest capacity >= headcount
//           Edge-case: if headcount > largest, return the two largest for splitting.
// ─────────────────────────────────────────────────────────────────────────────

function selectFacility(
  facilities: Facility[],
  headcount: number
): { primary: Facility | null; overflow: Facility | null; split: boolean } {
  const fitting = facilities.filter(f => f.capacity >= headcount);
  if (fitting.length > 0) {
    return { primary: fitting[0], overflow: null, split: false };
  }
  // No single room fits — split across the two biggest rooms
  const sorted = [...facilities].sort((a, b) => b.capacity - a.capacity);
  return {
    primary:  sorted[0] ?? null,
    overflow: sorted[1] ?? null,
    split:    true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Fetch COACH records whose specialty matches the dance style
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMatchingCoaches(adminSub: string, danceStyle: string): Promise<Coach[]> {
  // Fetch all coaches then filter in-memory on specialty.
  // A dedicated GSI on specialty would be ideal for large rosters, but the
  // existing schema uses SPECIALTY# in gsi1sk only for coaches queried via
  // gsi1pk=<adminSub>#COACHES — which requires a FilterExpression anyway.
  const items: RawItem[] = [];
  let lastKey: any = undefined;

  do {
    const res = await ddb.send(new QueryCommand({
      TableName:              TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      FilterExpression:       "#st = :active",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":pk":     { S: adminSub },
        ":prefix": { S: "COACH#" },
        ":active": { S: "ACTIVE" },
      },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []) as RawItem[]);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  const lower = danceStyle.toLowerCase();
  return items
    .filter(i => i.entityType?.S === "COACH")
    .filter(i => (i.specialty?.S ?? "").toLowerCase().includes(lower))
    .map(i => ({
      sk:          i.sk?.S ?? "",
      coachPhone:  (i.sk?.S ?? "").replace("COACH#", ""),
      name:        i.name?.S ?? "",
      specialty:   i.specialty?.S ?? "",
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4b — Coach unavailability check via GSI1
//           gsi1pk = <adminSub>#UNAVAIL#<coachPhone>
//           gsi1sk between DATETIME#<slotStart> and DATETIME#<slotEnd>
// ─────────────────────────────────────────────────────────────────────────────

async function isCoachOnLeave(
  adminSub: string,
  coachPhone: string,
  slotStartISO: string,
  slotEndISO: string
): Promise<boolean> {
  const res = await ddb.send(new QueryCommand({
    TableName:              TABLE_NAME,
    IndexName:              "clubRecordsByGsi1pkAndGsi1sk",
    KeyConditionExpression: "gsi1pk = :gsi1pk AND gsi1sk BETWEEN :low AND :high",
    ExpressionAttributeValues: {
      ":gsi1pk": { S: `${adminSub}#UNAVAIL#${coachPhone}` },
      ":low":    { S: `DATETIME#${slotStartISO}` },
      ":high":   { S: `DATETIME#${slotEndISO}` },
    },
    Limit: 1,
  }));
  return (res.Count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4c — Coach schedule conflict check via GSI2
//           Fetch schedules for the same date, filter where coachPhone matches
//           and the time window overlaps.
// ─────────────────────────────────────────────────────────────────────────────

async function isCoachAlreadyBooked(
  adminSub: string,
  coachPhone: string,
  date: string,
  slotStart: string,   // HH:MM:SS
  slotEnd: string      // HH:MM:SS
): Promise<boolean> {
  // Query all schedules on that date (GSI2)
  const res = await ddb.send(new QueryCommand({
    TableName:              TABLE_NAME,
    IndexName:              "clubRecordsByGsi2pkAndGsi2sk",
    KeyConditionExpression: "gsi2pk = :gsi2pk AND begins_with(gsi2sk, :datePrefix)",
    FilterExpression:       "coachPhone = :phone AND #st <> :cancelled",
    ExpressionAttributeNames: { "#st": "status" },
    ExpressionAttributeValues: {
      ":gsi2pk":     { S: `${adminSub}#SCHEDULES` },
      ":datePrefix": { S: `DATE#${date}` },
      ":phone":      { S: coachPhone },
      ":cancelled":  { S: "CANCELLED" },
    },
  }));

  // Check time-window overlap: [existStart, existEnd) overlaps [slotStart, slotEnd)?
  for (const item of (res.Items ?? []) as RawItem[]) {
    const existStart = item.startTime?.S ?? "";
    const existEnd   = item.endTime?.S   ?? "";
    if (!existStart || !existEnd) continue;
    // Overlap condition: start < otherEnd AND end > otherStart
    if (slotStart < existEnd && slotEnd > existStart) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4d — Find the first available coach for a slot
// ─────────────────────────────────────────────────────────────────────────────

async function findAvailableCoach(
  adminSub: string,
  coaches: Coach[],
  slot: SlotProposal
): Promise<Coach | null> {
  for (const coach of coaches) {
    const onLeave = await isCoachOnLeave(adminSub, coach.coachPhone, slot.startISO, slot.endISO);
    if (onLeave) {
      console.log(`[Engine]   Coach ${coach.name} on leave — skip`);
      continue;
    }
    const conflicted = await isCoachAlreadyBooked(
      adminSub, coach.coachPhone, slot.date, slot.startTime, slot.endTime
    );
    if (conflicted) {
      console.log(`[Engine]   Coach ${coach.name} already booked — skip`);
      continue;
    }
    console.log(`[Engine]   Coach ${coach.name} is available ✓`);
    return coach;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5a — Write a single DRAFT_PROPOSAL SCHEDULE record
// ─────────────────────────────────────────────────────────────────────────────

async function writeDraftSchedule(
  adminSub: string,
  slot: SlotProposal,
  group: Group,
  coachPhone: string,
  facilityId: string,
  headcount: number,
  activityType: string,
  scheduleId?: string
): Promise<string> {
  const sid  = scheduleId ?? randomUUID();
  const now  = new Date().toISOString();

  await ddb.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      pk:               { S: adminSub },
      sk:               { S: `SCHEDULE#${sid}` },
      entityType:       { S: "SCHEDULE" },
      // GSI1: admin schedule listing filtered by status
      gsi1pk:           { S: `${adminSub}#SCHEDULES` },
      gsi1sk:           { S: "STATUS#DRAFT_PROPOSAL" },
      // GSI2: date-based schedule lookup
      gsi2pk:           { S: `${adminSub}#SCHEDULES` },
      gsi2sk:           { S: `DATE#${slot.date}#TIME#${slot.startTime}` },
      date:             { S: slot.date },
      startTime:        { S: slot.startTime },
      endTime:          { S: slot.endTime },
      activityType:     { S: activityType },
      packageId:        { S: group.packageId },
      coachPhone:       { S: coachPhone },
      facilityId:       { S: facilityId },
      capacity:         { N: String(headcount) },       // proposed seat count
      currentOccupancy: { N: String(headcount) },       // all pending → now occupying
      status:           { S: "DRAFT_PROPOSAL" },
      createdAt:        { S: now },
      updatedAt:        { S: now },
    },
    // Idempotency guard: don't overwrite an already-confirmed schedule
    ConditionExpression: "attribute_not_exists(pk)",
  }));

  console.log(
    `[Engine] Step 5: SCHEDULE#${sid} written` +
    ` (coach=${coachPhone}, facility=${facilityId}, headcount=${headcount})`
  );
  return sid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5b — Patch each booking: status = DRAFT_PROPOSAL + scheduleId
// ─────────────────────────────────────────────────────────────────────────────

async function patchBookings(adminSub: string, bookings: Booking[], scheduleId: string): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all(bookings.map(b =>
    ddb.send(new UpdateItemCommand({
      TableName:        TABLE_NAME,
      Key:              { pk: { S: adminSub }, sk: { S: b.sk } },
      UpdateExpression: "SET #st = :status, scheduleId = :sid, gsi1sk = :gsi1sk, updatedAt = :now",
      ExpressionAttributeNames:  { "#st": "status" },
      ExpressionAttributeValues: {
        ":status": { S: "DRAFT_PROPOSAL" },
        ":sid":    { S: scheduleId },
        ":gsi1sk": { S: "STATUS#DRAFT_PROPOSAL" },
        ":now":    { S: now },
      },
    }))
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Process one group (may produce 1 or 2 schedule proposals on a split)
// ─────────────────────────────────────────────────────────────────────────────

async function processGroup(
  adminSub: string,
  group: Group,
  facilities: Facility[],
  coaches: Coach[]
): Promise<{ scheduleIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const slot = proposeSlot(group);

  // ── Facility selection ──────────────────────────────────────────────────
  const { primary, overflow, split } = selectFacility(facilities, group.headcount);

  if (split) {
    warnings.push(
      `Group (${group.date}, ${group.packageId}) headcount ${group.headcount} ` +
      `exceeds all facilities. Splitting into two proposals.`
    );
  }

  // ── Coach selection (shared for both halves if splitting) ───────────────
  const availableCoach = coaches.length > 0
    ? await findAvailableCoach(adminSub, coaches, slot)
    : null;
  const assignedCoach = availableCoach?.coachPhone ?? "UNASSIGNED";

  if (!availableCoach) {
    warnings.push(
      `No available coach for (${group.date}, ${group.packageId}). Set to UNASSIGNED.`
    );
  }

  const scheduleIds: string[] = [];

  if (!split) {
    // ── Normal case: one room fits all ─────────────────────────────────
    const facilityId = primary?.facilityId ?? "UNASSIGNED";
    if (!primary) {
      warnings.push(
        `No facility available for (${group.date}, ${group.packageId}). Set to UNASSIGNED.`
      );
    }
    const sid = await writeDraftSchedule(
      adminSub, slot, group, assignedCoach, facilityId,
      group.headcount, group.packageId
    );
    await patchBookings(adminSub, group.bookings, sid);
    scheduleIds.push(sid);
  } else {
    // ── Split case: divide bookings across two rooms ────────────────────
    const mid   = Math.ceil(group.bookings.length / 2);
    const half1 = group.bookings.slice(0, mid);
    const half2 = group.bookings.slice(mid);

    const fid1 = primary?.facilityId  ?? "UNASSIGNED";
    const fid2 = overflow?.facilityId ?? "UNASSIGNED";

    // First half
    const sid1 = await writeDraftSchedule(
      adminSub, slot, group, assignedCoach, fid1, half1.length, group.packageId
    );
    await patchBookings(adminSub, half1, sid1);

    // Second half — offset start time by 5 min to create a distinguishable slot
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const offset    = sm + 5;
    const sh2  = sh + Math.floor(offset / 60);
    const sm2  = offset % 60;
    const slot2StartTime = `${String(sh2 % 24).padStart(2,"0")}:${String(sm2).padStart(2,"0")}:00`;
    const [eh, em] = slot.endTime.split(":").map(Number);
    const eo  = em + 5;
    const slot2EndTime   = `${String((eh + Math.floor(eo/60)) % 24).padStart(2,"0")}:${String(eo%60).padStart(2,"0")}:00`;
    const slot2: SlotProposal = {
      date:      slot.date,
      startTime: slot2StartTime,
      endTime:   slot2EndTime,
      startISO:  `${slot.date}T${slot2StartTime}Z`,
      endISO:    `${slot.date}T${slot2EndTime}Z`,
    };

    // Try to find a second coach for the overflow half
    const coach2 = coaches.length > 0
      ? await findAvailableCoach(adminSub, coaches.filter(c => c.coachPhone !== assignedCoach), slot2)
      : null;
    const assignedCoach2 = coach2?.coachPhone ?? assignedCoach; // fall back to same coach

    const sid2 = await writeDraftSchedule(
      adminSub, slot2, group, assignedCoach2, fid2, half2.length, group.packageId
    );
    await patchBookings(adminSub, half2, sid2);

    scheduleIds.push(sid1, sid2);
  }

  return { scheduleIds, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event: any): Promise<{
  processed: number;
  schedules: string[];
  warnings: string[];
  errors: string[];
}> => {
  // Support direct invocation ({ adminSub }) and AppSync mutation ({ arguments: { adminSub } })
  const adminSub: string =
    event?.arguments?.adminSub ??
    event?.adminSub ??
    "";

  if (!adminSub) {
    console.error("[Engine] Missing adminSub in event");
    return { processed: 0, schedules: [], warnings: [], errors: ["Missing adminSub"] };
  }

  console.log(`[Engine] Starting scheduling run for admin: ${adminSub}`);

  const allWarnings: string[] = [];
  const allErrors:   string[] = [];
  const allSchedules: string[] = [];

  try {
    // ── Steps 1 & 2 ────────────────────────────────────────────────────────
    const pendingBookings = await fetchPendingBookings(adminSub);
    if (pendingBookings.length === 0) {
      console.log("[Engine] No pending bookings. Nothing to do.");
      return { processed: 0, schedules: [], warnings: [], errors: [] };
    }

    const groups = groupBookings(pendingBookings);

    // ── Step 3: fetch facilities once ──────────────────────────────────────
    const facilities = await fetchFacilities(adminSub);

    // ── Step 4 + 5: process each group ────────────────────────────────────
    for (const group of groups) {
      console.log(
        `[Engine] Processing group: date=${group.date}` +
        ` style=${group.packageId} headcount=${group.headcount}`
      );
      try {
        // Fetch matching coaches fresh per group (different dance styles)
        const coaches = await fetchMatchingCoaches(adminSub, group.packageId);
        console.log(
          `[Engine]   ${coaches.length} coach(es) match specialty "${group.packageId}"`
        );

        const { scheduleIds, warnings } = await processGroup(
          adminSub, group, facilities, coaches
        );
        allSchedules.push(...scheduleIds);
        allWarnings.push(...warnings);
      } catch (err: any) {
        const msg = `Group (${group.date}, ${group.packageId}): ${err.message}`;
        console.error("[Engine] Error processing group:", msg);
        allErrors.push(msg);
      }
    }
  } catch (err: any) {
    console.error("[Engine] Fatal error:", err.message);
    allErrors.push(`Fatal: ${err.message}`);
  }

  const result = {
    processed: allSchedules.length,
    schedules: allSchedules,
    warnings:  allWarnings,
    errors:    allErrors,
  };
  console.log("[Engine] Run complete:", JSON.stringify(result));
  return result;
};
