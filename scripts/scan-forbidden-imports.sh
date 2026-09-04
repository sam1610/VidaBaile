#!/bin/bash

# Forbidden Imports Scanning Script
# Scans for third-party automation platform URLs and imports
# Requirements: 13.1, 13.3
# Exit codes: 0 = clean, 1 = forbidden imports found

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Forbidden patterns to scan for
FORBIDDEN_PATTERNS=(
  'zapier\.com'
  'make\.com'
  'hooks\.zapier'
  'n8n\.io'
  'pipedream\.com'
)

VIOLATIONS_FOUND=0

echo "🔍 Scanning for forbidden third-party automation imports in amplify/ and src/..."
echo ""

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  echo "Checking for: $pattern"
  
  if grep -rn "$pattern" "$PROJECT_ROOT/amplify" "$PROJECT_ROOT/src" 2>/dev/null || false; then
    echo -e "${RED}❌ Found forbidden import: $pattern${NC}"
    echo "   File(s) and line(s):"
    grep -rn "$pattern" "$PROJECT_ROOT/amplify" "$PROJECT_ROOT/src" 2>/dev/null | sed 's/^/     /' || true
    VIOLATIONS_FOUND=1
  else
    echo -e "${GREEN}✓${NC} $pattern not found"
  fi
done

echo ""

if [ $VIOLATIONS_FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ No forbidden imports found. Scan clean.${NC}"
  exit 0
else
  echo -e "${RED}❌ Forbidden imports scan failed. Please remove all third-party automation platform references.${NC}"
  echo "   Allowed integration methods:"
  echo "   - Native AWS services only (API Gateway, Lambda, EventBridge, etc.)"
  echo "   - No Zapier, Make, n8n, Pipedream, or similar platforms"
  exit 1
fi
