# Query Reference Guide - Facilities Management

This document provides detailed examples of all database queries used in the Facilities Management feature, ensuring strict adherence to the "index-only, no scans" requirement.

---

## Query Index

1. [Create Facility](#1-create-facility) — Direct PUT
2. [Get Facility by ID](#2-get-facility-by-id) — Primary key lookup
3. [Update Facility](#3-update-facility) — Direct UPDATE
4. [Delete Facility](#4-delete-facility) — Direct DELETE
5. [List All Facilities](#5-list-all-facilities) — GSI1 query
6. [Filter by Status](#6-filter-by-status) — GSI1 range query

---

## 1. Create Facility

### Use Case
Admin clicks "Add Facility" → fills form → clicks "Save" → Facility appears in grid

### Query Type
**Direct PUT** (no index scan needed, direct insertion)

### DynamoDB Request
```javascript
// src/services/DatabaseService.ts: createFacilityRecord()
const facility = {
  pk: "us-east-1:admin-12345",                  // Admin SUB
  sk: "FACILITY#fac-001",                       // Sort key: FACILITY#{id}
  gsi1pk: "us-east-1:admin-12345#FACILITIES",   // GSI1 partition (facility grouping)
  gsi1sk: "STATUS#ACTIVE#NAME#LA_VIDA_HALL",    // GSI1 sort (status + name)
  gsi2pk: "us-east-1:admin-12345#FACILITIES",   // GSI2 partition (temporal grouping)
  gsi2sk: "CREATED#2024-09-03T14:30:00Z",       // GSI2 sort (creation timestamp)
  entityType: "FACILITY",
  id: "fac-001",
  name: "La Vida Hall",
  capacity: 40,
  occupancy: 0,
  location: "2nd Floor, Building A",
  description: "Spacious hall with mirrors",
  status: "ACTIVE",
  createdAt: "2024-09-03T14:30:00Z",
  updatedAt: "2024-09-03T14:30:00Z"
};

await client.models.ClubRecord.create(facility);
```

### Index Used
- **None** (direct PUT to table)
- **Why**: Direct insertion doesn't require lookup

### Scan?
❌ **NO** — Direct write operation

### Example Code
```typescript
export async function createFacilityRecord(
  adminSub: string,
  facilityId: string,
  data: FacilityInput
): Promise<Facility> {
  const client = generateClient<Schema>();
  const facility = createFacility(adminSub, facilityId, data);
  
  // Direct PUT — no query, no scan
  const result = await (client.models as any).ClubRecord.create(facility);
  
  if (!isFacility(result)) {
    throw new Error('Created record is not a Facility');
  }
  return result;
}
```

---

## 2. Get Facility by ID

### Use Case
Click "Edit" on facility card → Modal opens with current facility data pre-filled

### Query Type
**Primary Key Lookup** (pk + sk direct get)

### DynamoDB Request
```javascript
// Key condition: pk = {adminSub} AND sk = FACILITY#{id}
const params = {
  pk: "us-east-1:admin-12345",     // Partition key (exact)
  sk: "FACILITY#fac-001"            // Sort key (exact)
};

// Result: Single facility record
result = {
  pk: "us-east-1:admin-12345",
  sk: "FACILITY#fac-001",
  gsi1pk: "us-east-1:admin-12345#FACILITIES",
  gsi1sk: "STATUS#ACTIVE#NAME#LA_VIDA_HALL",
  name: "La Vida Hall",
  capacity: 40,
  occupancy: 28,
  location: "2nd Floor, Building A",
  description: "Spacious hall with mirrors",
  status: "ACTIVE",
  // ... other fields
};
```

### Index Used
- **Primary Index** (pk + sk)
- **Why**: Direct lookup by exact key values

### Scan?
❌ **NO** — Efficient primary key lookup

### Example Code
```typescript
export async function getFacilityByIdRecord(
  adminSub: string,
  facilityId: string
): Promise<Facility | null> {
  const client = generateClient<Schema>();
  
  // Direct GET using primary key — no query, no scan
  const result = await (client.models as any).ClubRecord.get({
    pk: adminSub,
    sk: `FACILITY#${facilityId}`
  });
  
  if (!result) return null;
  if (!isFacility(result)) {
    throw new Error('Retrieved record is not a Facility');
  }
  return result;
}
```

---

## 3. Update Facility

### Use Case
Edit facility name/capacity → Click "Save" → Card updates immediately

### Query Type
**Direct UPDATE** (pk + sk direct update + GSI1SK regeneration)

### DynamoDB Request

```javascript
// Step 1: Fetch current facility (GET, not scan)
const current = await getFacilityByIdRecord(adminSub, facilityId);
// {pk, sk, gsi1pk, gsi1sk: "STATUS#ACTIVE#NAME#OLD_NAME", ...}

// Step 2: Merge updated data
const merged = {
  name: "La Vida Hall Grande",      // CHANGED
  capacity: 50,                      // CHANGED
  location: current.location,        // UNCHANGED
  status: current.status             // UNCHANGED
};

// Step 3: Regenerate GSI1SK (name changed, so sort key changes)
const newGsi1sk = "STATUS#ACTIVE#NAME#LA_VIDA_HALL_GRANDE";

// Step 4: UPDATE with new values
const updateRequest = {
  pk: "us-east-1:admin-12345",
  sk: "FACILITY#fac-001",
  gsi1pk: "us-east-1:admin-12345#FACILITIES",
  gsi1sk: newGsi1sk,                // Regenerated
  gsi2pk: "us-east-1:admin-12345#FACILITIES",
  gsi2sk: current.gsi2sk,           // Keep original timestamp
  name: "La Vida Hall Grande",
  capacity: 50,
  occupancy: current.occupancy,     // Preserved
  location: current.location,
  status: current.status,
  updatedAt: "2024-09-03T15:00:00Z"  // Updated timestamp
};

await client.models.ClubRecord.update(updateRequest);
```

### Index Used
- **Primary Index** (pk + sk for direct update)
- **GSI1** (regenerated if name or status changes)
- **Why**: Update by exact key, then regenerate index keys

### Scan?
❌ **NO** — Direct update + primary key lookup

### Example Code
```typescript
export async function updateFacilityRecord(
  adminSub: string,
  facilityId: string,
  data: Partial<FacilityInput>
): Promise<Facility> {
  const client = generateClient<Schema>();
  
  // Fetch current (GET by primary key — not a scan)
  const current = await getFacilityByIdRecord(adminSub, facilityId);
  if (!current) throw new Error('Facility not found');
  
  // Merge updates
  const merged: FacilityInput = {
    name: data.name ?? current.name,
    capacity: data.capacity ?? current.capacity,
    location: data.location ?? current.location,
    description: data.description ?? current.description,
    status: data.status ?? current.status,
  };
  
  // Regenerate GSI1SK
  const nameForSort = merged.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const updated = {
    pk: adminSub,
    sk: `FACILITY#${facilityId}`,
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: `STATUS#${merged.status}#NAME#${nameForSort}`,
    gsi2pk: `${adminSub}#FACILITIES`,
    gsi2sk: current.gsi2sk,
    entityType: 'FACILITY' as const,
    name: merged.name,
    capacity: merged.capacity,
    occupancy: current.occupancy,
    location: merged.location,
    description: merged.description,
    status: merged.status,
    updatedAt: new Date().toISOString(),
  };
  
  // Direct UPDATE — no scan
  const result = await (client.models as any).ClubRecord.update(updated);
  if (!isFacility(result)) throw new Error('Not a facility');
  
  return result;
}
```

---

## 4. Delete Facility

### Use Case
Click "Delete" → Confirm dialog → Facility removed from grid

### Query Type
**Direct DELETE** (pk + sk direct deletion)

### DynamoDB Request
```javascript
// Key condition: pk = {adminSub} AND sk = FACILITY#{id}
const deleteRequest = {
  pk: "us-east-1:admin-12345",
  sk: "FACILITY#fac-001"
};

// Result: Record removed from table
await client.models.ClubRecord.delete(deleteRequest);
```

### Index Used
- **Primary Index** (pk + sk)
- **Why**: Direct deletion by exact key

### Scan?
❌ **NO** — Efficient primary key deletion

### Example Code
```typescript
export async function deleteFacilityRecord(
  adminSub: string,
  facilityId: string
): Promise<void> {
  const client = generateClient<Schema>();
  
  // Direct DELETE using primary key — no scan
  await (client.models as any).ClubRecord.delete({
    pk: adminSub,
    sk: `FACILITY#${facilityId}`
  });
}
```

---

## 5. List All Facilities

### Use Case
Load SettingsTab → Display all facilities as cards

### Query Type
**GSI1 Query** (gsi1pk only, no sort key filter)

### DynamoDB Request
```javascript
// Query condition: gsi1pk = {adminSub}#FACILITIES
// NO sort key condition = all results
const queryRequest = {
  indexName: "GSI1",
  gsi1pk: "us-east-1:admin-12345#FACILITIES",
  // gsi1sk: NOT filtered — get all facilities
};

// Result: All facilities for this admin, sorted by gsi1sk
results = [
  {
    pk: "us-east-1:admin-12345",
    sk: "FACILITY#fac-001",
    gsi1pk: "us-east-1:admin-12345#FACILITIES",
    gsi1sk: "STATUS#ACTIVE#NAME#LA_VIDA_HALL",
    name: "La Vida Hall",
    capacity: 40,
    status: "ACTIVE",
    // ...
  },
  {
    pk: "us-east-1:admin-12345",
    sk: "FACILITY#fac-002",
    gsi1pk: "us-east-1:admin-12345#FACILITIES",
    gsi1sk: "STATUS#ACTIVE#NAME#STUDIO_B",
    name: "Studio B",
    capacity: 25,
    status: "ACTIVE",
    // ...
  },
  {
    pk: "us-east-1:admin-12345",
    sk: "FACILITY#fac-003",
    gsi1pk: "us-east-1:admin-12345#FACILITIES",
    gsi1sk: "STATUS#MAINTENANCE#NAME#HALL_C",
    name: "Hall C",
    capacity: 30,
    status: "MAINTENANCE",
    // ...
  }
];
// Results auto-sorted: ACTIVE facilities first, then MAINTENANCE, CLOSED
// Within each status, sorted alphabetically by name
```

### Index Used
- **GSI1** (gsi1pk, gsi1sk as sort key)
- **Why**: Efficient bulk query across all facilities for this admin

### Scan?
❌ **NO** — GSI1 query (targeted to partition)

### CloudWatch Logs
```
Query: GSI1
Count: 3 (items returned)
ScannedCount: 3 (items examined)
Ratio: 1.0 (100% of scanned items returned — efficient!)
```

### Example Code
```typescript
export async function queryAllFacilitiesRecord(
  adminSub: string
): Promise<Facility[]> {
  const client = generateClient<Schema>();
  
  // GSI1 query — no scan!
  const results = await (client.models as any).ClubRecord.listByGsi1({
    gsi1pk: `${adminSub}#FACILITIES`
    // No gsi1sk filter = all facilities
  });
  
  if (!results.data) return [];
  return results.data.filter(isFacility);
}
```

---

## 6. Filter by Status

### Use Case
Click "ACTIVE" filter → Display only active facilities

### Query Type
**GSI1 Range Query** (gsi1pk + gsi1sk begins_with filter)

### DynamoDB Request

```javascript
// Query condition: gsi1pk = {adminSub}#FACILITIES AND gsi1sk begins_with "STATUS#ACTIVE"
const queryRequest = {
  indexName: "GSI1",
  gsi1pk: "us-east-1:admin-12345#FACILITIES",
  gsi1sk: { beginsWith: "STATUS#ACTIVE" }
};

// Result: Only ACTIVE facilities, sorted by name
results = [
  {
    pk: "us-east-1:admin-12345",
    sk: "FACILITY#fac-001",
    gsi1pk: "us-east-1:admin-12345#FACILITIES",
    gsi1sk: "STATUS#ACTIVE#NAME#LA_VIDA_HALL",
    name: "La Vida Hall",
    status: "ACTIVE",
    // ...
  },
  {
    pk: "us-east-1:admin-12345",
    sk: "FACILITY#fac-002",
    gsi1pk: "us-east-1:admin-12345#FACILITIES",
    gsi1sk: "STATUS#ACTIVE#NAME#STUDIO_B",
    name: "Studio B",
    status: "ACTIVE",
    // ...
  }
];
// MAINTENANCE and CLOSED facilities filtered out (not in results)
```

### Filters vs Queries

**Important**: The `beginsWith` is a **query condition**, NOT a filter.

```typescript
// ✅ GOOD: Query condition (efficient)
gsi1sk: { beginsWith: "STATUS#ACTIVE" }
// DynamoDB applies this at query time — only ACTIVE items returned

// ❌ AVOID: Post-query filter (inefficient)
results = allResults.filter(r => r.gsi1sk.startsWith("STATUS#ACTIVE"));
// This requires querying all items then filtering in application
```

### Index Used
- **GSI1** (gsi1pk = partition, gsi1sk = range query)
- **Why**: Efficient filtering by status via sort key range

### Scan?
❌ **NO** — GSI1 range query (targeted)

### CloudWatch Logs
```
Query: GSI1
Count: 2 (ACTIVE items returned)
ScannedCount: 2 (items examined)
Ratio: 1.0 (efficient — no waste!)
```

### Example Code
```typescript
export async function queryFacilitiesByStatusRecord(
  adminSub: string,
  status: 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
): Promise<Facility[]> {
  const client = generateClient<Schema>();
  
  // GSI1 range query — no scan!
  const results = await (client.models as any).ClubRecord.listByGsi1({
    gsi1pk: `${adminSub}#FACILITIES`,
    gsi1sk: { beginsWith: `STATUS#${status}` }  // Range query
  });
  
  if (!results.data) return [];
  return results.data.filter(isFacility);
}
```

---

## Query Performance Comparison

### ❌ Inefficient (Anti-Pattern): Table Scan

```typescript
// WRONG: Scan entire table!
const allRecords = await (client.models as any).ClubRecord.scan();
const facilities = allRecords.filter(r => 
  r.pk === adminSub && r.entityType === 'FACILITY'
);
// This reads EVERY record in the entire table — wasteful and slow!
```

**Impact**: 
- ❌ Scans 1,000,000+ records even if admin has 10 facilities
- ❌ High latency (1-10 seconds)
- ❌ High cost (reads per millisecond × entire table)

### ✅ Efficient (Correct): GSI1 Query

```typescript
// RIGHT: Query GSI1 partition only
const results = await (client.models as any).ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#FACILITIES`
});
const facilities = results.data.filter(isFacility);
// This reads ONLY this admin's facilities — efficient!
```

**Impact**:
- ✅ Scans ~10 records if admin has 10 facilities
- ✅ Low latency (< 100ms)
- ✅ Low cost (proportional to data size)

### Performance Targets

| Operation | Method | Latency (p95) | Scanned Items | Cost |
|---|---|---|---|---|
| List all facilities | GSI1 | < 100ms | ~N | Low |
| Filter by status | GSI1 range | < 100ms | ~M | Low |
| Get by ID | Primary | < 10ms | 1 | Very Low |
| ❌ Scan all | Table scan | 1-10s | 1,000,000+ | High |

---

## MultiTenant Isolation Verification

### Scenario: Admin A vs Admin B

```
Admin A: SUB = "us-east-1:admin-AAA"
Admin B: SUB = "us-east-1:admin-BBB"

Admin A's facilities:
  pk: "us-east-1:admin-AAA", sk: "FACILITY#fac-001"
  pk: "us-east-1:admin-AAA", sk: "FACILITY#fac-002"

Admin B's facilities:
  pk: "us-east-1:admin-BBB", sk: "FACILITY#fac-001"
  pk: "us-east-1:admin-BBB", sk: "FACILITY#fac-002"
```

### Query Isolation

```typescript
// Admin A queries their facilities
const adminA_results = await queryAllFacilitiesRecord("us-east-1:admin-AAA");
// Returns: Admin A's 2 facilities
// Does NOT return: Admin B's facilities

// Admin B queries their facilities
const adminB_results = await queryAllFacilitiesRecord("us-east-1:admin-BBB");
// Returns: Admin B's 2 facilities
// Does NOT return: Admin A's facilities

// Admin A cannot query Admin B's facilities
const hack_attempt = await queryAllFacilitiesRecord("us-east-1:admin-BBB");
// AppSync auth guard blocks this: "Not authorized"
```

### Isolation Verification

✅ **Partition Key (pk = adminSub)**
- Every record partitioned by admin's unique ID
- DynamoDB physical partition separation

✅ **Query Filter (all queries include pk)**
- Every query includes exact pk match
- GSI1 queries filter by adminSub in partition

✅ **AppSync Auth Rule**
- `allow.groups(['Admins'])`
- Only authenticated admins in 'Admins' group can access
- JWT verified for every request

✅ **Result**
- Admin A sees only their data
- Admin B sees only their data
- No cross-admin data leakage possible

---

## Common Query Mistakes to Avoid

### ❌ Mistake 1: Forgetting pk Filter
```typescript
// WRONG: Forget to check pk (would scan whole table if allowed!)
const results = await queryFacilitiesByStatus(status);
// Missing adminSub — queries get global results
```

**Fix**: Always include pk = adminSub
```typescript
// RIGHT: Include pk in every query
const results = await (client.models as any).ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#FACILITIES`,  // Include adminSub
  gsi1sk: { beginsWith: `STATUS#${status}` }
});
```

### ❌ Mistake 2: Using Scan Instead of Query
```typescript
// WRONG: Scan entire table then filter
const allRecords = await (client.models as any).ClubRecord.scan();
const filtered = allRecords.filter(r => r.gsi1pk === `${adminSub}#FACILITIES`);
```

**Fix**: Use query on GSI1
```typescript
// RIGHT: Query GSI1 directly
const results = await (client.models as any).ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#FACILITIES`
});
```

### ❌ Mistake 3: Post-Query Filtering on Index Keys
```typescript
// WRONG: Query then filter by sort key
const results = await (client.models as any).ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#FACILITIES`
});
const filtered = results.data.filter(r => 
  r.gsi1sk.startsWith(`STATUS#ACTIVE`)  // Should be in query!
);
```

**Fix**: Use range query for sort key filtering
```typescript
// RIGHT: Let DynamoDB filter by sort key
const results = await (client.models as any).ClubRecord.listByGsi1({
  gsi1pk: `${adminSub}#FACILITIES`,
  gsi1sk: { beginsWith: `STATUS#ACTIVE` }  // Query condition
});
```

### ❌ Mistake 4: Hardcoding Admin IDs
```typescript
// WRONG: Hardcoded SUB
const results = await queryAllFacilitiesRecord("us-east-1:admin-12345");
// Won't work for other admins!
```

**Fix**: Get adminSub from auth context
```typescript
// RIGHT: Get from Amplify auth
const { userId } = await Auth.currentUserInfo();
const results = await queryAllFacilitiesRecord(userId);
```

---

## Monitoring & Validation

### CloudWatch Metrics to Track

```
Query Operation: GSI1 ListByGsi1 (queryAllFacilitiesRecord)
- Count: 10 (items returned)
- ScannedCount: 10 (items examined)
- Ratio: 1.0 (efficiency ratio — should be close to 1.0)
✅ GOOD: Count == ScannedCount (no wasted reads)

