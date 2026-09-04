# Implementation Plan: Settings Tab & DatabaseService Extensions

**Feature:** Settings Tab & DatabaseService Extensions  
**Version:** 1.0  
**Status:** Ready for Implementation  
**Created:** 2024

---

## Overview

This implementation plan breaks down the Settings Tab & DatabaseService Extensions feature into 15 atomic, testable tasks organized across 6 phases. Each task includes acceptance criteria, implementation steps, code locations, and verification procedures.

**Total Estimated Effort:** 8-10 development days (assuming ~1-2 hours per task)

---

## Prerequisites

Before starting implementation, ensure:

| Prerequisite | Check | Status |
|---|---|---|
| TypeScript strict mode enabled | `tsconfig.json` includes `"strict": true` | ✓ |
| Amplify Gen 2 backend configured | `amplify/backend.ts` exists | ✓ |
| ClubRecord model in AppSync | `amplify/data/resource.ts` contains `ClubRecord` | ✓ |
| DatabaseService exists | `src/services/DatabaseService.ts` present | ✓ |
| Amplify UI Components installed | `@aws-amplify/ui-react` in package.json | ✓ |
| AWS SDK v6+ (aws-amplify) | `aws-amplify` version ≥ 6.0.0 | ✓ |
| CSS Modules support | Vite/Webpack configured for .css modules | ✓ |
| useAdminSub hook exists | `src/hooks/useAdminSub.ts` or similar | Verify |

---

## Implementation Phases

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: DatabaseService Extensions (Tasks 1-3)               │
│ → Add ClubSettings & Facility interfaces                       │
│ → Implement updateClubSettings(), createFacility()            │
│ → Implement listFacilities()                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Component Foundation (Tasks 4-6)                      │
│ → Create SettingsDashboard main component                      │
│ → Create 4 section sub-components                              │
│ → Create FacilityModal component                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: Form Logic & State (Tasks 7-9)                        │
│ → Implement form validation utility                            │
│ → Implement form state management hooks                        │
│ → Wire DatabaseService to component handlers                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: Real-Time & Integration (Tasks 10-12)                 │
│ → Implement AppSync subscription logic                         │
│ → Implement S3 Knowledge Base upload/list                      │
│ → Implement error handling & loading states                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 5: Styling & Responsiveness (Tasks 13-14)                │
│ → Create responsive CSS layout                                 │
│ → Create component integration tests & verification            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 6: Documentation & Verification (Task 15)                │
│ → Documentation and code quality verification                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: DatabaseService Extensions

- [ ] **1.1 Add ClubSettings & Facility Interfaces to Models**
  
  **Objective:** Extend `src/lib/models.ts` with TypeScript interfaces and factory functions for ClubSettings and Facility entities, following the existing STD pattern.
  
  **Acceptance Criteria:**
  - ClubSettings interface defined with all required fields (clubName, address, phone, operatingHours, cancellationWindowHours, currency)
  - Facility interface defined with all required fields (facilityId, facilityName, maxCapacity)
  - Both interfaces extend ClubRecord base interface
  - Type guards created: `isClubSettings()` and `isFacility()`
  - Factory functions created: `createClubSettings()` and `createFacility()`
  - All functions include JSDoc comments with STD key pattern examples
  - TypeScript compilation succeeds: `npm run build`
  - No `any` types used; strict mode compliant

  **Implementation Steps:**
  
  1. Open `src/lib/models.ts` and scroll to end of file (after existing Claim factory function, around line 370)
  
  2. Add ClubSettings interface:
  
  ```typescript
  /**
   * Club Settings Record
   * Single settings record per admin with key SETTINGS#GLOBAL
   * Used to store club-wide configuration (name, hours, policy, currency)
   */
  export interface ClubSettings extends ClubRecord {
    entityType: 'SETTINGS';
    clubName: string;
    address: string;
    phone: string;
    operatingHours: Array<{
      day: string;           // e.g., "Monday", "Monday-Friday"
      openTime: string;      // HH:MM format
      closeTime: string;     // HH:MM format
    }>;
    cancellationWindowHours: number;
    currency: string;        // ISO 4217 code, e.g., "USD", "BRL"
  }
  ```
  
  3. Add Facility interface:
  
  ```typescript
  /**
   * Facility Record
   * One or more facilities per admin (dance halls, courts, studios)
   * Used to organize activities and manage space capacity
   */
  export interface Facility extends ClubRecord {
    entityType: 'FACILITY';
    facilityId: string;      // UUID or nanoid
    facilityName: string;
    maxCapacity: number;     // 1-1000
  }
  ```
  
  4. Add type guard functions and factory functions (see full code in implementation steps)
  
  **Code Locations:**
  - **File:** `src/lib/models.ts`
  - **Insert after line:** ~370 (after existing factory functions)
  - **Lines added:** ~60 lines total
  
  **Key Files to Modify:**
  - Modify: `src/lib/models.ts`
  
  **Testing Verification:**
  1. Run TypeScript compiler: `npm run build` (should succeed with no errors)
  2. Check types are exported: `grep -n "export interface ClubSettings" src/lib/models.ts`
  3. Check factory functions exist: `grep -n "export function createClubSettings" src/lib/models.ts`
  4. No `any` types in new code

