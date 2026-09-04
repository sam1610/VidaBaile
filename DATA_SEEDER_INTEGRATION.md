# DataSeeder Integration Guide

## Overview

The `DataSeeder` component at `src/components/dev/DataSeeder.tsx` populates your AppSync/DynamoDB backend with mock data for development and testing.

**Features:**
- ✅ Generates 3 Members (varying tier and status)
- ✅ Generates 3 Coaches (varying specialty)
- ✅ Generates 3 Schedules (linked to Coaches)
- ✅ Generates 3 MemberPackages (linked to Members)
- ✅ Generates 3 Bookings (linked to Members and Schedules)
- ✅ Generates 1 Claim (linked to Booking and Package)
- ✅ Uses predictable UUIDs for relational integrity (e.g., `member-1`, `coach-1`)
- ✅ Adheres strictly to schema enums and date/time formats

## Quick Start

### Option 1: Mount in Settings Tab (Recommended)

The `SettingsTab` component already has an import placeholder. To enable it:

1. Open `src/components/settings/SettingsTab.tsx`
2. Add the import:
   ```tsx
   import { DataSeeder } from '../dev/DataSeeder';
   ```
3. Add the component to the render:
   ```tsx
   export function SettingsTab() {
     return (
       <View padding="medium">
         <Heading level={2}>Settings</Heading>
         <DataSeeder />
       </View>
     );
   }
   ```

4. Run `npm run dev` and navigate to **Settings** tab
5. Click **Seed Mock Data** button to populate the database

### Option 2: Temporary Mount in App.tsx

If you want quick access without touching the Settings tab:

1. Open `src/App.tsx`
2. Import the component at the top:
   ```tsx
   import { DataSeeder } from './components/dev/DataSeeder';
   ```
3. Add it temporarily inside the `<Authenticator>` block (after `<AppTabs />`):
   ```tsx
   <Authenticator>
     {() => (
       <View>
         {/* ... permissions error alert ... */}
         <AppTabs />
         <View padding="medium" style={{ borderTop: '1px solid #ddd' }}>
           <DataSeeder />
         </View>
       </View>
     )}
   </Authenticator>
   ```

4. Run `npm run dev` and click **Seed Mock Data** at the bottom of any tab
5. **Remove after use** to keep the UI clean for production

## What Gets Created

When you click "Seed Mock Data", the component executes these mutations:

### Members (3)
| ID | Name | Tier | Status |
|---|---|---|---|
| `member-1` | Member 1 | STANDARD | ACTIVE |
| `member-2` | Member 2 | SILVER | ACTIVE |
| `member-3` | Member 3 | GOLD | INACTIVE |

### Coaches (3)
| ID | Name | Specialty | Status |
|---|---|---|---|
| `coach-1` | Coach 1 | Salsa | ACTIVE |
| `coach-2` | Coach 2 | Bachata | ACTIVE |
| `coach-3` | Coach 3 | Merengue | ACTIVE |

### Schedules (3)
| ID | Date | Time | Coach | Activity |
|---|---|---|---|---|
| `schedule-1` | Tomorrow | 18:00–19:30 | coach-1 | Salsa Class |
| `schedule-2` | Tomorrow+1 | 18:00–19:30 | coach-2 | Bachata Class |
| `schedule-3` | Tomorrow+2 | 18:00–19:30 | coach-3 | Merengue Class |

### MemberPackages (3)
| ID | Member | Type | Credits | Price | Valid Until |
|---|---|---|---|---|---|
| `package-1` | member-1 | 10 Sessions | 10 | $99.99 | 90 days |
| `package-2` | member-2 | 20 Sessions | 20 | $179.99 | 90 days |
| `package-3` | member-3 | 30 Sessions | 30 | $249.99 | 90 days |

### Bookings (3)
| ID | Member | Schedule | Status |
|---|---|---|---|
| `booking-1` | member-1 | schedule-1 | CONFIRMED |
| `booking-2` | member-2 | schedule-2 | CONFIRMED |
| `booking-3` | member-3 | schedule-3 | CONFIRMED |

### Claim (1)
| ID | Booking | Package | Member | Credits Consumed |
|---|---|---|---|---|
| `claim-1` | booking-1 | package-1 | member-1 | 1 |

## Debugging

If the seeding fails:

1. **Check browser console** for error messages (F12 → Console tab)
2. **Verify authentication** — you must be logged in as an Admin user
3. **Check AppSync logs** — Navigate to AWS Console → AppSync → Your API → Logs
4. **Verify Cognito group** — Ensure your user is in the `Admins` group:
   - AWS Console → Cognito → User Pools → Select pool → Users and groups
   - Find your user → check if they are in `Admins` group

## Type Safety

The component uses TypeScript generics to ensure type-safe mutations:
```tsx
const client = generateClient<Schema>();
```

This guarantees:
- ✅ Enums are validated at compile time (e.g., `tier: 'STANDARD'` is valid, `tier: 'INVALID'` fails)
- ✅ Required fields are enforced
- ✅ Date/time formats are correct (AWSDate: `YYYY-MM-DD`, AWSTime: `HH:MM:SS`)

## Cleanup

To remove the DataSeeder from your UI:
1. Delete the import statement
2. Delete the `<DataSeeder />` JSX element
3. Run `npm run dev` to verify

To delete the seeded data from DynamoDB:
- Use AWS Console → DynamoDB → Tables → `DancingClubData` → Scan → select items → Delete
- Or run a bulk delete script (contact your DBA)

## Notes

- **Predictable UUIDs**: IDs follow the pattern `entity-type-N` (e.g., `member-1`, `coach-1`). This ensures relational links are correct and reproducible.
- **No duplicates on re-run**: If you seed twice, you'll create duplicate records (different IDs). Use your DB cleanup process to remove old data before re-seeding.
- **Dev-only**: This component is intended for development and testing. Remove from production builds.
