// Feature: core-architecture-database
// Tests for Amplify initialisation order — Requirements 1.4, 1.7

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const mainSrc   = fs.readFileSync(path.resolve(__dirname, '../../src/main.tsx'), 'utf-8');
const configSrc = fs.readFileSync(path.resolve(__dirname, '../../src/lib/amplify-config.ts'), 'utf-8');
const outputsSrc = fs.readFileSync(path.resolve(__dirname, '../../src/lib/amplify-outputs.ts'), 'utf-8');

// ── amplify-config.ts ────────────────────────────────────────────────────────
describe('amplify-config.ts', () => {
  it('calls Amplify.configure() at module level', () => {
    expect(configSrc).toContain('Amplify.configure(');
  });

  it('imports from the generated amplify-outputs module', () => {
    expect(configSrc).toContain('./amplify-outputs');
  });

  it('imports Amplify from aws-amplify', () => {
    expect(configSrc).toContain("from 'aws-amplify'");
  });
});

// ── amplify-outputs.ts ───────────────────────────────────────────────────────
describe('amplify-outputs.ts (generated)', () => {
  it('contains the Cognito user_pool_id', () => {
    expect(outputsSrc).toContain('user_pool_id');
  });

  it('contains the AppSync graphql URL', () => {
    expect(outputsSrc).toContain('appsync-api');
  });

  it('exports a default object', () => {
    expect(outputsSrc).toContain('export default amplifyOutputs');
  });
});

// ── main.tsx import order ────────────────────────────────────────────────────
describe('main.tsx import order', () => {
  it('imports amplify-config as the very first import (before react)', () => {
    const lines = mainSrc
      .split('\n')
      .filter(l => l.trim() !== '' && !l.trim().startsWith('//'));
    const firstImport = lines.find(l => l.trim().startsWith('import'));
    expect(firstImport).toContain('amplify-config');
  });

  it('amplify-config import is before react import', () => {
    const cfgIdx   = mainSrc.indexOf("'./lib/amplify-config'");
    const reactIdx = mainSrc.indexOf("from 'react'");
    expect(cfgIdx).toBeGreaterThan(-1);
    if (reactIdx !== -1) expect(cfgIdx).toBeLessThan(reactIdx);
  });

  it('amplify-config import is before react-dom/client import', () => {
    const cfgIdx = mainSrc.indexOf("'./lib/amplify-config'");
    const rdcIdx = mainSrc.indexOf("from 'react-dom/client'");
    expect(cfgIdx).toBeGreaterThan(-1);
    if (rdcIdx !== -1) expect(cfgIdx).toBeLessThan(rdcIdx);
  });

  it('amplify-config import is before App import', () => {
    const cfgIdx = mainSrc.indexOf("'./lib/amplify-config'");
    const appIdx = mainSrc.indexOf("from './App");
    expect(cfgIdx).toBeGreaterThan(-1);
    if (appIdx !== -1) expect(cfgIdx).toBeLessThan(appIdx);
  });

  it('does not call Amplify.configure() directly in main.tsx', () => {
    // configure must live in amplify-config.ts, not inlined here
    expect(mainSrc).not.toContain('Amplify.configure(');
  });
});
