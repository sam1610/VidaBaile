# Debugging: Coach Record Not Appearing After Creation

## Issue Summary

You attempted to create a Coach but it didn't appear in the Appointments table. The DynamoDB record shows:
```
Coach-dqmrvq7cercwjdac7fj22g3nya-NONE
```

This indicates:
- Coach ID: `dqmrvq7cercwjdac7fj22g3nya` (auto-generated)
- **sk: `NONE`** ← Problem! Should be `PHONE#+1-555-xxxx`

## Root Cause Analysis

The `sk` field is `NONE` because either:

1. **Phone was not passed to the form** — Empty phone field defaulted to empty string
2. **formatPhoneSk() received empty/null phone** — `formatPhoneSk("")` → `"PHONE#"`
3. **adminSub was null during creation** — pk wasn't set properly, but no validation error shown
4. **Query filter doesn't match the malformed key** — List query: `{ pk: { eq: adminSub } }` won't find records with wrong pk

## Debugging Steps

### Step 1: Check Browser Console Logs

Open **DevTools** → **Console** tab and look for logs like:

```
✓ Admin SUB retrieved: us-east-1:abc123...
Saving coach with pk: us-east-1:abc123... sk: PHONE#+1-555-0001 phone: +1-555-0001
Coach payload: { pk: "us-east-1:abc123...", sk: "PHONE#+1-555-0001", ... }
Creating coach...
Create result: { ... }
✓ New coach added to table
```

**If you see:**
```
Saving coach with pk: null
Cannot save: adminSub= null
```

→ Admin SUB failed to load. Check authentication.

**If you see:**
```
sk: PHONE# phone: 
```

→ Phone field was empty. User must fill in phone.

### Step 2: Open AppSync Console

Go to **AWS AppSync** → Your API → **Queries** tab and run:

```graphql
query ListCoaches {
  listCoaches(limit: 100) {
    items {
      id
      pk
      sk
      name
      phone
      createdAt
    }
  }
}
```

This shows ALL coaches in the database, including malformed ones.

### Step 3: Check DynamoDB Directly

Go to **AWS DynamoDB** → Your `Coach` table → **Items** tab:

Look for records with:
- `pk`: Should match your admin's Cognito SUB (e.g., `us-east-1:...`)
- `sk`: Should be `PHONE#<phone>` format (e.g., `PHONE#+1-555-0001`)

If you see `sk: NONE` or `sk: PHONE#`, the validation failed.

### Step 4: Check Network Requests

In DevTools → **Network** tab:

1. Click "+ Add New Coach"
2. Fill in form with: Name, Phone (REQUIRED!), Specialty, Status
3. Click Save
4. Look for GraphQL request named something like `Coach:create`

Check the **Request** payload:
```json
{
  "pk": "us-east-1:...",
  "sk": "PHONE#+1-555-0001",
  "name": "Clara",
  "phone": "+1-555-0001",
  "specialty": "Salsa",
  ...
}
```

And **Response**:
```json
{
  "data": {
    "createCoach": {
      "pk": "us-east-1:...",
      "sk": "PHONE#+1-555-0001",
      ...
    }
  }
}
```

## Fix Checklist

### ✅ Ensure Form Validation

**In CoachCrudModal.tsx**, the validation should prevent empty phone:

```typescript
const validateForm = () => {
  if (!formData.name?.trim()) {
    setError('Name is required');
    return false;
  }
  if (!formData.phone?.trim()) {
    setError('Phone is required');  // ← Must show this
    return false;
  }
  if (!formData.specialty?.trim()) {
    setError('Specialty is required');
    return false;
  }
  return true;
};
```

**When saving**, if validation fails, form should NOT close.

### ✅ Ensure adminSub is Loaded

In AppointmentsTab.tsx, the button should be disabled until adminSub loads:

```typescript
<button 
  className="btn-add-coach" 
  onClick={handleAddCoach} 
  disabled={loading || !adminSub || adminSubLoading}  // ← All three conditions
>
  + Add New Coach
</button>
```

### ✅ Log Before Saving

The updated AppointmentsTab now logs:

```typescript
console.log('Saving coach with pk:', adminSub, 'sk:', sk, 'phone:', formData.phone);
console.log('Coach payload:', payload);
```

Check these logs in DevTools Console.

## Solution: Clean Up & Retry

### Option 1: Delete Malformed Record (AWS Console)

1. Go to **AWS DynamoDB** → Coach table
2. Find record with `sk: NONE`
3. Delete it

### Option 2: Delete via CLI

```bash
aws dynamodb delete-item \
  --table-name Coach \
  --key '{"pk":{"S":"Coach-dqmrvq7cercwjdac7fj22g3nya"},"sk":{"S":"NONE"}}'
```

### Then Retry Creating Coach

1. Open Appointments tab
2. Wait for "✓ Admin SUB retrieved" in console
3. Click "+ Add New Coach"
4. **Fill ALL required fields**: Name, Phone (+1-555-XXXX), Specialty
5. Click "Save"
6. Check console for "Saving coach with pk: us-east-1:..." logs
7. Verify new coach appears in table

## Validation Checklist

- [ ] Browser console shows "✓ Admin SUB retrieved: us-east-1:..."
- [ ] "+ Add New Coach" button is enabled (not greyed out)
- [ ] Form requires all fields (Name, Phone, Specialty)
- [ ] Phone format: +1-555-XXXX (or your region's format)
- [ ] Console shows: "Saving coach with pk: us-east-1:... sk: PHONE#+1-555..."
- [ ] Network request shows correct `pk` and `sk`
- [ ] Coach appears in table immediately (real-time subscription)
- [ ] Refreshing page still shows the coach (persisted to DB)

## Common Pitfalls

| Issue | Symptom | Fix |
|---|---|---|
| Empty phone field | `sk: PHONE#` | Form validation prevents save |
| adminSub is null | `pk: null` | Check authentication, wait for SUB |
| Wrong phone format | `sk: PHONE#+1555001` (no hyphens) | Standardize format before sending |
| Subscription filtering | Coach appears in table but not persisted | Check console logs for pk mismatch |
| DynamoDB table permissions | Create fails silently | Check IAM role has DynamoDB write access |

## Success Criteria

✅ New coach appears immediately in table (within 100ms)  
✅ Refreshing page still shows the coach  
✅ Console logs show: `✓ New coach added to table`  
✅ Browser Network tab shows 200 response from GraphQL mutation  
✅ DynamoDB record has correct `pk` (admin SUB) and `sk` (PHONE#...)  

---

**Next Steps:**

1. Open DevTools Console
2. Create new coach
3. Share console logs showing:
   - ✓ Admin SUB retrieved: ...
   - Saving coach with pk: ...
   - Create result: ...
   
Or share:
- DynamoDB items showing malformed records
- AppSync GraphQL response

---

**Status:** 🔧 **Debugging Guide Created**  
**Console Logging:** ✅ **Added for troubleshooting**  
**Build:** ✅ **Passes**

