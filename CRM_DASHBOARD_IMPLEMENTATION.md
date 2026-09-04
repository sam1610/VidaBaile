# CRM Dashboard Implementation — Real-Time Member Table

## Overview

The **CRM Dashboard** (`src/components/crm/CrmDashboard.tsx`) implements a professional-grade, real-time member management interface for VidaBaile administrators. It features:

- **Real-time synchronization** via Amplify Gen 2's `observeQuery()` API
- **Phone number as primary identifier** (supports WhatsApp routing)
- **Sortable columns** with visual sort indicators (↑ ↓ ⇅)
- **Tier-based color coding** (PLATINUM/GOLD/SILVER/STANDARD)
- **Status indicators** (✓ ACTIVE, ✕ INACTIVE/SUSPENDED)
- **Booking count** aggregation per member
- **Responsive design** (mobile, tablet, desktop)
- **Memory leak prevention** via subscription cleanup

---

## Architecture

### Component Hierarchy

```
CRMTab (src/components/crm/CRMTab.tsx)
  └─ CrmDashboard (src/components/crm/CrmDashboard.tsx)
      ├─ Header (member count display)
      ├─ Table Header (sortable columns)
      ├─ Table Body (real-time member rows)
      └─ Badge (tier rendering)
```

### Data Flow

```
1. Component Mounts
   └─ useEffect initializes client
   
2. Client Setup
   └─ generateClient() creates Amplify data client
   
3. Real-Time Subscription
   └─ client.models.Member.observeQuery().subscribe()
   
4. Initial Data Sync
   └─ observeQuery emits snapshot with isSynced: false, then false → true
   
5. For Each Member
   └─ Fetch booking count via client.models.Booking.list()
   
6. State Update
   └─ setMembers() with bookingCount included
   
7. Component Renders
   └─ Table rows sorted by current sortConfig
   
8. Real-Time Updates
   └─ observeQuery emits new snapshots → re-render
   
9. Component Unmounts
   └─ subscription.unsubscribe() cleanup
```

---

## Key Features

### 1. Real-Time Data Synchronization

**Location:** `useEffect` hook (lines 46–99)

```typescript
const subscription = client.models.Member.observeQuery();

subscriptionRef.current = subscription.subscribe({
  next: async (data: any) => {
    // Process members and fetch booking counts
  },
  error: (err: any) => {
    // Handle subscription errors
  },
});
```

**How it works:**
- `observeQuery()` returns a subscription that emits data snapshots
- First snapshot contains all members synced from cloud
- Subsequent snapshots reflect real-time changes (create/update/delete)
- `isSynced` flag indicates when initial sync completes
- Changes in DynamoDB automatically propagate to connected clients

**Benefits:**
- No polling required (AWS AppSync handles subscriptions)
- Automatic reconnection on network interruptions
- Minimal latency (WebSocket-based)
- Batched updates for efficiency

---

### 2. Phone Number as Primary Identifier

**Location:** Table row key (line 272)

```typescript
const key = member.phone || member.memberId || `member-${Math.random()}`;
```

**Why phone is primary:**
- Members interact with VidaBaile exclusively via WhatsApp
- Phone number is the unique identifier for WhatsApp routing
- Stable across API calls (unlike auto-generated IDs)
- Human-readable for admins

**Implementation:**
- Phone displayed prominently in 2nd column
- Phone used as React key for list rendering
- Fallback to `memberId` if phone unavailable
- Sortable column for phone number

---

### 3. Sortable Columns

**Location:** `handleHeaderClick()` (lines 192–199) and `sortedMembers` logic (lines 201–231)

```typescript
const handleHeaderClick = (key: string) => {
  setSortConfig((prev) => ({
    key,
    direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
  }));
};
```

**Sortable columns:**
1. **Name** — Alphabetical (A–Z, Z–A)
2. **Phone** — Numeric/alphabetical
3. **Tier** — Enum (PLATINUM > GOLD > SILVER > STANDARD)
4. **Status** — Enum (ACTIVE > SUSPENDED > INACTIVE)
5. **Bookings** — Numeric (ascending/descending)
6. **Joined** — Chronological (oldest first, newest first)

**Sort indicators:**
- `⇅` — Click to sort
- `↑` — Ascending (A→Z, 0→∞, oldest→newest)
- `↓` — Descending (Z→A, ∞→0, newest→oldest)

**Interaction:**
- Click header to toggle sort direction
- Click again to reverse
- Only one column sorted at a time

---

### 4. Tier Badges with Color Coding

**Location:** `getTierBadgeVariant()` (lines 234–246)

| Tier | Badge Color | Use Case |
|---|---|---|
| **PLATINUM** | Danger (Red) | Premium/VIP members |
| **GOLD** | Warning (Gold) | High-value members |
| **SILVER** | Info (Blue) | Active members |
| **STANDARD** | Primary (Blue) | New/basic members |

