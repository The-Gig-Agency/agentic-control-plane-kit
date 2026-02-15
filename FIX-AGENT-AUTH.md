# Fixing Agent Machine Authentication

## You Already Have Access ✅

- ✅ `acedge123` is **Owner** of `The-Gig-Agency` org
- ✅ `acedge123` has **Admin** on `agentic-control-plane-kit` repo

The problem is **authentication on the agent machine**, not permissions.

## Common Issues & Fixes

### Issue 1: Token Doesn't Have `repo` Scope

**Check your token:**
1. Go to: https://github.com/settings/tokens (as `acedge123`)
2. Find your token
3. Verify it has **`repo`** scope checked

**Fix:** Create a new token with `repo` scope:
```bash
# Create new token at: https://github.com/settings/tokens
# Name: agent-machine-access
# Scopes: ✅ repo (Full control of private repositories)
# Copy the token (starts with ghp_)
```

### Issue 2: Using Password Instead of Token

**Mistake:** Entering your GitHub password when git prompts

**Fix:** Always use the Personal Access Token as the password:
```bash
# When git prompts:
Username: acedge123
Password: ghp_YOUR_TOKEN_HERE  # NOT your GitHub password!
```

### Issue 3: Wrong Git Remote URL

**Check current remote:**
```bash
cd agentic-control-plane-kit
git remote -v
```

**If it shows wrong URL, fix it:**
```bash
# Option A: HTTPS (with token)
git remote set-url origin https://acedge123:YOUR_TOKEN@github.com/The-Gig-Agency/agentic-control-plane-kit.git

# Option B: HTTPS (normal, will prompt for credentials)
git remote set-url origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git

# Option C: SSH (if you have SSH key set up)
git remote set-url origin git@github.com:The-Gig-Agency/agentic-control-plane-kit.git
```

### Issue 4: Cached Wrong Credentials

**Clear cached credentials:**
```bash
# Clear git credential cache
git config --global --unset credential.helper
git credential-cache exit  # if using cache
git credential-store erase  # if using store

# Or manually edit:
# macOS: ~/.git-credentials
# Linux: ~/.git-credentials
# Remove any old/incorrect entries
```

### Issue 5: Environment Variable Not Set

**If using environment variable:**
```bash
# Set token
export GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE

# Verify it's set
echo $GITHUB_TOKEN

# Use in git operations
git clone https://acedge123:${GITHUB_TOKEN}@github.com/The-Gig-Agency/agentic-control-plane-kit.git
```

## Step-by-Step Fix

### On Your Agent Machine:

**1. Create/Verify Token:**
```bash
# Go to: https://github.com/settings/tokens
# Create token with 'repo' scope
# Copy token (ghp_...)
```

**2. Test with GitHub CLI (Easiest):**
```bash
# Install if needed: brew install gh (macOS) or see https://cli.github.com/

# Authenticate
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Paste an authentication token
# Paste your token

# Test access
gh repo view The-Gig-Agency/agentic-control-plane-kit

# Clone
gh repo clone The-Gig-Agency/agentic-control-plane-kit
```

**3. Or Test with Git Directly:**
```bash
# Clear any cached credentials first
git config --global --unset credential.helper

# Try cloning (will prompt for credentials)
git clone https://github.com/The-Gig-Agency/agentic-control-plane-kit.git
# Username: acedge123
# Password: YOUR_TOKEN (not your GitHub password!)

# If that works, configure credential helper
git config --global credential.helper store
# Next time it will remember
```

**4. Or Use Token in URL (One-time):**
```bash
git clone https://acedge123:YOUR_TOKEN@github.com/The-Gig-Agency/agentic-control-plane-kit.git
```

## Quick Diagnostic

Run these on your agent machine to see what's wrong:

```bash
# Check git config
git config --global --list | grep -i credential
git config --global --list | grep -i user

# Check remote URL
cd agentic-control-plane-kit 2>/dev/null || echo "Repo not cloned yet"
git remote -v 2>/dev/null || echo "Not a git repo"

# Test GitHub CLI
gh auth status 2>/dev/null || echo "GitHub CLI not installed/configured"

# Test token (replace YOUR_TOKEN)
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/repos/The-Gig-Agency/agentic-control-plane-kit
# Should return repo info, not 404/401
```

## Recommended Solution: GitHub CLI

Since you're already an owner, the easiest path is:

```bash
# On agent machine
gh auth login
# Follow prompts, paste your token

# Then everything just works:
gh repo clone The-Gig-Agency/agentic-control-plane-kit
cd agentic-control-plane-kit
git pull
git push
```

No credential confusion, no token management in URLs, just works.

## What Error Are You Seeing?

Share the exact error message and I can give you a targeted fix:
- "Repository not found" → Token scope issue
- "Authentication failed" → Wrong credentials
- "Permission denied" → Token expired or wrong account
- Something else? → Share the full error