- [ ] **1.2 Implement updateClubSettings() in DatabaseService**
  
  **Objective:** Implement the `updateClubSettings()` function in DatabaseService that creates or updates club settings with proper STD key patterns, validation, and error handling.
  
  **Acceptance Criteria:**
  - Function signature matches: `async function updateClubSettings(adminSub: string, settingsData: {...}): Promise<ClubSettings>`
  - Input validation: clubName (required, ≤255 chars), address (required, ≤500 chars), phone (required, valid format)
  - operatingHours (required, valid times), cancellationWindowHours (0-168), currency (ISO code)
  - Constructs record with correct STD keys using createClubSettings factory
  - Calls AppSync client ClubRecord.update() for upsert semantics
  - Returns ClubSettings record with createdAt/updatedAt timestamps
  - Throws ValidationError for invalid inputs, DatabaseError for AppSync/DynamoDB failures
  - Includes comprehensive JSDoc comments with STD pattern examples
  - Error messages are descriptive and actionable
  - TypeScript strict mode compliant
  
  **Implementation Steps:**
  
  1. Open `src/services/DatabaseService.ts` and add import:
  ```typescript
  import { createClubSettings, isClubSettings, type ClubSettings } from '../lib/models';
  ```
  
  2. Add custom error classes:
  ```typescript
  export class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }
  
  export class DatabaseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DatabaseError';
    }
  }
  ```
  
  3. Add validation helper functions (isValidPhone, isValidTime, isValidCurrency)
  
  4. Implement updateClubSettings() function with full validation and STD pattern adherence
  
  **Code Locations:**
  - **File:** `src/services/DatabaseService.ts`
  - **Add imports at:** line ~20 (after existing imports)
  - **Add error classes at:** line ~45 (before existing functions)
  - **Add updateClubSettings at:** line ~400+ (end of file)
  
  **Key Files to Modify:**
  - Modify: `src/services/DatabaseService.ts`
  
  **Testing Verification:**
  1. Run TypeScript compiler: `npm run build` (should succeed)
  2. Verify function exports: `grep -n "export async function updateClubSettings" src/services/DatabaseService.ts`
  3. Check error handling: Search for `ValidationError` and `DatabaseError` throws
  4. Verify JSDoc present: Function should have comprehensive comments

- [ ] **1.3 Implement createFacility() and listFacilities() in DatabaseService**
  
  **Objective:** Implement `createFacility()` and `listFacilities()` functions in DatabaseService for facility CRUD operations with STD patterns and proper error handling.
  
  **Acceptance Criteria:**
  - createFacility() signature: `async function createFacility(adminSub: string, facilityData: {...}): Promise<Facility>`
  - createFacility() generates unique facilityId (UUID or nanoid)
  - createFacility() validates facilityName (required, ≤100 chars) and maxCapacity (1-1000)
  - createFacility() constructs record with correct STD keys using createFacility factory
  - createFacility() calls AppSync ClubRecord.create() and returns Facility
  - listFacilities() signature: `async function listFacilities(adminSub: string): Promise<Facility[]>`
  - listFacilities() queries GSI1 with gsi1pk=`<adminSub>#FACILITIES`
  - listFacilities() filters by entityType='FACILITY'
  - listFacilities() returns facilities sorted by createdAt DESC
  - listFacilities() returns empty array [] if no facilities exist (not error)
  - Both functions throw ValidationError for invalid inputs, DatabaseError for API failures
  - Both functions include comprehensive JSDoc comments
  - TypeScript strict mode compliant
  
  **Implementation Steps:**
  
  1. Add import for uuid: `import { v4 as uuidv4 } from 'uuid';`
  
  2. Implement createFacility() function:
     - Validate facilityName and maxCapacity inputs
     - Generate unique ID using UUID
     - Construct record with STD keys
     - Call AppSync ClubRecord.create()
     - Return Facility record
  
  3. Implement listFacilities() function:
     - Query GSI1 with gsi1pk pattern
     - Filter results by entityType='FACILITY'
     - Sort by createdAt DESC
     - Return array (empty if no facilities)
  
  4. Add necessary imports for Facility type (rename createFacility factory to avoid conflict)
  
  **Code Locations:**
  - **File:** `src/services/DatabaseService.ts`
  - **Add uuid import at:** line ~20
  - **Add createFacility() at:** line ~500+ (after updateClubSettings)
  - **Add listFacilities() at:** line ~600+ (after createFacility)
  
  **Key Files to Modify:**
  - Modify: `src/services/DatabaseService.ts`
  
  **Testing Verification:**
  1. Run TypeScript compiler: `npm run build` (should succeed)
  2. Verify functions exist: grep for both function exports
  3. Check type guards used: `grep -n "isFacility" src/services/DatabaseService.ts`
  4. Verify uuid import present