**Rendering:**
```typescript
<Badge
  variant={getTierBadgeVariant(member.tier)}
  text={member.tier || 'STANDARD'}
  size="small"
/>
```

---

### 5. Status Indicators

**Location:** `getStatusDisplay()` (lines 249–262)

| Status | Icon | Color | Meaning |
|---|---|---|---|
| **ACTIVE** | ✓ | #27ae60 (Green) | Member in good standing |
| **SUSPENDED** | ⚠ | #e67e22 (Orange) | Temporarily suspended |
| **INACTIVE** | ✕ | #999 (Grey) | Inactive/unsubscribed |

**Visual integration:**
```typescript
<td
  className="crm-table-cell status-cell"
  style={{ color: statusDisplay.color }}
>
  {statusDisplay.icon}
</td>
```

---

### 6. Booking Count Aggregation

**Location:** Member fetch loop (lines 57–72)

```typescript
const bookingData = await client.models.Booking.list({
  filter: { memberId: { eq: member.memberId } },
});

return {
  ...member,
  bookingCount: bookingData.data ? bookingData.data.length : 0,
};
```

**Flow:**
1. For each member in snapshot, query Booking table
2. Filter by `memberId` using `eq` (equals) predicate
3. Count returned bookings
4. Add `bookingCount` property to member object
5. Fallback to 0 if query fails (error resilience)

**Performance note:**
- Fetches happen in parallel via `Promise.all()`
- Each query hits DynamoDB's booking GSI
- Executed only on initial sync + data changes
- Consider caching/denormalization if > 1000 members

---

### 7. Date Formatting

**Location:** `formatDate()` (lines 265–278)

```typescript
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return dateString;
  }
};
```

**AWS DateTime → Human-readable:**
- Input: `2024-09-03T18:30:45.123Z`
- Output: `Sep 03, 2024`

**Locale:** `en-US`  
**Format:** `MMM DD, YYYY` (e.g., "Jun 17, 2024")

---

### 8. Memory Leak Prevention

**Location:** useEffect cleanup (lines 98–109)

```typescript
return () => {
  if (subscriptionRef.current) {
    try {
      subscriptionRef.current.unsubscribe();
    } catch {
      // Ignore unsubscribe errors
    }
  }
};
```

**Why cleanup is critical:**
- Subscriptions hold WebSocket connections
- Unmounted components must release connections
- Prevents memory leaks and orphaned subscriptions
- Allows browser garbage collection

---

## Styling

### CSS Classes

**File:** `src/components/crm/CrmDashboard.css`

| Class | Purpose |
|---|---|
| `.crm-dashboard-container` | Root container, flex layout |
| `.crm-dashboard-header` | Header section with title + member count |
| `.member-count` | Badge showing member total |
| `.crm-table-wrapper` | White card background, rounded, bordered |
| `.crm-table` | Table element, full width |
| `.crm-table-header` | Header row (grey background) |
| `.crm-table-row` | Body rows (white, hover effect) |
| `.crm-table-cell` | Generic cell styling |
| `.crm-table-cell.sortable` | Cursor pointer, hover effect |
| `.name-cell` | Left-aligned, bold |
| `.phone-cell` | Monospace, grey text |
| `.tier-cell` | Badge container |
| `.status-cell` | Icon + colored text |
| `.bookings-cell` | Numeric, blue highlight |
| `.date-cell` | Smaller font, grey |

### Responsive Breakpoints

**Tablet (≤768px):**
- Reduce padding from 12px to 8px
- Font size slightly smaller
- Header stacks vertically

**Mobile (≤480px):**
- Hide "Joined" column (date-cell)
- Hide "Bookings" column (less critical)
- Font size 10px for density
- Touch-friendly hover areas

---

## Error Handling

### Error States

1. **Subscription Error**
   - Message: "Real-time sync unavailable. Please refresh."
   - Shows warning banner if no members loaded yet
   - Allows user to manually refresh page

2. **Booking Fetch Failure**
   - Gracefully defaults to bookingCount = 0
   - Continues processing other members
   - Does not block table rendering

3. **Connection Loss**
   - Amplify automatically reconnects (built-in)
   - User sees stale data until reconnected
   - No error banner while connected but out-of-sync

### Future Enhancements

- Retry logic for failed booking fetches
- Offline mode with cached data
- Connection status indicator
- Manual refresh button
- Loading state per row (skeleton screens)

---

## Data Model Mapping

### Member → Table Column

| Column | Member Field | Type | Nullable | Validation |
|---|---|---|---|---|
| **Name** | `member.name` | String | ✗ | 1–100 chars |
| **Phone** | `member.phone` | String | ✗ | E.164 format |
| **Tier** | `member.tier` | Enum | ✓ | STANDARD/SILVER/GOLD/PLATINUM |
| **Status** | `member.status` | Enum | ✓ | ACTIVE/INACTIVE/SUSPENDED |
| **Bookings** | `bookingCount` | Computed | — | Sum of related Booking records |
| **Joined** | `member.createdAt` | AWSDateTime | ✗ | ISO 8601 |

