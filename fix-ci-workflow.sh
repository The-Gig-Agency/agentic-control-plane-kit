#!/bin/bash
# Quick fix script for CI workflow
# Run this from the api-docs-template repo root

set -e

WORKFLOW_FILE=".github/workflows/ci.yml"

if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ Error: $WORKFLOW_FILE not found"
    echo "   Make sure you're in the api-docs-template repo root"
    exit 1
fi

echo "🔧 Fixing CI workflow: docker-compose → docker compose"

# Backup original
cp "$WORKFLOW_FILE" "${WORKFLOW_FILE}.bak"

# Replace all instances (macOS compatible)
sed -i '' 's/docker-compose/docker compose/g' "$WORKFLOW_FILE"

# Verify changes
if grep -q "docker-compose" "$WORKFLOW_FILE"; then
    echo "❌ Error: Some instances of docker-compose still remain"
    exit 1
fi

COUNT=$(grep -c "docker compose" "$WORKFLOW_FILE" || echo "0")
echo "✅ Fixed! Found $COUNT instances of 'docker compose'"

echo ""
echo "📋 Next steps:"
echo "   git add $WORKFLOW_FILE"
echo "   git commit -m 'fix: use docker compose plugin instead of docker-compose'"
echo "   git push"