### Phase 2: Component Foundation

- [ ] **2.1 Create SettingsDashboard Main Component Structure**
  
  **Objective:** Create comprehensive `SettingsDashboard.tsx` component with proper state management, hooks, and section rendering.
  
  **Acceptance Criteria:**
  - New SettingsDashboard.tsx component created in `src/components/settings/`
  - Component uses React hooks: useState, useEffect, useRef, useCallback
  - useAdminSub() hook integrated to get authenticated admin's Cognito SUB
  - State management for: formData, loading, saving, errors, facilities, documents
  - Initial data loading effect (useEffect) fetches settings and facilities
  - Subscription cleanup implemented on component unmount
  - Global error banner rendered at top of dashboard
  - Loading spinner displayed while fetching initial data
  - Component renders 4 sections: GeneralInfoSection, OperatingRulesSection, FacilitiesManagerSection, KnowledgeBaseSection
  - FacilityModal rendered conditionally based on state
  - All components properly typed with TypeScript interfaces
  - JSX properly formatted and indented
  - TypeScript compilation succeeds
  
  **Implementation Details:**
  - Initialize form state with default values
  - Set up useEffect for initial data loading
  - Implement error boundary and loading states
  - Create handler functions: handleFormChange, handleSaveSettings, handleAddFacility, etc.
  - Render all sub-components with proper props passing
  - Handle subscription cleanup on unmount
  
  **Code Locations:**
  - **Create:** `src/components/settings/SettingsDashboard.tsx`
  - **Create:** `src/components/common/LoadingOverlay.tsx`
  - **Modify:** `src/components/settings/index.ts`
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/SettingsDashboard.tsx`
  - Create: `src/components/common/LoadingOverlay.tsx`
  - Modify: `src/components/settings/index.ts`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Check component renders: Component should display without errors when mounted
  3. Verify hooks: useAdminSub, useState, useEffect all called correctly
  4. Check imports: All imported components and types should exist

- [ ] **2.2 Create Sub-Component Structure (Sections)**
  
  **Objective:** Create the four section sub-components for SettingsDashboard: GeneralInfoSection, OperatingRulesSection, FacilitiesManagerSection, and KnowledgeBaseSection.
  
  **Acceptance Criteria:**
  - GeneralInfoSection.tsx created with TextField components for clubName, address, phone, and SelectField for currency
  - OperatingRulesSection.tsx created with TimeField components for openingTime/closingTime and NumberField for cancellationWindowHours
  - FacilitiesManagerSection.tsx created with facilities list and "Add Facility" button
  - KnowledgeBaseSection.tsx created with file upload area and documents list
  - All components properly typed with TypeScript interfaces for props
  - All components styled with CSS modules (section wrapper with proper spacing)
  - Components accept errors prop and display error messages inline
  - Components accept disabled prop and disable inputs when true
  - Components use Amplify UI components (TextField, SelectField, Button, Heading)
  - Components export properly from index.ts
  - TypeScript compilation succeeds
  
  **Implementation Details:**
  - Each section receives formData, onChange, errors, disabled as props
  - TextField components have hasError and errorMessage props
  - Create types.ts file for shared FormData and S3Document interfaces
  - Use Amplify UI Table component for facilities list
  - Create upload area with file input for knowledge base
  
  **Code Locations:**
  - **Create:** `src/components/settings/GeneralInfoSection.tsx`
  - **Create:** `src/components/settings/OperatingRulesSection.tsx`
  - **Create:** `src/components/settings/FacilitiesManagerSection.tsx`
  - **Create:** `src/components/settings/KnowledgeBaseSection.tsx`
  - **Create:** `src/components/settings/types.ts`
  - **Modify:** `src/components/settings/index.ts`
  
  **Key Files to Modify/Create:**
  - Create: 5 new .tsx files in settings folder
  - Create: 1 types.ts file
  - Modify: index.ts
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build` (no errors)
  2. All imports resolve correctly
  3. Components render without errors when passed required props

