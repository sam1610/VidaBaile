/**
 * @vitest-environment node
 *
 * amplify/data/resource.ts — schema definition checks.
 *
 * These tests do NOT deploy to AWS.  They inspect the TypeScript source and
 * the module's runtime exports to verify the `generateTimetable` custom
 * mutation is correctly declared before any sandbox deployment.
 *
 * Source-text checks are preferred over runtime introspection of Amplify
 * schema builder internals, whose shape is version-specific and not part of
 * the public API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve }      from 'path';

// Convenience: read the schema source once
const SCHEMA_SRC = readFileSync(
  resolve(process.cwd(), 'amplify/data/resource.ts'),
  'utf8'
);

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AppSync schema — generateTimetable mutation', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1 — Module loads without errors
  // ─────────────────────────────────────────────────────────────────────────
  it('resource.ts imports and exports without throwing', async () => {
    const mod = await import('../../amplify/data/resource.js').catch(() =>
      import('../../amplify/data/resource')
    );
    expect(mod).toBeDefined();
    // `data` is the defineData return value — must be present
    expect(mod.data).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2 — generateTimetable mutation is declared in the schema source
  // ─────────────────────────────────────────────────────────────────────────
  it('declares a generateTimetable mutation using a.mutation()', () => {
    expect(SCHEMA_SRC).toContain('generateTimetable');
    // Must use the a.mutation() builder (not a.query())
    expect(SCHEMA_SRC).toContain('.mutation()');
    // Must return JSON
    expect(SCHEMA_SRC).toContain('.returns(a.json())');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3 — adminSub argument is declared as a required string
  // ─────────────────────────────────────────────────────────────────────────
  it('declares adminSub as a required string argument', () => {
    // Find the mutation block
    const mutationIdx = SCHEMA_SRC.indexOf('generateTimetable');
    expect(mutationIdx).toBeGreaterThan(-1);

    // Extract the chunk of source from the mutation definition
    const chunk = SCHEMA_SRC.slice(mutationIdx, mutationIdx + 800);

    // adminSub must appear inside the mutation definition
    expect(chunk).toContain('adminSub');

    // a.string() must be used for the argument
    expect(chunk).toContain('a.string()');

    // .required() must follow
    expect(chunk).toContain('required()');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4 — Admins group authorization is applied to the mutation
  // ─────────────────────────────────────────────────────────────────────────
  it('restricts the mutation to the Admins Cognito group', () => {
    const mutationIdx = SCHEMA_SRC.indexOf('generateTimetable');
    expect(mutationIdx).toBeGreaterThan(-1);

    // The authorization rule must appear after the mutation definition.
    // Scan up to 500 chars past the mutation name.
    const chunk = SCHEMA_SRC.slice(mutationIdx, mutationIdx + 800);
    expect(chunk).toContain("'Admins'");
    expect(chunk).toContain('allow.groups');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5 — Handler is wired to the vidaBaileSchedulingEngine function
  // ─────────────────────────────────────────────────────────────────────────
  it('binds the handler to vidaBaileSchedulingEngine via a.handler.function()', () => {
    const mutationIdx = SCHEMA_SRC.indexOf('generateTimetable');
    const chunk = SCHEMA_SRC.slice(mutationIdx, mutationIdx + 800);

    expect(chunk).toContain('a.handler.function(vidaBaileSchedulingEngine)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 — The scheduling engine function resource is importable
  // ─────────────────────────────────────────────────────────────────────────
  it('vidaBaileSchedulingEngine function resource loads cleanly', async () => {
    const fnMod = await import(
      '../../amplify/functions/vidaBaileSchedulingEngine/resource.js'
    ).catch(() =>
      import('../../amplify/functions/vidaBaileSchedulingEngine/resource')
    );

    expect(fnMod).toBeDefined();
    expect(fnMod.vidaBaileSchedulingEngine).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7 — Import statement for the function is present in the schema file
  // ─────────────────────────────────────────────────────────────────────────
  it('imports vidaBaileSchedulingEngine at the top of resource.ts', () => {
    expect(SCHEMA_SRC).toContain(
      "import { vidaBaileSchedulingEngine } from '../functions/vidaBaileSchedulingEngine/resource'"
    );
  });
});
