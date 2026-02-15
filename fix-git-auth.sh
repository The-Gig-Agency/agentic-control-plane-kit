#!/bin/bash
# Fix git authentication for acedge123 repo
# Run this from the api-docs-template repo

set -e

echo "🔐 Fixing git authentication for acedge123/api-docs-template"

# Check current remote
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
echo "Current remote: $CURRENT_REMOTE"

# Option 1: Use GitHub CLI (recommended)
if command -v gh &> /dev/null; then
    echo ""
    echo "✅ GitHub CLI found. Authenticating..."
    gh auth login
    echo ""
    echo "✅ Authentication complete. Try: git push"
    exit 0
fi

# Option 2: Update remote with token
echo ""
echo "⚠️  GitHub CLI not found. Using token method..."
echo ""
read -p "Enter your acedge123 GitHub token (ghp_...): " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ No token provided"
    exit 1
fi

# Update remote
git remote set-url origin "https://acedge123:${TOKEN}@github.com/acedge123/api-docs-template.git"

echo ""
echo "✅ Remote updated. Try: git push"