- [ ] **2.3 Create FacilityModal Component**
  
  **Objective:** Implement the FacilityModal component with form validation, keyboard accessibility, and proper error handling.
  
  **Acceptance Criteria:**
  - FacilityModal.tsx created with modal structure
  - Modal contains TextField for facilityName and NumberField for maxCapacity
  - Modal has Save and Cancel buttons
  - Modal validates inputs before saving (facilityName required and ≤100 chars, maxCapacity 1-1000)
  - Modal displays field-level error messages
  - Modal closes on Cancel button or Escape key
  - Modal remains open on save failure and shows error message
  - Modal clears form data on successful save
  - Modal is keyboard-navigable (Tab, Enter, Escape)
  - Component properly typed with TypeScript interfaces
  - TypeScript compilation succeeds
  
  **Implementation Details:**
  - Use Amplify UI Modal component
  - Implement local form state for modal
  - Add validation before submission
  - Auto-focus facility name input when modal opens
  - Handle Escape key to cancel
  
  **Code Locations:**
  - **Create:** `src/components/settings/FacilityModal.tsx`
  - **Create:** `src/components/settings/FacilityModal.css`
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/FacilityModal.tsx`
  - Create: `src/components/settings/FacilityModal.css`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Modal renders when isOpen=true
  3. Validation works: form not submitted with empty facilityName
  4. Keyboard navigation: Tab moves between fields, Escape closes modal
  5. Error messages display inline

### Phase 3: Form Logic & State

- [ ] **3.1 Implement Form Validation Utility**
  
  **Objective:** Create reusable form validation utility function for the Settings form with comprehensive error checking and user-friendly messages.
  
  **Acceptance Criteria:**
  - validation.ts utility file created in `src/components/settings/utils/`
  - validateFormData() function validates all form fields
  - validateFormData() returns Record<string, string> with field-level errors
  - Validation rules match requirements (clubName ≤255, phone format, times, etc.)
  - Error messages are user-friendly and actionable
  - Helper functions created: isValidPhone(), isValidTime(), isValidCurrency()
  - All functions have JSDoc comments
  - TypeScript strict mode compliant
  - No `any` types used
  
  **Implementation Details:**
  - Create helper functions for phone, time, and currency validation
  - validateFormData() checks all fields and returns error map
  - hasFieldError() utility to check if field has error
  - getFieldError() utility to get error message for field
  
  **Code Locations:**
  - **Create:** `src/components/settings/utils/validation.ts`
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/utils/validation.ts`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Test validation function with various inputs
  3. Verify proper error messages returned
  4. Check edge cases handled correctly

