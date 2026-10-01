/**
 * vidaBaileSchedulingEngine Lambda
 *
 * Deterministic Scheduling Engine — processes all PENDING_SCHEDULING bookings
 * for one admin tenant, groups them by (date, packageId / dance style), then
 * for every group:
 *   1. Resolves the packageId to a human-readable name via CATALOG.
 *   2. Proposes a 90-minute time slot.
 *   3. Selects the smallest-fitting available facility.
 *   4. Selects the first conflict-free coach authorized for that packageId.
 *   5. Writes a SCHEDULE record (status = DRAFT_PROPOSAL).
 *   6. Patches every booking in the group to status = DRAFT_PROPOSAL + scheduleId.
 *
 * Coach matching (dual-tier):
 *   Primary  — checks coach.authorizedPackages[] contains the booking's packageId
 *   Fallback — if authorizedPackages is empty, falls back to specialty string match
 *              so legacy coach records continue to work during the DB transition.
 *
 * Split logic:
 *   If the group headcount exceeds every facility's capacity, the group is split
 *   into two halves, each written as a separate DRAFT_PROPOSAL SCHEDULE using the
 *   two largest facilities.  A second coach is attempted for the overflow half.
 *
 * STD Key patterns:
 *   BOOKING (read)      gsi1pk=<adminSub>#BOOKINGS  gsi1sk=STATUS#PENDING_SCHEDULING
 *   FACILITY (read)     pk=adminSub                 sk begins_with FACILITY#
 *   COACH (read)        pk=adminSub                 sk begins_with COACH#
 *   UNAVAILABILITY      gsi1pk=<adminSub>#UNAVAIL#<phone>  gsi1sk BETWEEN DATETIME#…
 *   SCHEDULE (conflict) gsi2pk=<adminSub>#SCHEDULES gsi2sk begins_with DATE#<date>
 *   SCHEDULE (write)    pk=adminSub  sk=SCHEDULE#<uuid>
 *   BOOKING (patch)     pk=adminSub  sk=<original booking sk>
 */

import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  QueryCommandOutput,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";

const ddb        = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RawItem {
  [key: string]: {
    S?:    string;
    N?:    string;
    BOOL?: boolean;
    L?:    { S: string }[];
    SS?:   string[];
  };
}

interface Booking {
  sk:            string;   // BOOKING#<id>#MEMBER#<phone>
  memberPhone:   string;
  packageId:     string;   // dance style group key
  requestedDate: string;   // YYYY-MM-DD
  requestedTime?: string;  // HH:MM (optional hint)
}

interface Facility {
  sk:         string;   // FACILITY#<id>
  facilityId: string;
  name:       string;
  capacity:   number;
}

interface Coach {
  sk:                 string;   // COACH#<phone>
  coachPhone:         string;
  name:               string;
  specialty:          string;
  authorizedPackages: string[]; // array of authorized CATALOG packageIds
}

interface Group {
  date:      string;   // YYYY-MM-DD
  packageId: string;
  bookings:  Booking[];
  headcount: number;
}

