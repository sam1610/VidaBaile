// Feature: core-architecture-database
// Property-based tests for shared validation library (src/lib/validators.ts)

import * as fc from 'fast-check';
import {
  validateMemberStatus,
  validateMemberTier,
  validateScheduleCapacity,
  validateBookingStatus,
  validatePackageMemberRef,
  validatePackageConstraints,
  validateClaimCredits,
} from '../lib/validators';

// ── P1 — invalid Member status always rejected ────────────────────────────────

// Feature: core-architecture-database, Property 1: invalid Member status is always rejected
describe('P1 — validateMemberStatus', () => {
  it('rejects any string that is not ACTIVE, INACTIVE, or SUSPENDED', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED']).has(s)),
        (invalid) => {
          const result = validateMemberStatus(invalid);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P2 — invalid Member tier always rejected ──────────────────────────────────

// Feature: core-architecture-database, Property 2: invalid Member tier is always rejected
describe('P2 — validateMemberTier', () => {
  it('rejects any string that is not STANDARD, SILVER, GOLD, or PLATINUM', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !new Set(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']).has(s)),
        (invalid) => {
          const result = validateMemberTier(invalid);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P3 — Schedule capacity outside [1,500] always rejected; within [1,500] always accepted ──

// Feature: core-architecture-database, Property 3: Schedule capacity outside valid bounds is always rejected
describe('P3 — validateScheduleCapacity', () => {
  it('rejects integers outside the valid range [1, 500]', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 501 })),
        (invalid) => {
          const result = validateScheduleCapacity(invalid);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts integers within the valid range [1, 500]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (valid) => {
          const result = validateScheduleCapacity(valid);
          return result.valid === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P4 — invalid Booking status always rejected ───────────────────────────────

// Feature: core-architecture-database, Property 4: invalid Booking status is always rejected
describe('P4 — validateBookingStatus', () => {
  it('rejects any string that is not CONFIRMED, CANCELLED, or PENDING', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !new Set(['CONFIRMED', 'CANCELLED', 'PENDING']).has(s)),
        (invalid) => {
          const result = validateBookingStatus(invalid);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P5 — Booking referential integrity always enforced ────────────────────────

// Feature: core-architecture-database, Property 5: Booking referential integrity is always enforced
describe('P5 — validatePackageMemberRef (booking context)', () => {
  it('rejects a memberId not present in the existing member set', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 })).map(ids => new Set(ids)),
        (memberId, existingIds) => {
          // Guarantee the memberId is not in the set
          existingIds.delete(memberId);
          const result = validatePackageMemberRef(memberId, existingIds);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P6 — Package multi-constraint validation always enforced ──────────────────

// Feature: core-architecture-database, Property 6: Package multi-constraint validation is always enforced
describe('P6 — validatePackageConstraints', () => {
  // Helper: a date string in YYYY-MM-DD format (handles years outside 0000–9999 by clamping)
  const isoDate = (d: Date): string => {
    const year = Math.min(Math.max(d.getFullYear(), 1900), 9999);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Baseline valid params (overridden per sub-case)
  const baseParams = {
    totalCredits: 10,
    remainingCredits: 5,
    validFrom: '2025-01-01',
    validUntil: '2025-12-31',
    price: 99.99,
    currency: 'USD',
  };

  it('sub-case a: rejects when remainingCredits > totalCredits', () => {
    fc.assert(
      fc.property(
        fc.integer().chain(total =>
          fc.integer({ min: total + 1 }).map(remaining => ({ total, remaining })),
        ),
        ({ total, remaining }) => {
          const result = validatePackageConstraints({
            ...baseParams,
            totalCredits: total,
            remainingCredits: remaining,
          });
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sub-case b: rejects when validUntil is strictly earlier than validFrom', () => {
    // Constrain dates to a safe range (1970–2200) so YYYY-MM-DD strings compare correctly
    const MIN_DATE = new Date('1970-01-02T00:00:00.000Z'); // min for d1 (needs room below)
    const MAX_DATE = new Date('2200-12-31T00:00:00.000Z');
    fc.assert(
      fc.property(
        fc.date({ min: MIN_DATE, max: MAX_DATE }).chain(d1 =>
          fc.date({ min: new Date('1970-01-01T00:00:00.000Z'), max: new Date(d1.getTime() - 86400000) }).map(d2 => ({
            validFrom: d1,
            validUntil: d2,
          })),
        ),
        ({ validFrom, validUntil }) => {
          const result = validatePackageConstraints({
            ...baseParams,
            validFrom: isoDate(validFrom),
            validUntil: isoDate(validUntil),
          });
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sub-case c: rejects price outside [0.01, 999999.99]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // prices below 0.01 — use double to avoid 32-bit float constraint issues
          fc.double({ max: Math.fround(0.009), noNaN: true, noDefaultInfinity: true }),
          // prices above 999999.99
          fc.double({ min: 1000000, noNaN: true, noDefaultInfinity: true }),
        ),
        (invalidPrice) => {
          const result = validatePackageConstraints({
            ...baseParams,
            price: invalidPrice,
          });
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sub-case d: rejects currency with length !== 3', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s.length !== 3),
        (invalidCurrency) => {
          const result = validatePackageConstraints({
            ...baseParams,
            currency: invalidCurrency,
          });
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P7 — Package member referential integrity always enforced ─────────────────

// Feature: core-architecture-database, Property 7: Package member referential integrity is always enforced
describe('P7 — validatePackageMemberRef (package context)', () => {
  it('rejects a memberId not present in the existing member set', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 })).map(ids => new Set(ids)),
        (memberId, existingIds) => {
          // Guarantee the memberId is not in the set
          existingIds.delete(memberId);
          const result = validatePackageMemberRef(memberId, existingIds);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P8 — Claim with non-positive creditsConsumed always rejected ──────────────

// Feature: core-architecture-database, Property 8: Claim with non-positive creditsConsumed is always rejected
describe('P8 — validateClaimCredits', () => {
  it('rejects creditsConsumed values that are zero or negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        (invalid) => {
          const result = validateClaimCredits(invalid);
          return result.valid === false && result.error !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});