- [ ] **3.2 Implement Custom Hook for Form State Management**
  
  **Objective:** Create custom React hook `useSettingsDashboard()` that centralizes form state logic, subscription setup, and data fetching.
  
  **Acceptance Criteria:**
  - useSettingsDashboard.ts hook file created in `src/components/settings/hooks/`
  - Hook initializes form state from existing settings or defaults
  - Hook handles AppSync subscription setup (placeholder for Task 10)
  - Hook returns settings data, loading state, and setFormData function
  - Hook properly cleans up subscriptions on unmount
  - Hook handles errors gracefully
  - TypeScript strict mode compliant
  - Hook exported from hooks/index.ts
  
  **Implementation Details:**
  - Fetch settings on mount using DatabaseService
  - Set up AppSync subscriptions for real-time updates
  - Handle subscription cleanup in return of useEffect
  - Provide error handling and loading states
  
  **Code Locations:**
  - **Create:** `src/components/settings/hooks/useSettingsDashboard.ts`
  - **Create:** `src/components/settings/hooks/index.ts`
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/hooks/useSettingsDashboard.ts`
  - Create: `src/components/settings/hooks/index.ts`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Hook exports correctly
  3. Hook handles null adminSub gracefully

- [ ] **3.3 Connect DatabaseService to Component Handlers**
  
  **Objective:** Wire DatabaseService functions into SettingsDashboard component handlers and ensure error handling, loading states, and success feedback work end-to-end.
  
  **Acceptance Criteria:**
  - SettingsDashboard handleSaveSettings() properly calls updateClubSettings()
  - SettingsDashboard handleSaveFacility() properly calls createFacility()
  - FacilityModal integration works: modal opens/closes correctly, saves facility
  - Error handling: ValidationError and DatabaseError caught and displayed
  - Loading states visible: saving/loading flags disable buttons during API calls
  - Success notifications logged (prepare for toast in future task)
  - Form state updates reflect backend changes
  - All error messages user-friendly and displayed to user
  - No unhandled promise rejections
  
  **Implementation Details:**
  - Add validation before API calls
  - Call DatabaseService functions with proper error handling
  - Update UI state based on API response
  - Display errors in global error banner
  - Show loading states during async operations
  
  **Code Locations:**
  - **File:** `src/components/settings/SettingsDashboard.tsx`
  - **Modify:** handleSaveSettings() function
  - **Modify:** handleSaveFacility() function
  - **Reference:** `src/components/settings/FacilityModal.tsx`
  - **Reference:** `src/components/settings/OperatingRulesSection.tsx`
  
  **Key Files to Modify/Create:**
  - Modify: `src/components/settings/SettingsDashboard.tsx` (handlers)
  - Reference: `src/components/settings/FacilityModal.tsx`
  - Reference: `src/components/settings/OperatingRulesSection.tsx`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Manual testing of form submission workflow
  3. Verify error handling catches all error types
  4. Check loading states display correctly

### Phase 4: Real-Time & Integration

- [ ] **4.1 Implement AppSync Subscriptions for Real-Time Updates**
  
  **Objective:** Implement AppSync subscription logic to listen for real-time changes to club settings and facilities, with automatic UI updates and cleanup.
  
  **Acceptance Criteria:**
  - Subscription setup in SettingsDashboard useEffect
  - Subscribe to ClubRecord changes for SETTINGS#GLOBAL records
  - Subscribe to ClubRecord changes for FACILITY records
  - When settings updated: form fields refresh automatically
  - When facility created/updated: facilities list refreshes automatically
  - Subscriptions properly cleaned up on component unmount
  - Memory leaks prevented (no duplicate subscriptions)
  - Error handling for subscription failures
  - TypeScript strict mode compliant
  
  **Implementation Details:**
  - Create subscriptions.ts utility file with helper functions
  - subscribeToSettingsChanges() function for settings updates
  - subscribeToFacilityChanges() function for facility updates
  - Return unsubscribe functions for cleanup
  - Handle subscription errors gracefully
  
  **Code Locations:**
  - **Create:** `src/components/settings/utils/subscriptions.ts`
  - **Modify:** `src/components/settings/SettingsDashboard.tsx` (update useEffect)
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/utils/subscriptions.ts`
  - Modify: `src/components/settings/SettingsDashboard.tsx`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Verify subscriptions set up and cleaned up properly
  3. Check console logs for subscription events
  4. Verify no memory leaks on unmount

- [ ] **4.2 Implement S3 Knowledge Base Upload and List Functionality**
  
  **Objective:** Implement file upload to S3 with tenant-scoped paths and document listing from knowledge base prefix.
  
  **Acceptance Criteria:**
  - Upload function uploads files to S3 with path: `lavida-baile-bh/<adminSub>/kb/<fileName>`
  - File type validation (PDF, DOCX, TXT only)
  - File size validation (max 10 MB)
  - List function retrieves all documents from admin's KB prefix
  - Uploaded files appear in documents list immediately
  - Error handling for upload/list failures with user-friendly messages
  - Tenant isolation enforced (admin can only access own KB prefix)
  - TypeScript strict mode compliant
  
  **Implementation Details:**
  - Create s3-helpers.ts utility file
  - validateFile() function checks type and size
  - uploadToKnowledgeBase() function uploads to S3
  - listKnowledgeBaseDocuments() function lists files in prefix
  - Integrate with KnowledgeBaseSection and SettingsDashboard
  
  **Code Locations:**
  - **Create:** `src/components/settings/utils/s3-helpers.ts`
  - **Modify:** `src/components/settings/SettingsDashboard.tsx` (S3 integration)
  - **Modify:** `src/components/settings/KnowledgeBaseSection.tsx`
  
  **Key Files to Modify/Create:**
  - Create: `src/components/settings/utils/s3-helpers.ts`
  - Modify: `src/components/settings/SettingsDashboard.tsx`
  - Modify: `src/components/settings/KnowledgeBaseSection.tsx`
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Test file upload with valid files
  3. Test file validation errors
  4. Verify S3 path structure
  5. Test document list retrieval

