/**
 * @vitest-environment jsdom
 *
 * ActivitiesTab — frontend component tests for the "Generate Auto-Schedule" button.
 *
 * Mocking strategy
 * ─────────────────
 * • aws-amplify/data generateClient → stub whose mutations.generateTimetable is spied on.
 * • useAdminSub hook → fixed adminSub (auth never in-flight).
 * • DatabaseService → stubs returning empty data (no network calls).
 * • ActivityCrudModal → renders null (not under test here).
 */

// ── Static mocks ─────────────────────────────────────────────────────────────
// All vi.mock() calls are hoisted to the top of the file by Vitest.
// Factories that reference vi.fn() must be synchronous (no async factories).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';


const ADMIN_SUB = 'test-admin-sub-001';

// ── Mock: useAdminSub ────────────────────────────────────────────────────────
vi.mock('../hooks', () => ({
  useAdminSub: () => ({ adminSub: ADMIN_SUB, loading: false, error: null }),
  useAppSync:  () => ({}),
}));

// ── Mock: DatabaseService (default export) ───────────────────────────────────
vi.mock('../services/DatabaseService', () => {
  return {
    default: {
      queryCoachesForScheduling: () => Promise.resolve([]),
      queryFacilitiesForScheduling: () => Promise.resolve([]),
      // Returns an unsubscribe function — CRITICAL: must return a function, not {}
      observeSchedulesByDateRange: (_a: any, _b: any, _c: any, cb: any) => {
        cb([]);
        return () => {};
      },
      createScheduleRecord: () => Promise.resolve({}),
      updateScheduleRecord: () => Promise.resolve({}),
      deleteScheduleRecord: () => Promise.resolve({}),
    },
  };
});

// ── Mock: ActivityCrudModal ──────────────────────────────────────────────────
vi.mock('../components/activities/ActivityCrudModal', () => ({
  ActivityCrudModal: () => null,
}));

// ── Mock: aws-amplify/data ───────────────────────────────────────────────────
// generateTimetableSpy is defined here so each test can replace it via
// mockResolvedValue / mockRejectedValue without recreating the mock.
const generateTimetableSpy = vi.fn();

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    mutations: {
      generateTimetable: generateTimetableSpy,
    },
    models: {},
  }),
}));

// ── Component import (after all mocks) ───────────────────────────────────────
import { ActivitiesTab } from '../components/activities/ActivitiesTab';

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ActivitiesTab — Generate Auto-Schedule button', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderTab() {
    return render(<ActivitiesTab />);
  }

  function getBtn() {
    return screen.getByTestId('generate-auto-schedule-btn');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1 — Button renders enabled
  // ─────────────────────────────────────────────────────────────────────────
  it('renders the Generate Auto-Schedule button in an enabled state', async () => {
    renderTab();
    // Wait for initial useEffect to settle
    await waitFor(() => expect(getBtn()).toBeInTheDocument());
    expect(getBtn()).not.toBeDisabled();
    expect(getBtn()).toHaveTextContent('Generate Auto-Schedule');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2 — Button enters disabled/loading state during mutation
  // ─────────────────────────────────────────────────────────────────────────
  it('disables the button and shows "Generating…" while the mutation is in-flight', async () => {
    // Never-resolving promise — keeps the async handler suspended
    generateTimetableSpy.mockReturnValue(new Promise(() => {}));

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    act(() => { fireEvent.click(getBtn()); });

    await waitFor(() => expect(getBtn()).toBeDisabled());
    expect(getBtn()).toHaveTextContent('Generating');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3 — Mutation called with correct adminSub
  // ─────────────────────────────────────────────────────────────────────────
  it('calls generateTimetable mutation with the correct adminSub', async () => {
    generateTimetableSpy.mockResolvedValue({
      data:   { processed: 2, schedules: ['s1', 's2'], warnings: [], errors: [] },
      errors: null,
    });

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    await act(async () => { fireEvent.click(getBtn()); });

    await waitFor(() => expect(generateTimetableSpy).toHaveBeenCalledTimes(1));
    expect(generateTimetableSpy).toHaveBeenCalledWith({ adminSub: ADMIN_SUB });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4 — Success banner appears with processed count
  // ─────────────────────────────────────────────────────────────────────────
  it('shows a success banner with the processed count after mutation completes', async () => {
    generateTimetableSpy.mockResolvedValue({
      data:   { processed: 3, schedules: ['s1','s2','s3'], warnings: [], errors: [] },
      errors: null,
    });

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    await act(async () => { fireEvent.click(getBtn()); });

    await waitFor(() =>
      expect(screen.getByTestId('generate-result-banner')).toBeInTheDocument()
    );
    expect(screen.getByTestId('generate-result-banner')).toHaveTextContent('3');
    expect(screen.getByTestId('generate-result-banner')).toHaveTextContent('draft schedule');
    expect(getBtn()).not.toBeDisabled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5 — Warning count in banner
  // ─────────────────────────────────────────────────────────────────────────
  it('includes warning count in the banner when the engine returns warnings', async () => {
    generateTimetableSpy.mockResolvedValue({
      data: {
        processed: 1,
        schedules: ['s1'],
        warnings:  ['No coach available'],
        errors:    [],
      },
      errors: null,
    });

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    await act(async () => { fireEvent.click(getBtn()); });

    await waitFor(() =>
      expect(screen.getByTestId('generate-result-banner')).toHaveTextContent('1 warning')
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 — GraphQL errors
  // ─────────────────────────────────────────────────────────────────────────
  it('shows an error banner when the mutation returns GraphQL errors', async () => {
    generateTimetableSpy.mockResolvedValue({
      data:   null,
      errors: [{ message: 'Unauthorized: Admins group required' }],
    });

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    await act(async () => { fireEvent.click(getBtn()); });

    await waitFor(() => {
      const banner = screen.getByTestId('generate-result-banner');
      expect(banner).toHaveTextContent('Error');
      expect(banner).toHaveTextContent('Unauthorized');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7 — Thrown network error
  // ─────────────────────────────────────────────────────────────────────────
  it('shows an error banner when the mutation call throws', async () => {
    generateTimetableSpy.mockRejectedValue(new Error('Network timeout'));

    renderTab();
    await waitFor(() => expect(getBtn()).not.toBeDisabled());

    await act(async () => { fireEvent.click(getBtn()); });

    await waitFor(() => {
      const banner = screen.getByTestId('generate-result-banner');
      expect(banner).toHaveTextContent('Error');
      expect(banner).toHaveTextContent('Network timeout');
    });
    expect(getBtn()).not.toBeDisabled();
  });
});
