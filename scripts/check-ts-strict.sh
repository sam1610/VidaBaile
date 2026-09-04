#!/bin/bash

# TypeScript Strict Mode Checker
# Validates that both frontend and backend TypeScript configurations compile without errors
# Requirements: 1.3, 3.1
# Exit codes: 0 = all checks pass, 1 = compilation errors

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

COMPILATION_FAILED=0

echo "🔍 Checking TypeScript strict mode compilation..."
echo ""

# Check frontend TypeScript (tsconfig.json)
echo -e "${BLUE}📦 Checking frontend TypeScript (tsconfig.json)...${NC}"
if tsc --noEmit --project "$PROJECT_ROOT/tsconfig.json" 2>&1; then
  echo -e "${GREEN}✅ Frontend TypeScript compiled successfully${NC}"
else
  echo -e "${RED}❌ Frontend TypeScript compilation failed${NC}"
  COMPILATION_FAILED=1
fi

echo ""

# Check backend TypeScript (amplify/tsconfig.json)
echo -e "${BLUE}📦 Checking backend TypeScript (amplify/tsconfig.json)...${NC}"
if tsc --noEmit --project "$PROJECT_ROOT/amplify/tsconfig.json" 2>&1; then
  echo -e "${GREEN}✅ Backend TypeScript compiled successfully${NC}"
else
  echo -e "${RED}❌ Backend TypeScript compilation failed${NC}"
  COMPILATION_FAILED=1
fi

echo ""

if [ $COMPILATION_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All TypeScript compilations passed in strict mode.${NC}"
  exit 0
else
  echo -e "${RED}❌ TypeScript strict mode check failed.${NC}"
  echo "   Please fix all TypeScript errors before committing."
  echo "   Run: npm run build"
  exit 1
fi