- [ ] **4.3 Implement Error Handling and Loading States**
  
  **Objective:** Add comprehensive error handling, loading states, and user feedback mechanisms across all components.
  
  **Acceptance Criteria:**
  - Global error banner displays and dismisses properly
  - Loading skeletons display during data fetch
  - Saving button shows loading state and disabled during save
  - Field-level error messages display inline
  - Empty state messages shown when no data exists
  - All error scenarios handled gracefully (no unhandled rejections)
  - User-friendly error messages (not technical jargon)
  - Loading spinners/skeletons match Amplify UI design
  - No error messages leaked to user when gracefully degraded
  
  **Implementation Details:**
  - Enhance LoadingOverlay component with skeleton placeholders
  - Create ErrorBoundary component for React error catching
  - Create EmptyState component for no data scenarios
  - Add comprehensive error handling in all handlers
  - Display user-friendly error messages
  
  **Code Locations:**
  - **Modify:** `src/components/common/LoadingOverlay.tsx`
  - **Create:** `src/components/common/LoadingOverlay.css`
  - **Create:** `src/components/common/ErrorBoundary.tsx`
  - **Create:** `src/components/common/EmptyState.tsx`
  - **Create:** `src/components/common/EmptyState.css`
  - **Modify:** Section components to use EmptyState
  - **Modify:** `src/components/settings/SettingsDashboard.tsx` error handling
  
  **Key Files to Modify/Create:**
  - Create: 3 new common components
  - Modify: Settings sections to use components
  - Modify: SettingsDashboard error handling
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Test all loading states
  3. Test error scenarios
  4. Verify empty states display
  5. Check error messages are user-friendly

### Phase 5: Styling & Responsiveness

- [ ] **5.1 Create Responsive CSS Layout for SettingsDashboard**
  
  **Objective:** Implement responsive CSS styling using Amplify UI tokens and CSS modules for mobile, tablet, and desktop breakpoints.
  
  **Acceptance Criteria:**
  - SettingsDashboard.css created with responsive layout
  - Mobile layout (< 768px): single column, full-width inputs, stacked sections
  - Tablet layout (768px - 1024px): optimized spacing, 2-column forms
  - Desktop layout (> 1024px): efficient use of space, proper max-widths
  - All components use Amplify UI tokens for colors, spacing, typography
  - No Tailwind CSS used (CSS modules only)
  - Touch targets ≥ 44px on mobile for accessibility
  - Proper spacing between sections and fields
  - Responsive tables/lists render correctly on all screen sizes
  - No layout shifts or broken positioning on resize
  
  **Implementation Details:**
  - Create SettingsDashboard.css with responsive grid
  - Create sections.css for shared section styling
  - Enhance FacilityModal.css with responsive design
  - Use Amplify UI tokens for all colors and spacing
  - Implement media queries for mobile/tablet/desktop
  
  **Code Locations:**
  - **Create:** `src/components/settings/SettingsDashboard.css`
  - **Create:** `src/components/settings/sections.css`
  - **Enhance:** `src/components/settings/FacilityModal.css`
  
  **Key Files to Modify/Create:**
  - Create: 2 CSS module files for settings
  - Enhance: 1 existing CSS file
  
  **Testing Verification:**
  1. TypeScript compilation: `npm run build`
  2. Responsive testing on multiple screen sizes
  3. Verify touch targets ≥ 44px
  4. Check no Tailwind classes used
  5. Verify proper spacing on all breakpoints

- [ ] **5.2 Create Component Integration Tests & Verification**
  
  **Objective:** Perform integration testing of all components, verify they work together, and conduct end-to-end testing of main user workflows.
  
  **Acceptance Criteria:**
  - All components render without errors
  - Form submission works end-to-end (save settings to database)
  - Facility creation works end-to-end (create facility, appears in list)
  - Real-time updates work (changes appear without refresh)
  - File upload works end-to-end (file uploaded, appears in KB list)
  - Error scenarios handled (validation, API errors, network errors)
  - Loading states display correctly during all async operations
  - Responsive layout works on mobile, tablet, desktop
  - No console errors or warnings
  - No memory leaks on component mount/unmount
  - Accessibility: keyboard navigation works, ARIA labels present
  
  **Implementation Details:**
  - Create integration test file using React Testing Library
  - Test component rendering and interactions
  - Test API integration with mocked DatabaseService
  - Test error handling scenarios
  - Verify real-time updates work
  - Test accessibility with keyboard navigation
  
  **Code Locations:**
  - **Create:** `src/components/settings/__tests__/SettingsDashboard.integration.test.tsx`
  
  **Key Files to Modify/Create:**
  - Create: Test file in __tests__ directory
  
  **Testing Verification:**
  1. Run unit tests: `npm test`
  2. Run integration tests: `npm test -- --testPathPattern=integration`
  3. Manual E2E testing using provided checklist
  4. Performance testing: check Lighthouse score ≥ 85

