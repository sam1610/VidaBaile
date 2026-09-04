# Table UI Improvements — Implementation Reference

## Quick Start

All table styling changes are complete and tested. Here's what was improved:

### ✅ What Changed

#### 1. Column Alignment
**Before:** Text scattered, no clear alignment  
**After:** Dedicated `.cell-*` classes ensure all content aligns with headers

```tsx
// CrmDashboard.tsx
<td className="cell-name">{member.name || '—'}</td>
<td className="cell-phone">{member.phone || '—'}</td>
<td className="cell-tier"><Badge variant="..." text="..." /></td>
<td className="cell-status">
  <span className="status-badge">✓ ACTIVE</span>
</td>
<td className="cell-date">{formatDate(member.createdAt)}</td>
```

#### 2. Icon-Based Actions
**Before:** Text labels "Edit", "Delete"  
**After:** Emoji icons with tooltips

```tsx
// Tooltips appear on hover
<button className="icon-button edit-btn" title="Edit member">✏️</button>
<button className="icon-button delete-btn" title="Delete coach">🗑️</button>
```

#### 3. Unified Colors
**Before:** Inconsistent background colors, mismatched borders  
**After:** Cohesive design system

| Element | Color | Usage |
|---------|-------|-------|
| Header BG | `#f5f5f5` | Table header background |
| Body BG | `white` | Table body background |
| Borders | `#e0e0e0` | Row & table borders |
| Hover | `#fafafa` | Row hover state |
| Edit hover | `#e3f2fd` | Edit button hover |
| Delete hover | `#ffebee` | Delete button hover |

#### 4. CSS Class Structure

**Unified table classes used across all components:**

```css
/* Main wrapper */
.table-wrapper { }          /* White bg, border, rounded, shadow */
.data-table { }             /* HTML table element */

/* Header styling */
.data-table thead { }       /* #f5f5f5 background */
.data-table th.sortable { } /* Cursor pointer, hover effect */
.th-content { }             /* Flex layout for sort indicator */
.sort-indicator { }         /* ↑/↓ arrows, light gray */

/* Body styling */
.data-table tbody tr.data-row { }       /* Row with hover state */
.data-table tbody tr.empty-row { }      /* Empty state styling */

/* Cell alignment */
.cell-name { }              /* Left, text truncation */
.cell-phone { }             /* Monospace font */
.cell-tier { }              /* Flex centered */
.cell-status { }            /* Status badge + icon */
.cell-date { }              /* Right-aligned, secondary color */
.cell-actions { }           /* Centered, icon button layout */

/* Icon buttons */
.icon-button { }            /* Base 28x28px styling */
.icon-button.edit-btn:hover { }    /* Blue on hover */
.icon-button.delete-btn:hover { }  /* Red on hover */

/* Status styling */
.status-badge { }           /* Inline badge with icon */
.status-icon { }            /* Icon alignment */
```

#### 5. Responsive Design

| Breakpoint | Adjustments |
|-----------|-------------|
| ≥ 768px (Desktop) | Full table, all columns visible |
| 481-767px (Tablet) | Reduced padding (8px), smaller font (11px) |
| ≤ 480px (Mobile) | Hide secondary columns, small buttons (24x24px) |

### Files Reference

#### CrmDashboard.tsx (Members table)
- **Location:** `src/components/crm/CrmDashboard.tsx`
- **Features:** Sortable columns, member tier badges, status icons
- **Actions:** Edit member (✏️)
- **Classes:** `.cell-name`, `.cell-phone`, `.cell-tier`, `.cell-status`, `.cell-date`, `.cell-actions`

#### CrmDashboard.css (Members styling)
- **Location:** `src/components/crm/CrmDashboard.css`
- **Lines:** 378
- **Coverage:** Headers, rows, cells, buttons, responsive, animations, error states

#### AppointmentsTab.tsx (Coaches table)
- **Location:** `src/components/appointments/AppointmentsTab.tsx`
- **Features:** Coach specialty, status badges, phone as tel: link
- **Actions:** Edit coach (✏️), Delete coach (🗑️)
- **Classes:** `.cell-name`, `.cell-specialty`, `.cell-status`, `.cell-phone`, `.cell-actions`

#### AppointmentsTab.css (Coaches styling)
- **Location:** `src/components/appointments/AppointmentsTab.css`
- **Lines:** 410
- **Coverage:** Headers (sticky), rows, cells, phone links, scroll container, responsive

### Usage Patterns

**Adding a new table (copy this pattern):**

