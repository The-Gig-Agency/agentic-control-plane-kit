#!/bin/bash
# Quick setup script for acedge123 account access
# Run this on the agent machine

set -e

echo "🔐 Setting up acedge123 GitHub access for agentic-control-plane-kit"
echo ""

# Check if gh CLI is installed
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI (gh) is installed"
    echo ""
    echo "Option 1: Use GitHub CLI (Recommended)"
    echo "  Run: gh auth login"
    echo "  Select: GitHub.com → HTTPS → Login with a web browser"
    echo "  Or use token: gh auth login --with-token < token.txt"
    echo ""
else
    echo "⚠️  GitHub CLI not found. Install with:"
    echo "  macOS: brew install gh"
    echo "  Linux: See https://cli.github.com/"
    echo ""
fi

echo "Option 2: Use Personal Access Token"
echo "  1. Create token at: https://github.com/settings/tokens"
echo "  2. Scopes needed: repo, read:org"
echo "  3. Clone with:"
echo "     git clone https://acedge123:YOUR_TOKEN@github.com/The-Gig-Agency/agentic-control-plane-kit.git"
echo ""

echo "Option 3: Use SSH"
echo "  1. Generate key: ssh-keygen -t ed25519 -C 'acedge123@agent'"
echo "  2. Add to GitHub: https://github.com/settings/keys"
echo "  3. Clone with:"
echo "     git clone git@github.com:The-Gig-Agency/agentic-control-plane-kit.git"
echo ""

echo "📋 Verification Steps:"
echo "  1. Verify acedge123 is admin: https://github.com/The-Gig-Agency/agentic-control-plane-kit/settings/access"
echo "  2. Test access: git clone https://github.com/The-Gig-Agency/agentic-control-plane-kit.git"
echo "  3. If using token, ensure it has 'repo' scope"
echo ""

echo "🔍 Current git config:"
git config --global --get user.name 2>/dev/null || echo "  No user.name set"
git config --global --get user.email 2>/dev/null || echo "  No user.email set"
echo ""

echo "💡 Tip: For agents, use GitHub CLI or store token in environment variable:"
echo "   export GITHUB_TOKEN=ghp_YOUR_TOKEN"
echo ""