### Phase 6: Documentation & Verification

- [ ] **6.1 Documentation and Code Quality Verification**
  
  **Objective:** Create comprehensive documentation, verify all code quality standards, and prepare for deployment.
  
  **Acceptance Criteria:**
  - TypeScript strict mode compilation succeeds: `npm run build`
  - No ESLint warnings or errors: `npm run lint`
  - All functions have JSDoc comments with examples
  - README.md created documenting Settings Tab feature
  - Code follows architecture rules (no sidebar, tab-based, STD patterns)
  - All imports are explicit (no `any` types)
  - Environment variables documented (S3 bucket, API endpoints)
  - Deployment checklist completed
  
  **Implementation Details:**
  - Create README.md in component directory
  - Verify TypeScript compilation with strict mode
  - Run linter and fix any issues
  - Document all public APIs
  - List environment variables needed
  - Create deployment checklist
  
  **Code Locations:**
  - **Create:** `src/components/settings/README.md`
  
  **Key Files to Modify/Create:**
  - Create: Documentation files
  - Verify: All code quality standards
  
  **Verification Checklist:**
  ```bash
  npm run build               # Should succeed
  npm run lint               # Should pass
  npm test                   # Should pass
  grep -r 'any\b' src/components/settings || echo "✓ No any types"
  ```

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "description": "Phase 1: Core Database Models",
      "tasks": ["1.1", "1.2"]
    },
    {
      "id": 1,
      "description": "Phase 1: DatabaseService Facilities",
      "tasks": ["1.3"]
    },
    {
      "id": 2,
      "description": "Phase 2: Main Component & Sub-Components",
      "tasks": ["2.1", "2.2"]
    },
    {
      "id": 3,
      "description": "Phase 2: Modal & Form Utilities",
      "tasks": ["2.3"]
    },
    {
      "id": 4,
      "description": "Phase 3: Validation & Hooks",
      "tasks": ["3.1", "3.2"]
    },
    {
      "id": 5,
      "description": "Phase 3: Component Integration",
      "tasks": ["3.3"]
    },
    {
      "id": 6,
      "description": "Phase 4: Real-Time & Storage",
      "tasks": ["4.1", "4.2"]
    },
    {
      "id": 7,
      "description": "Phase 4: Error Handling",
      "tasks": ["4.3"]
    },
    {
      "id": 8,
      "description": "Phase 5: Styling & Testing",
      "tasks": ["5.1", "5.2"]
    },
    {
      "id": 9,
      "description": "Phase 6: Documentation",
      "tasks": ["6.1"]
    }
  ]
}
```

---

## Success Criteria

### Build & Compilation

- TypeScript strict mode: `npm run build` succeeds with no errors
- All imports resolve correctly
- No `any` types in new code
- No unused imports or variables
- ESLint passes: `npm run lint`

### Functionality

- Club settings can be created and updated
- Facility CRUD operations work correctly
- Files can be uploaded to S3 knowledge base
- Real-time subscriptions update UI
- Form validation works for all fields
- Error handling catches and displays all error types
- Loading states display during async operations

### Component Quality

- All components use TypeScript strict mode
- All functions have JSDoc comments
- Components follow Amplify UI patterns
- No sidebar navigation (tab-based only)
- Uses only native AWS services
- Follows Single-Table Design patterns
- Multi-tenant isolation enforced (adminSub as partition key)

### User Experience

- Mobile responsive (< 768px)
- Tablet responsive (768px - 1024px)
- Desktop optimized (> 1024px)
- Touch targets ≥ 44px on mobile
- Keyboard navigable (Tab, Enter, Escape)
- Error messages user-friendly and actionable
- Loading indicators visible during async operations
- Empty states displayed when no data
- Form fields have clear labels and validation messages

---

## Notes

### Implementation Tips

1. **Start with Phase 1 (DatabaseService):** Getting data layer correct is critical. All components depend on these functions.

2. **Use TypeScript strictly:** Enable strict mode checks to catch errors early. The architecture mandates strict typing throughout.

3. **Follow STD Patterns:** Every database function must follow Single-Table Design patterns:
   - Use `pk: <adminSub>` for tenant isolation
   - Use `sk: ENTITY#<id>` for entity type discrimination
   - Use `gsi1pk` for query patterns
   - Always filter by `adminSub` in queries