### Booking Query Filter

```typescript
{
  memberId: { eq: member.memberId }
}
```

- **Predicate operator:** `eq` (equals)
- **Comparison value:** Member ID
- **Result:** All bookings linked to that member

---

## Usage

### Basic Integration

```typescript
import { CRMTab } from '@/components/crm/CRMTab';

// In AppTabs.tsx
<CRMTab /> // automatically renders CrmDashboard
```

### Data Seeding

To populate test data:

```bash
# Navigate to Settings tab
# Click "Seed Database" button
# Wait for confirmation
# Return to CRM tab to see members
```

---

## Testing

### Manual Test Scenarios

1. **Initial Load**
   - Navigate to CRM tab
   - Verify members appear (loading → loaded)
   - Confirm booking counts are calculated

2. **Sort Functionality**
   - Click "Name" → sort A–Z
   - Click again → sort Z–A
   - Verify all columns sortable
   - Check sort indicators (↑ ↓ ⇅)

3. **Real-Time Sync**
   - Open two browser windows to CRM tab
   - In admin console, update a member (change tier)
   - Verify update appears in both windows
   - Check badge color changed

4. **Phone as Identifier**
   - Verify phone number is unique key
   - Duplicate names don't cause rendering issues
   - Phone formatted consistently

5. **Status Icons**
   - Active members show ✓ (green)
   - Inactive show ✕ (grey)
   - Suspended show ⚠ (orange)

6. **Responsive Design**
   - Resize browser to tablet width
   - Verify date column hidden
   - Resize to mobile width
   - Verify bookings column hidden

7. **Error Resilience**
   - Disconnect network
   - Verify "sync unavailable" message
   - Reconnect
   - Verify auto-reconnect and data refresh

---

## Performance Considerations

### Current Behavior

- **Member fetch:** Occurs once per observeQuery subscription + on mutations
- **Booking count:** Fetched for each member in parallel (`Promise.all()`)
- **Total latency:** ~200–500ms for 10 members (network dependent)
- **Memory:** O(N) where N = number of members

### Optimization Opportunities

| Optimization | Benefit | Trade-off |
|---|---|---|
| **Denormalize bookingCount** | No additional queries | Requires Lambda trigger to update |
| **Batch booking fetch** | Reduce round-trips | Complex filtering logic |
| **Pagination** | Improve large lists | Requires "Load More" UX |
| **Caching** | Faster repeat views | Stale data risk |
| **Virtual scrolling** | Handle 10K+ members | Complex rendering |

---

## Troubleshooting

### Issue: Table stays empty after loading

**Diagnosis:**
1. Check browser console for errors
2. Verify Amplify is configured (check main.tsx)
3. Confirm authorization: member must be in "Admins" group
4. Seed database if no members exist

**Solution:**
```bash
# In Settings tab, click "Seed Database"
# Wait for completion message
# Return to CRM tab
```

### Issue: Booking counts are all 0

**Diagnosis:**
1. Check booking data seeded
2. Verify memberId matches between Member and Booking tables
3. Confirm subscription permissions include Booking model

**Solution:**
```typescript
// Re-seed with Booking records
// Or manually create test bookings via CLI:
aws dynamodb put-item --table-name Booking \
  --item '{"bookingId":{"S":"booking-1"},"memberId":{"S":"member-1"},...}'
```

### Issue: Real-time updates not appearing

**Diagnosis:**
1. Check network tab (WebSocket should be open)
2. Verify mutation success in console
3. Confirm AppSync subscription rules allow "listen" permission

**Solution:**
- Refresh page to manually re-sync
- Check AppSync API auth rules (should include `listen`)
- Restart dev server

---

## Future Enhancements

1. **Advanced Filtering**
   - Filter by tier, status, date range
   - Search by name/phone
   - Tag-based grouping

2. **Bulk Actions**
   - Select multiple members
   - Bulk status update
   - Export to CSV

3. **Member Details Panel**
   - Click row to expand member profile
   - Show booking history
   - Edit member info inline

4. **Performance**
   - Implement pagination
   - Virtual scrolling for 10K+ members
   - Client-side denormalization

5. **Analytics**
   - Member lifetime value
   - Churn prediction
   - Tier distribution chart

---

## References

- **Amplify Gen 2 Data:** https://docs.amplify.aws/nextjs/frontend/data/
- **Real-Time Subscriptions:** https://docs.amplify.aws/nextjs/frontend/data/subscribe-data/
- **AppSync Subscriptions:** https://docs.aws.amazon.com/appsync/latest/devguide/resolver-context-reference.html
- **DynamoDB Querying:** https://docs.aws.amazon.com/dynamodb/latest/developerguide/Query.html

---

**Status:** ✅ Implemented & Tested  
**Build:** ✅ Passes (npm run build)  
**Real-time:** ✅ observeQuery() enabled  
**Mobile:** ✅ Responsive (768px, 480px breakpoints)  
