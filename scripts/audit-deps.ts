import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditResult {
  pass: boolean
  violations: string[]
}

// ─── Forbidden packages (Requirement 1.5) ────────────────────────────────────

export const FORBIDDEN_PACKAGES: readonly string[] = [
  'antd',
  '@mui/material',
  '@mui/core',
  'chakra-ui',
  '@chakra-ui/react',
  'tailwindcss',
  '@headlessui/react',
  'shadcn-ui',
  'bootstrap',
  'semantic-ui-react',
]

// ─── Core audit function (importable) ────────────────────────────────────────

/**
 * Parses a package.json string and checks both `dependencies` and
 * `devDependencies` for forbidden UI library packages.
 *
 * @param packageJsonContent - Raw JSON string of package.json
 * @returns AuditResult with pass flag and list of violating package names
 */
export function auditDependencies(packageJsonContent: string): AuditResult {
  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(packageJsonContent) as Record<string, unknown>
  } catch {
    return {
      pass: false,
      violations: ['[parse-error] Invalid JSON in package.json'],
    }
  }

  const deps = Object.keys(
    (parsed.dependencies as Record<string, string> | undefined) ?? {}
  )
  const devDeps = Object.keys(
    (parsed.devDependencies as Record<string, string> | undefined) ?? {}
  )

  const allPackages = new Set([...deps, ...devDeps])

  const violations = FORBIDDEN_PACKAGES.filter((pkg) => allPackages.has(pkg))

  return {
    pass: violations.length === 0,
    violations,
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

function isRunDirectly(): boolean {
  // Works for both CJS and ESM execution contexts
  try {
    const scriptPath = fileURLToPath(import.meta.url)
    return process.argv[1] === scriptPath
  } catch {
    // Fallback: check argv[1] string
    return (
      process.argv[1]?.endsWith('audit-deps.ts') === true ||
      process.argv[1]?.endsWith('audit-deps.js') === true
    )
  }
}

if (isRunDirectly()) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  const packageJsonPath = resolve(__dirname, '../package.json')
  let content: string

  try {
    content = readFileSync(packageJsonPath, 'utf-8')
  } catch {
    console.error(`❌ Could not read package.json at: ${packageJsonPath}`)
    process.exit(1)
  }

  const result = auditDependencies(content)

  if (result.pass) {
    console.log('✅ No forbidden UI libraries found.')
    process.exit(0)
  } else {
    console.error('❌ Forbidden UI libraries detected in package.json:')
    for (const pkg of result.violations) {
      console.error(`  - ${pkg}`)
    }
    process.exit(1)
  }
}