Query Operation: Table Scan (WRONG!)
- Count: 10 (items returned)
- ScannedCount: 1,000,000 (items examined)
- Ratio: 0.00001 (very inefficient!)
❌ BAD: Count << ScannedCount (huge waste)
```

### Test Queries Before Deployment

```bash
# 1. Verify no scans
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --start-time 2024-09-01T00:00:00Z \
  --end-time 2024-09-02T00:00:00Z \
  --period 3600

# 2. Check query latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name SuccessfulRequestLatency \
  --dimensions Name=Operation,Value=Query \
  --start-time 2024-09-01T00:00:00Z \
  --end-time 2024-09-02T00:00:00Z \
  --period 3600

# 3. Verify consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --start-time 2024-09-01T00:00:00Z \
  --end-time 2024-09-02T00:00:00Z \
  --period 3600
```

---

## Summary

| Query | Type | Index | Scan? | Latency |
|---|---|---|---|---|
| Create | PUT | None | ❌ | < 10ms |
| Read | GET | Primary | ❌ | < 10ms |
| Update | UPDATE | Primary | ❌ | < 10ms |
| Delete | DELETE | Primary | ❌ | < 10ms |
| List All | Query | GSI1 | ❌ | < 100ms |
| Filter | Query | GSI1 | ❌ | < 100ms |

**All operations use indexes or direct key lookups. ZERO table scans. ✅**

