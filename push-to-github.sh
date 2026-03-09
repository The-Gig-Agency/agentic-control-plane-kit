#!/bin/bash
# Script to initialize git and prepare for GitHub push

set -e

# Resolve repository root from this script location
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "🚀 Setting up agentic-control-plane-kit repository..."

# Initialize git if not already
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
fi

# Check if remote already exists
if git remote get-url origin >/dev/null 2>&1; then
    echo "✅ Remote 'origin' already configured:"
    git remote get-url origin
else
    echo "⚠️  No remote configured. You'll need to add one:"
    echo "   git remote add origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git"
fi

# Stage all files
echo "📝 Staging files..."
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "✅ No changes to commit (everything already committed)"
else
    echo "💾 Committing changes..."
    git commit -m "Initial commit: Agentic Control Plane Kit

- Kernel: Core router, auth, audit, idempotency, rate limiting, ceilings
- Packs: IAM, Webhooks, Settings (universal packs)
- Domain template: Starter template for repo-specific actions
- OpenAPI generator: Auto-generate OpenAPI 3.0 spec
- Invariant tests: Cross-repo compatibility tests
- Integration guide: Step-by-step Django/Express/Supabase examples"
fi

# Show status
echo ""
echo "📊 Repository status:"
git status

echo ""
echo "✅ Ready to push!"
echo ""
echo "Next steps:"
echo "1. Create the repo on GitHub: https://github.com/new"
echo "   Name: agentic-control-plane-kit"
echo "   Visibility: Private (recommended)"
echo ""
echo "2. Add remote (if not already added):"
echo "   git remote add origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git"
echo ""
echo "3. Push to GitHub:"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