interface SlotProposal {
  date:      string;
  startTime: string;   // HH:MM:SS
  endTime:   string;   // HH:MM:SS
  startISO:  string;   // full ISO for overlap checks
  endISO:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — Resolve packageId → human-readable name from CATALOG record
//          Written into SCHEDULE.activityType so the UI table renders correctly.
// ─────────────────────────────────────────────────────────────────────────────

async function getPackageName(adminSub: string, packageId: string): Promise<string> {
  try {
    const res = await ddb.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { pk: { S: adminSub }, sk: { S: `CATALOG#${packageId}` } },
    }));
    const item = res.Item as RawItem | undefined;
    return item?.name?.S?.trim() || item?.packageType?.S?.trim() || packageId;
  } catch {
    return packageId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Fetch all PENDING_SCHEDULING bookings
//          GSI1: gsi1pk = <adminSub>#BOOKINGS, gsi1sk begins_with STATUS#PENDING_SCHEDULING
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPendingBookings(adminSub: string): Promise<Booking[]> {
  const items: RawItem[] = [];
  let lastKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const res: QueryCommandOutput = await ddb.send(new QueryCommand({
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
      const skParts     = (i.sk?.S ?? "").split("#");
      const memberPhone = skParts[skParts.length - 1] ?? "";
      const gsi2sk      = i.gsi2sk?.S ?? "";
      const requestedDate =
        i.date?.S ??
        (gsi2sk.startsWith("DATE#") ? gsi2sk.replace("DATE#", "").slice(0, 10) : "");
      const requestedTime = i.startTime?.S?.slice(0, 5);
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
// Step 2b — Propose a 90-minute slot; votes on requestedTime hints, default 18:00
// ─────────────────────────────────────────────────────────────────────────────

function proposeSlot(group: Group): SlotProposal {
  const SESSION_MINUTES = 90;
  const tally = new Map<string, number>();
  for (const b of group.bookings) {
    if (b.requestedTime) tally.set(b.requestedTime, (tally.get(b.requestedTime) ?? 0) + 1);
  }
  let startHHMM = "18:00";
  let best = 0;
  for (const [t, count] of tally) {
    if (count > best) { startHHMM = t; best = count; }
  }

  const [hh, mm]      = startHHMM.split(":").map(Number);
  const startMinutes  = hh * 60 + mm;
  const endMinutes    = startMinutes + SESSION_MINUTES;
  const endHH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const endMM = String(endMinutes % 60).padStart(2, "0");

  // Normalise to HH:MM:SS
  const startTime = startHHMM.includes(":") && startHHMM.split(":").length === 2
    ? `${startHHMM}:00`
    : startHHMM;
  const endTime = `${endHH}:${endMM}:00`;

  const startISO = `${group.date}T${startTime}Z`;
  const endISO   = `${group.date}T${endTime}Z`;

  return { date: group.date, startTime, endTime, startISO, endISO };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Fetch all active FACILITY records
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFacilities(adminSub: string): Promise<Facility[]> {
  const items: RawItem[] = [];
  let lastKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const res: QueryCommandOutput = await ddb.send(new QueryCommand({
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
// Step 3b — Pick facility: smallest capacity >= headcount.
//           If headcount exceeds every room, return the two largest for splitting.
// ─────────────────────────────────────────────────────────────────────────────

function selectFacility(
  facilities: Facility[],
  headcount: number
): { primary: Facility | null; overflow: Facility | null; split: boolean } {
  const fitting = facilities.filter(f => f.capacity >= headcount);
  if (fitting.length > 0) {
    return { primary: fitting[0], overflow: null, split: false };
  }
  const sorted = [...facilities].sort((a, b) => b.capacity - a.capacity);
  return {
    primary:  sorted[0] ?? null,
    overflow: sorted[1] ?? null,
    split:    true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Fetch ACTIVE coaches authorized for the given packageId.
//
// Dual-tier match (backward compatible):
//   1. PRIMARY   — coach.authorizedPackages[] contains the booking's packageId
//   2. FALLBACK  — if authorizedPackages is empty (legacy record), check if the
//                  specialty string contains the activity name or vice-versa
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMatchingCoaches(
  adminSub: string,
  packageId: string,
  realActivityName: string
): Promise<Coach[]> {
  const items: RawItem[] = [];
  let lastKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const res: QueryCommandOutput = await ddb.send(new QueryCommand({
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

  const lowerName = realActivityName.toLowerCase();

  return items
    .filter(i => i.entityType?.S === "COACH")
    .map(i => {
      // Safely extract authorizedPackages whether stored as List (L) or StringSet (SS)
      let authorizedPackages: string[] = [];
      if (i.authorizedPackages?.L && i.authorizedPackages.L.length > 0) {
        authorizedPackages = i.authorizedPackages.L.map(entry => entry.S ?? "").filter(Boolean);
      } else if (i.authorizedPackages?.SS && i.authorizedPackages.SS.length > 0) {
        authorizedPackages = i.authorizedPackages.SS.filter(Boolean);
      }
      return {
        sk:                 i.sk?.S ?? "",
        coachPhone:         (i.sk?.S ?? "").replace("COACH#", ""),
        name:               i.name?.S ?? "",
        specialty:          i.specialty?.S ?? "",
        authorizedPackages,
      };
    })
    .filter(coach => {
      // PRIMARY: strict packageId match
      if (coach.authorizedPackages.length > 0) {
        return coach.authorizedPackages.includes(packageId);
      }
      // FALLBACK: legacy specialty string (bidirectional substring, case-insensitive)
      const lowerSpecialty = coach.specialty.toLowerCase();
      return (
        lowerSpecialty.length > 0 &&
        (lowerSpecialty.includes(lowerName) || lowerName.includes(lowerSpecialty))
      );
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4b — Coach unavailability check via GSI1
//           gsi1pk = <adminSub>#UNAVAIL#<coachPhone>
//           gsi1sk between DATETIME#<start> and DATETIME#<end>
// ─────────────────────────────────────────────────────────────────────────────

async function isCoachOnLeave(
  adminSub: string,
  coachPhone: string,
  slotStartISO: string,
  slotEndISO: string
): Promise<boolean> {
  const res: QueryCommandOutput = await ddb.send(new QueryCommand({
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
//           Fetch schedules for the date, check time-window overlap.
// ─────────────────────────────────────────────────────────────────────────────

async function isCoachAlreadyBooked(
  adminSub: string,
  coachPhone: string,
  date: string,
  slotStart: string,
  slotEnd: string
): Promise<boolean> {
  const res: QueryCommandOutput = await ddb.send(new QueryCommand({
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

  for (const item of (res.Items ?? []) as RawItem[]) {
    const existStart = item.startTime?.S ?? "";
    const existEnd   = item.endTime?.S   ?? "";
    if (!existStart || !existEnd) continue;
    // Overlap: [slotStart, slotEnd) overlaps [existStart, existEnd)?
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
  adminSub:         string,
  slot:             SlotProposal,
  group:            Group,
  coachPhone:       string,
  facilityId:       string,
  headcount:        number,
  realActivityName: string,
  scheduleId?:      string
): Promise<string> {
  const sid = scheduleId ?? randomUUID();
  const now = new Date().toISOString();

  await ddb.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      pk:               { S: adminSub },
      sk:               { S: `SCHEDULE#${sid}` },
      __typename:       { S: "ClubRecord" },
      entityType:       { S: "SCHEDULE" },
      gsi1pk:           { S: `${adminSub}#SCHEDULES` },
      gsi1sk:           { S: "STATUS#DRAFT_PROPOSAL" },
      gsi2pk:           { S: `${adminSub}#SCHEDULES` },
      gsi2sk:           { S: `DATE#${slot.date}#TIME#${slot.startTime}` },
      date:             { S: slot.date },
      startTime:        { S: slot.startTime },
      endTime:          { S: slot.endTime },
      activityType:     { S: realActivityName },
      packageId:        { S: group.packageId },
      coachPhone:       { S: coachPhone },
      facilityId:       { S: facilityId },
      capacity:         { N: String(headcount) },
      currentOccupancy: { N: String(headcount) },
      status:           { S: "DRAFT_PROPOSAL" },
      createdAt:        { S: now },
      updatedAt:        { S: now },
    },
    ConditionExpression: "attribute_not_exists(pk)",
  }));

  console.log(`[Engine] Step 5: SCHEDULE#${sid} written (coach=${coachPhone}, facility=${facilityId}, headcount=${headcount})`);
  return sid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5b — Patch each booking: status = DRAFT_PROPOSAL + scheduleId
// ─────────────────────────────────────────────────────────────────────────────

async function patchBookings(
  adminSub:   string,
  bookings:   Booking[],
  scheduleId: string
): Promise<void> {
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
// Process one group — may produce 1 or 2 DRAFT_PROPOSAL schedules (split case)
// ─────────────────────────────────────────────────────────────────────────────

async function processGroup(
  adminSub:         string,
  group:            Group,
  facilities:       Facility[],
  coaches:          Coach[],
  realActivityName: string
): Promise<{ scheduleIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const slot = proposeSlot(group);

  const { primary, overflow, split } = selectFacility(facilities, group.headcount);

  if (split) {
    warnings.push(
      `Group (${group.date}, ${realActivityName}) headcount ${group.headcount} ` +
      `exceeds all facilities. Splitting into two proposals.`
    );
  }

  const availableCoach = coaches.length > 0
    ? await findAvailableCoach(adminSub, coaches, slot)
    : null;
  const assignedCoach = availableCoach?.coachPhone ?? "UNASSIGNED";

  if (!availableCoach) {
    warnings.push(
      `No available coach for (${group.date}, ${realActivityName}). Set to UNASSIGNED.`
    );
  }

  const scheduleIds: string[] = [];

  if (!split) {
    // ── Normal case: one room fits all ───────────────────────────────────
    const facilityId = primary?.facilityId ?? "UNASSIGNED";
    if (!primary) {
      warnings.push(
        `No facility available for (${group.date}, ${realActivityName}). Set to UNASSIGNED.`
      );
    }
    const sid = await writeDraftSchedule(
      adminSub, slot, group, assignedCoach, facilityId,
      group.headcount, realActivityName
    );
    await patchBookings(adminSub, group.bookings, sid);
    scheduleIds.push(sid);

  } else {
    // ── Split case: divide bookings across two rooms ──────────────────────
    // overflow is consumed here — resolves ts(6133)
    const mid   = Math.ceil(group.bookings.length / 2);
    const half1 = group.bookings.slice(0, mid);
    const half2 = group.bookings.slice(mid);

    const fid1 = primary?.facilityId  ?? "UNASSIGNED";
    const fid2 = overflow?.facilityId ?? "UNASSIGNED";

    // First half
    const sid1 = await writeDraftSchedule(
      adminSub, slot, group, assignedCoach, fid1, half1.length, realActivityName
    );
    await patchBookings(adminSub, half1, sid1);

    // Second half — offset start time by 5 min for a distinguishable slot
    const [sh, sm]    = slot.startTime.split(":").map(Number);
    const smOffset    = sm + 5;
    const sh2         = (sh + Math.floor(smOffset / 60)) % 24;
    const sm2         = smOffset % 60;
    const [eh, em]    = slot.endTime.split(":").map(Number);
    const emOffset    = em + 5;
    const eh2         = (eh + Math.floor(emOffset / 60)) % 24;
    const em2         = emOffset % 60;
    const slot2StartTime = `${String(sh2).padStart(2,"0")}:${String(sm2).padStart(2,"0")}:00`;
    const slot2EndTime   = `${String(eh2).padStart(2,"0")}:${String(em2).padStart(2,"0")}:00`;
    const slot2: SlotProposal = {
      date:      slot.date,
      startTime: slot2StartTime,
      endTime:   slot2EndTime,
      startISO:  `${slot.date}T${slot2StartTime}Z`,
      endISO:    `${slot.date}T${slot2EndTime}Z`,
    };

    // Try to find a second coach for the overflow half
    const coach2 = coaches.length > 0
      ? await findAvailableCoach(
          adminSub,
          coaches.filter(c => c.coachPhone !== assignedCoach),
          slot2
        )
      : null;
    const assignedCoach2 = coach2?.coachPhone ?? assignedCoach;

    const sid2 = await writeDraftSchedule(
      adminSub, slot2, group, assignedCoach2, fid2, half2.length, realActivityName
    );
    await patchBookings(adminSub, half2, sid2);

    scheduleIds.push(sid1, sid2);
  }

  return { scheduleIds, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event: unknown): Promise<{
  processed: number;
  schedules: string[];
  warnings:  string[];
  errors:    string[];
}> => {
  const ev = event as Record<string, unknown>;
  const adminSub: string =
    (ev?.arguments as Record<string, unknown>)?.adminSub as string ??
    ev?.adminSub as string ??
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
    const pendingBookings = await fetchPendingBookings(adminSub);
    if (pendingBookings.length === 0) {
      console.log("[Engine] No pending bookings. Nothing to do.");
      return { processed: 0, schedules: [], warnings: [], errors: [] };
    }

    const groups     = groupBookings(pendingBookings);
    const facilities = await fetchFacilities(adminSub);

    for (const group of groups) {
      console.log(
        `[Engine] Processing group: date=${group.date}` +
        ` packageId=${group.packageId} headcount=${group.headcount}`
      );
      try {
        // Resolve human-readable name — written as activityType on the SCHEDULE record
        const realActivityName = await getPackageName(adminSub, group.packageId);

        // Fetch coaches using both the strict packageId AND the resolved name for fallback
        const coaches = await fetchMatchingCoaches(adminSub, group.packageId, realActivityName);
        console.log(`[Engine]   ${coaches.length} coach(es) matched for "${realActivityName}"`);

        const { scheduleIds, warnings } = await processGroup(
          adminSub, group, facilities, coaches, realActivityName
        );
        allSchedules.push(...scheduleIds);
        allWarnings.push(...warnings);
      } catch (err: unknown) {
        const msg = `Group (${group.date}, ${group.packageId}): ${(err as Error).message}`;
        console.error("[Engine] Error processing group:", msg);
        allErrors.push(msg);
      }
    }
  } catch (err: unknown) {
    const msg = `Fatal: ${(err as Error).message}`;
    console.error("[Engine] Fatal error:", msg);
    allErrors.push(msg);
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