4. **Amplify UI First:** Use Amplify UI components as primary library. Only add third-party libraries when Amplify has no equivalent.

5. **Error Handling:** Always catch both ValidationError and DatabaseError separately:
   - ValidationError = user input problem (display to user)
   - DatabaseError = system problem (log and show friendly message)

6. **Test Early:** Don't wait until the end. Test each task as you complete it. This catches issues early.

7. **Clean Up:** Always implement cleanup:
   - Unsubscribe from AppSync subscriptions on unmount
   - Clear timeouts/intervals
   - Reset modal/form state on close

8. **CSS Modules:** Use CSS modules, not inline styles or Tailwind. Import as: `import styles from './Component.css'`

9. **Accessibility:** 
   - Every input needs a label
   - Every error needs an aria-label
   - Touch targets must be ≥ 44px on mobile
   - Use semantic HTML (form, fieldset, legend)

10. **Multi-Tenancy:** Always filter queries by `adminSub`. Never query across admin boundaries.

### Common Pitfalls to Avoid

- ❌ Using `any` types instead of proper TypeScript
- ❌ Forgetting to clean up subscriptions (memory leak)
- ❌ Not validating input before API calls
- ❌ Hardcoding credentials or secrets in code
- ❌ Querying without adminSub filter (security issue)
- ❌ Using REST instead of AppSync (violates architecture)
- ❌ Adding sidebar navigation (violates tab-based requirement)
- ❌ Importing Tailwind or other CSS frameworks
- ❌ Not handling loading/error states
- ❌ Not testing on mobile devices

### File Structure Created

```
src/
├── components/
│   ├── settings/
│   │   ├── SettingsDashboard.tsx
│   │   ├── SettingsDashboard.css
│   │   ├── GeneralInfoSection.tsx
│   │   ├── OperatingRulesSection.tsx
│   │   ├── FacilitiesManagerSection.tsx
│   │   ├── KnowledgeBaseSection.tsx
│   │   ├── FacilityModal.tsx
│   │   ├── FacilityModal.css
│   │   ├── sections.css
│   │   ├── types.ts
│   │   ├── utils/
│   │   │   ├── validation.ts
│   │   │   ├── subscriptions.ts
│   │   │   └── s3-helpers.ts
│   │   ├── hooks/
│   │   │   ├── useSettingsDashboard.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   │   └── SettingsDashboard.integration.test.tsx
│   │   ├── README.md
│   │   └── index.ts
│   └── common/
│       ├── LoadingOverlay.tsx
│       ├── LoadingOverlay.css
│       ├── ErrorBoundary.tsx
│       ├── EmptyState.tsx
│       └── EmptyState.css
└── services/
    └── DatabaseService.ts (modified)
```

### Environment Variables

Required AWS configuration (in .env or environment):
- `VITE_AWS_REGION` - AWS region (e.g., 'us-east-1')
- `VITE_COGNITO_USER_POOL_ID` - Cognito user pool ID
- `VITE_COGNITO_CLIENT_ID` - Cognito app client ID
- `VITE_APPSYNC_API_ENDPOINT` - AppSync GraphQL endpoint
- `VITE_S3_BUCKET` - S3 bucket name (e.g., 'lavida-baile-bh')

### Deployment Checklist

Before deploying to production:

- [ ] All TypeScript compilation succeeds
- [ ] All tests pass (unit + integration)
- [ ] No ESLint warnings
- [ ] Tested on Chrome, Firefox, Safari
- [ ] Tested on iOS and Android devices
- [ ] Tested on tablet (iPad, etc.)
- [ ] Performance: Initial load < 500ms
- [ ] Accessibility: Keyboard navigation works
- [ ] Error scenarios tested
- [ ] S3 bucket configured with proper IAM
- [ ] AppSync subscriptions tested
- [ ] DynamoDB table has all GSIs
- [ ] Cognito groups configured
- [ ] No hardcoded credentials
- [ ] Secrets in AWS Secrets Manager
- [ ] Documentation complete
- [ ] Code review approved

---

*Document Version: 1.0*  
*Status: Ready for Implementation*  
*Last Updated: 2024*
