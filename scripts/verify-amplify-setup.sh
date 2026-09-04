#!/bin/bash

# Verification script for Amplify configuration setup

echo "🔍 Verifying Amplify configuration..."
echo ""

# Check 1: amplify_outputs.json exists
if [ -f "amplify_outputs.json" ]; then
    echo "✅ amplify_outputs.json exists in project root"
else
    echo "❌ amplify_outputs.json NOT found. Run 'npm run sandbox' to deploy backend."
    exit 1
fi

# Check 2: main.tsx has Amplify.configure call
if grep -q "Amplify.configure(outputs" src/main.tsx; then
    echo "✅ src/main.tsx calls Amplify.configure()"
else
    echo "❌ src/main.tsx does not call Amplify.configure()"
    exit 1
fi

# Check 3: main.tsx imports outputs before React
outputs_line=$(grep -n "import outputs from" src/main.tsx | head -1 | cut -d: -f1)
react_line=$(grep -n "import { StrictMode }" src/main.tsx | head -1 | cut -d: -f1)

if [ ! -z "$outputs_line" ] && [ ! -z "$react_line" ] && [ "$outputs_line" -lt "$react_line" ]; then
    echo "✅ amplify_outputs.json imported before React imports"
else
    echo "❌ amplify_outputs.json not imported before React"
    exit 1
fi

# Check 4: tsconfig.app.json has resolveJsonModule
if grep -q '"resolveJsonModule"' tsconfig.app.json; then
    echo "✅ tsconfig.app.json has resolveJsonModule enabled"
else
    echo "❌ tsconfig.app.json missing resolveJsonModule"
    exit 1
fi

# Check 5: Verify Amplify config has auth section
if jq -e '.auth.user_pool_id' amplify_outputs.json > /dev/null 2>&1; then
    user_pool_id=$(jq -r '.auth.user_pool_id' amplify_outputs.json)
    echo "✅ Cognito User Pool configured: $user_pool_id"
else
    echo "❌ Cognito User Pool not found in amplify_outputs.json"
    exit 1
fi

# Check 6: Verify AppSync endpoint exists
if jq -e '.data.url' amplify_outputs.json > /dev/null 2>&1; then
    graphql_url=$(jq -r '.data.url' amplify_outputs.json)
    echo "✅ AppSync GraphQL endpoint configured: $graphql_url"
else
    echo "❌ AppSync endpoint not found in amplify_outputs.json"
    exit 1
fi

echo ""
echo "✅ All checks passed! Amplify is properly configured."
echo ""
echo "Next steps:"
echo "1. Start backend: npm run sandbox"
echo "2. Start frontend: npm run dev"
echo "3. Open http://localhost:5173 in browser"
