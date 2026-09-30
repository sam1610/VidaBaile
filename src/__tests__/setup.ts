/**
 * Global test setup — runs before every test file.
 *
 * 1. Extends Vitest matchers with @testing-library/jest-dom expectations
 *    (toBeInTheDocument, toHaveTextContent, …).
 * 2. Sets shared environment variables used by all Lambda handlers so
 *    individual tests don't have to repeat them.
 */
import '@testing-library/jest-dom';

// Shared Lambda environment variables
process.env.TABLE_NAME            = 'VidaBaile-Test-ClubRecord';
process.env.DEFAULT_ADMIN_SUB     = 'test-admin-sub-001';
process.env.FLOW_PRIVATE_KEY      = '';   // individual crypto tests supply this
