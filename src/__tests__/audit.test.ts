// Feature: core-architecture-database
// Unit tests for the dependency audit script (scripts/audit-deps.ts)
// Validates Requirement 1.5: disallowed UI library detection

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { auditDependencies } from '../../scripts/audit-deps'

// ─── Test 1: antd in dependencies → violation ────────────────────────────────

describe('auditDependencies — forbidden packages', () => {
  it('returns pass:false with violation "antd" when antd is in dependencies', () => {
    const mockPackageJson = JSON.stringify({
      name: 'test-project',
      dependencies: {
        antd: '5.0.0',
        react: '18.3.1',
      },
      devDependencies: {},
    })

    const result = auditDependencies(mockPackageJson)

    expect(result.pass).toBe(false)
    expect(result.violations).toContain('antd')
  })

  // ─── Test 2: @mui/material in devDependencies → violation ──────────────────

  it('returns pass:false with violation "@mui/material" when it is in devDependencies', () => {
    const mockPackageJson = JSON.stringify({
      name: 'test-project',
      dependencies: {},
      devDependencies: {
        '@mui/material': '5.15.0',
      },
    })

    const result = auditDependencies(mockPackageJson)

    expect(result.pass).toBe(false)
    expect(result.violations).toContain('@mui/material')
  })

  // ─── Test 3: clean package.json with only @aws-amplify/ui-react → pass ──────

  it('returns pass:true with empty violations for a clean package.json', () => {
    const mockPackageJson = JSON.stringify({
      name: 'vidabaile',
      dependencies: {
        '@aws-amplify/ui-react': '6.11.2',
        'aws-amplify': '6.15.0',
        react: '18.3.1',
        'react-dom': '18.3.1',
      },
      devDependencies: {
        vitest: '3.2.3',
        typescript: '5.8.3',
      },
    })

    const result = auditDependencies(mockPackageJson)

    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // ─── Test 4: multiple forbidden packages → all reported ────────────────────

  it('returns all violating package names when multiple forbidden packages are present', () => {
    const mockPackageJson = JSON.stringify({
      name: 'bad-project',
      dependencies: {
        antd: '5.0.0',
        tailwindcss: '3.4.0',
        '@chakra-ui/react': '2.0.0',
      },
      devDependencies: {
        '@mui/material': '5.15.0',
        bootstrap: '5.3.0',
      },
    })

    const result = auditDependencies(mockPackageJson)

    expect(result.pass).toBe(false)
    expect(result.violations).toContain('antd')
    expect(result.violations).toContain('tailwindcss')
    expect(result.violations).toContain('@chakra-ui/react')
    expect(result.violations).toContain('@mui/material')
    expect(result.violations).toContain('bootstrap')
    expect(result.violations).toHaveLength(5)
  })

  // ─── Test 5: real project package.json → must pass ─────────────────────────

  it('passes for the actual project package.json (no forbidden UI libraries installed)', () => {
    const realPackageJsonPath = resolve(__dirname, '../../package.json')
    const content = readFileSync(realPackageJsonPath, 'utf-8')

    const result = auditDependencies(content)

    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})
