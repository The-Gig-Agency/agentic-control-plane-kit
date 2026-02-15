# Fix Git Auth for acedge123 Repo

## The Problem
Git is trying to use `thegig-agency` credentials to push to `acedge123/api-docs-template`, which fails with 403.

## Quick Fixes

### Option 1: Update Remote URL with Token (Fastest)

```bash
# Get your acedge123 token from: https://github.com/settings/tokens
# Then update remote:
git remote set-url origin https://acedge123:YOUR_TOKEN@github.com/acedge123/api-docs-template.git

# Push
git push
```

### Option 2: Use SSH (Recommended)

```bash
# Check if you have SSH key set up for acedge123
ssh -T git@github.com
# Should say: "Hi acedge123! You've successfully authenticated..."

# If not, add SSH key to acedge123 account:
# 1. Generate key: ssh-keygen -t ed25519 -C "acedge123@your-machine"
# 2. Add to GitHub: https://github.com/settings/keys
# 3. Update remote:
git remote set-url origin git@github.com:acedge123/api-docs-template.git

# Push
git push
```

### Option 3: Use GitHub CLI (Easiest)

```bash
# Authenticate with acedge123
gh auth login
# Select: GitHub.com → HTTPS → Login with a web browser
# Or paste token

# Verify you're logged in as acedge123
gh auth status

# Push using gh
gh repo sync
# Or
git push
```

### Option 4: Update Git Credential Helper

```bash
# Clear cached credentials
git credential-cache exit
# Or
git config --global --unset credential.helper

# Update remote to HTTPS
git remote set-url origin https://github.com/acedge123/api-docs-template.git

# When you push, it will prompt:
# Username: acedge123
# Password: YOUR_TOKEN (not your GitHub password!)

# Store credentials
git config --global credential.helper store
# Enter acedge123 / YOUR_TOKEN when prompted
```

## Recommended: Use GitHub CLI

This is the cleanest solution:

```bash
# 1. Authenticate
gh auth login
# Follow prompts, use acedge123 account

# 2. Verify
gh auth status
# Should show: acedge123 logged in

# 3. Push
git push
```

## If You Don't Have GitHub CLI

Install it:
```bash
# macOS
brew install gh

# Then authenticate
gh auth login
```

## Quick Command Sequence

```bash
# In api-docs-template directory
cd /path/to/api-docs-template

# Option A: Use token in URL (one-time)
git remote set-url origin https://acedge123:YOUR_TOKEN@github.com/acedge123/api-docs-template.git
git push

# Option B: Use SSH (if you have SSH key)
git remote set-url origin git@github.com:acedge123/api-docs-template.git
git push

# Option C: Use GitHub CLI
gh auth login  # Authenticate as acedge123
git push
```

## Verify Remote

```bash
# Check current remote
git remote -v

# Should show:
# origin  https://github.com/acedge123/api-docs-template.git (fetch)
# origin  https://github.com/acedge123/api-docs-template.git (push)
```

## After Fixing Auth

Once auth is fixed, you can push:

```bash
git push
# Should work now!
```
