#!/bin/bash

# Credential Scanning Script
# Scans for AWS access key IDs and secret access key patterns
# Requirements: 12.2, 12.7
# Exit codes: 0 = clean, 1 = credentials found

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Patterns to scan for
# AWS Access Key ID pattern: AKIA followed by 16 alphanumeric characters
AWS_ACCESS_KEY_PATTERN='AKIA[A-Z0-9]\{16\}'

# AWS Secret Access Key patterns (common variations)
AWS_SECRET_PATTERNS=(
  'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+]\{40\}'
  'aws_secret_access_key[[:space:]]*:[[:space:]]*[A-Za-z0-9/+]\{40\}'
  'secretAccessKey[[:space:]]*=[[:space:]]*[A-Za-z0-9/+]\{40\}'
  'SecretAccessKey[[:space:]]*:[[:space:]]*[A-Za-z0-9/+]\{40\}'
)

VIOLATIONS_FOUND=0

echo "🔍 Scanning for credentials in amplify/ and src/ directories..."
echo ""

# Scan for AWS Access Key IDs
echo "Checking for AWS Access Key IDs (AKIA*)..."
if grep -rn "$AWS_ACCESS_KEY_PATTERN" "$PROJECT_ROOT/amplify" "$PROJECT_ROOT/src" 2>/dev/null || false; then
  echo -e "${RED}❌ AWS Access Key ID found!${NC}"
  VIOLATIONS_FOUND=1
fi

# Scan for AWS Secret Access Key patterns
for pattern in "${AWS_SECRET_PATTERNS[@]}"; do
  if grep -rn "$pattern" "$PROJECT_ROOT/amplify" "$PROJECT_ROOT/src" 2>/dev/null || false; then
    echo -e "${RED}❌ AWS Secret Access Key pattern found!${NC}"
    VIOLATIONS_FOUND=1
  fi
done

# Also scan for common secret patterns
echo "Checking for hardcoded secrets patterns..."
if grep -rn 'AKIA' "$PROJECT_ROOT/amplify" "$PROJECT_ROOT/src" 2>/dev/null || false; then
  : # Already caught above
fi

echo ""

if [ $VIOLATIONS_FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ No credentials found in code. Scan clean.${NC}"
  exit 0
else
  echo -e "${RED}❌ Credentials scan failed. Please remove any exposed credentials before committing.${NC}"
  exit 1
fi
