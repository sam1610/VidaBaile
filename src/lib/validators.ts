// Shared validation library for VidaBaile resolver and schema-level field validation.
// These are pure functions used by AppSync Lambda resolvers and property-based tests.

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface PackageConstraintParams {
  totalCredits: number;
  remainingCredits: number;
  validFrom: string; // ISO 8601 date string: YYYY-MM-DD
  validUntil: string; // ISO 8601 date string: YYYY-MM-DD
  price: number;
  currency: string;
}

// ── Member validators ────────────────────────────────────────────────────────

const VALID_MEMBER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

/**
 * Validates the `status` field of a Member entity.
 * Accepts: ACTIVE | INACTIVE | SUSPENDED
 * Validates: Requirements 5.5
 */
export function validateMemberStatus(value: string): ValidationResult {
  if (VALID_MEMBER_STATUSES.has(value)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Validation failed: status must be one of ACTIVE, INACTIVE, SUSPENDED — received "${value}"`,
  };
}

const VALID_MEMBER_TIERS = new Set(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']);

/**
 * Validates the `tier` field of a Member entity.
 * Accepts: STANDARD | SILVER | GOLD | PLATINUM
 * Validates: Requirements 5.6
 */
export function validateMemberTier(value: string): ValidationResult {
  if (VALID_MEMBER_TIERS.has(value)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Validation failed: tier must be one of STANDARD, SILVER, GOLD, PLATINUM — received "${value}"`,
  };
}

// ── Schedule validators ──────────────────────────────────────────────────────

/**
 * Validates the `capacity` field of a Schedule entity.
 * Accepts: integers in the closed interval [1, 500].
 * Validates: Requirements 7.1
 */
export function validateScheduleCapacity(value: number): ValidationResult {
  if (!Number.isInteger(value)) {
    return {
      valid: false,
      error: `Validation failed: capacity must be an integer — received ${value}`,
    };
  }
  if (value < 1 || value > 500) {
    return {
      valid: false,
      error: `Validation failed: capacity must be between 1 and 500 (inclusive) — received ${value}`,
    };
  }
  return { valid: true };
}

// ── Booking validators ───────────────────────────────────────────────────────

const VALID_BOOKING_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'PENDING']);

/**
 * Validates the `status` field of a Booking entity.
 * Accepts: CONFIRMED | CANCELLED | PENDING
 * Validates: Requirements 8.5
 */
export function validateBookingStatus(value: string): ValidationResult {
  if (VALID_BOOKING_STATUSES.has(value)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Validation failed: status must be one of CONFIRMED, CANCELLED, PENDING — received "${value}"`,
  };
}

// ── Package validators ───────────────────────────────────────────────────────

/**
 * Validates multi-field constraints on a Package entity.
 * Rejects if:
 *   - remainingCredits > totalCredits
 *   - validUntil is strictly earlier than validFrom
 *   - price < 0.01 or price > 999999.99
 *   - currency length is not exactly 3 characters
 * Validates: Requirements 9.4
 */
export function validatePackageConstraints(params: PackageConstraintParams): ValidationResult {
  const { totalCredits, remainingCredits, validFrom, validUntil, price, currency } = params;

  if (remainingCredits > totalCredits) {
    return {
      valid: false,
      error: `Validation failed: remainingCredits (${remainingCredits}) cannot exceed totalCredits (${totalCredits})`,
    };
  }

  // Compare dates lexicographically — valid for ISO 8601 YYYY-MM-DD strings
  if (validUntil < validFrom) {
    return {
      valid: false,
      error: `Validation failed: validUntil (${validUntil}) must be greater than or equal to validFrom (${validFrom})`,
    };
  }

  if (price < 0.01 || price > 999999.99) {
    return {
      valid: false,
      error: `Validation failed: price must be between 0.01 and 999999.99 — received ${price}`,
    };
  }

  if (currency.length !== 3) {
    return {
      valid: false,
      error: `Validation failed: currency must be exactly 3 characters (ISO 4217) — received "${currency}" (length ${currency.length})`,
    };
  }

  return { valid: true };
}

/**
 * Validates the `memberId` referential integrity for Package creation.
 * Rejects if memberId is provided but not found in the set of existing member IDs.
 * Validates: Requirements 8.6, 9.5
 */
export function validatePackageMemberRef(
  memberId: string | undefined,
  existingMemberIds: Set<string>,
): ValidationResult {
  if (memberId === undefined) {
    // memberId is optional on Package — absence is valid
    return { valid: true };
  }
  if (!existingMemberIds.has(memberId)) {
    return {
      valid: false,
      error: `Validation failed: member "${memberId}" does not exist`,
    };
  }
  return { valid: true };
}

// ── Claim validators ─────────────────────────────────────────────────────────

/**
 * Validates the `creditsConsumed` field of a Claim entity.
 * Rejects if value is less than or equal to zero.
 * Validates: Requirements 10.1
 */
export function validateClaimCredits(creditsConsumed: number): ValidationResult {
  if (creditsConsumed <= 0) {
    return {
      valid: false,
      error: `Validation failed: creditsConsumed must be at least 1 — received ${creditsConsumed}`,
    };
  }
  return { valid: true };
}