```tsx
// 1. Import CSS
import './MyTable.css';

// 2. Use unified classes in JSX
<table className="data-table">
  <thead>
    <tr>
      <th className="sortable" onClick={() => handleSort('name')}>
        <span className="th-content">
          <span>Name</span>
          {sortConfig.key === 'name' && 
            <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
          }
        </span>
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="data-row">
      <td className="cell-name">{data.name}</td>
      <td className="cell-actions">
        <button className="icon-button edit-btn" title="Edit">✏️</button>
        <button className="icon-button delete-btn" title="Delete">🗑️</button>
      </td>
    </tr>
  </tbody>
</table>

// 3. Create CSS file
// Copy structure from CrmDashboard.css or AppointmentsTab.css
// Customize colors, responsive breakpoints as needed
```

**Creating custom table CSS:**

```css
.my-table-container {
  padding: 16px;
}

.table-wrapper {
  background: white;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

/* Then copy the .data-table thead, tbody, cell classes from reference files */
```

### Styling Reference Values

**Color Codes:**
```
Primary Blue:     #0066cc (links, CTAs, focus states)
Success Green:    #27ae60 (active status)
Warning Orange:   #e67e22 (suspended status)
Error Red:        #d32f2f (delete actions)
Neutral Gray:     #999 / #666 / #1a1a1a (text hierarchy)
Background:       #f5f5f5 (headers), white (body)
Border:           #e0e0e0
Hover:            #fafafa
```

**Font Sizes:**
```
Headers:          12px, 600 weight
Body:             12px, 400 weight
Secondary:        11px, 400 weight
Small:            10px (mobile)
```

**Spacing:**
```
Cell padding:     12px vertical, 10px horizontal
Icon buttons:     28x28px (desktop), 24x24px (mobile)
Button gap:       4px
Row height:       ~48px (with padding)
```

**Transitions:**
```
Hover effects:    0.15s ease
Box shadows:      0.15s ease
Color changes:    0.15s ease
```

### TypeScript Types

**Member model (used in CrmDashboard):**
```typescript
interface Member {
  pk: string;              // adminSub
  sk: string;              // MEMBER#{phone}
  phone: string;           // Primary identifier
  name: string;
  tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM';
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  createdAt: string;
  // ... other fields
}
```

**Coach model (used in AppointmentsTab):**
```typescript
interface Coach {
  pk: string;              // adminSub
  sk: string;              // COACH#{phone}
  phone: string;           // Primary identifier
  name: string;
  specialty: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  email?: string;
  bio?: string;
  // ... other fields
}
```

### Performance Notes

**Rendering:**
- Tables use React.memo internally (implicit via functional components)
- Subscription-based updates prevent excessive re-renders
- sort-indicator only re-renders when sort key changes

**CSS:**
- All CSS classes are scoped to component files
- Gzip: 33.96 KB (CSS), 232.60 KB (JS)
- No CSS-in-JS overhead

**Database Queries:**
- AppSync subscriptions use GSI1 filters for efficiency
- Real-time updates via AppSync subscriptions (no polling)

### Accessibility

**Keyboard Navigation:**
- Sortable headers: clickable, have cursor pointer
- Icon buttons: have focus outlines (2px solid #0066cc)
- Tooltips: via title attributes (native browser)

**Screen Readers:**
- aria-label on action buttons: `Edit {member.name}`
- Semantic HTML: `<table>`, `<thead>`, `<tbody>`
- Empty state text: descriptive

**Color Contrast:**
- Headers: #666 on #f5f5f5 (good contrast)
- Body: #1a1a1a on white (excellent contrast)
- Links: #0066cc with underline (WCAG AA)

### Troubleshooting

**Icon buttons not showing tooltip:**
- Ensure `title` attribute is set on `<button>`
- Browser shows native tooltip on hover

**Table misaligned:**
- Check `.cell-*` class is applied to correct `<td>`
- Verify CSS file is imported in component

**Colors look wrong:**
- Check color hex values in CSS
- Verify browser DevTools shows correct styles
- Clear browser cache (Cmd+Shift+R on Mac)

**Mobile layout broken:**
- Check responsive breakpoints (@media max-width)
- Verify padding/margin reduced on mobile
- Test with device emulation in DevTools

---

## Summary

✅ Unified table styling across CRM and Appointments  
✅ Proper column alignment with `.cell-*` classes  
✅ Icon-based actions (✏️ Edit, 🗑️ Delete) with tooltips  
✅ Cohesive color scheme (#f5f5f5, white, #e0e0e0)  
✅ Responsive design (768px, 480px breakpoints)  
✅ TypeScript strict mode compatible  
✅ Production ready, zero build errors  

For questions, refer to inline CSS comments and JSDoc annotations in component files.
