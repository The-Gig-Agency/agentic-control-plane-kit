# Setting Up acedge123 Account Access

## Issue
The `acedge123` account is an admin but can't access the repo via CLI.

## Step 1: Verify Account Access

1. Go to: https://github.com/The-Gig-Agency/agentic-control-plane-kit/settings/access
2. Confirm `acedge123` is listed as an admin
3. If not, add them:
   - Settings → Collaborators → Add people
   - Search for `acedge123`
   - Set role to **Admin**

## Step 2: Create Personal Access Token (PAT)

For the `acedge123` account:

1. Go to: https://github.com/settings/tokens (while logged in as `acedge123`)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name: `agentic-control-plane-kit-access`
4. Expiration: Choose appropriate (90 days, 1 year, or no expiration)
5. **Scopes** (check these):
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (if accessing org repos)
6. Click **"Generate token"**
7. **Copy the token immediately** (you won't see it again!)

## Step 3: Configure Git on the Agent Machine

On the machine where your agent lives:

### Option A: Use Token in Remote URL (Easiest)

```bash
# Clone using token
git clone https://acedge123:YOUR_TOKEN@github.com/The-Gig-Agency/agentic-control-plane-kit.git

# Or update existing remote
cd agentic-control-plane-kit
git remote set-url origin https://acedge123:YOUR_TOKEN@github.com/The-Gig-Agency/agentic-control-plane-kit.git
```

### Option B: Use Git Credential Helper (Recommended)

```bash
# Store credentials
git config --global credential.helper store

# When you clone/pull, it will prompt for username/password
# Username: acedge123
# Password: YOUR_TOKEN (not your GitHub password!)
```

### Option C: Use GitHub CLI (Best for Agents)

```bash
# Install gh CLI if not installed
# macOS: brew install gh
# Linux: see https://cli.github.com/

# Authenticate
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Login with a web browser (or paste token)
# Follow prompts

# Verify access
gh repo view The-Gig-Agency/agentic-control-plane-kit

# Clone
gh repo clone The-Gig-Agency/agentic-control-plane-kit
```

### Option D: Use SSH (Most Secure)

1. **Generate SSH key on agent machine:**
```bash
ssh-keygen -t ed25519 -C "acedge123@agent-machine"
# Save to: ~/.ssh/id_ed25519_acedge123
```

2. **Add SSH key to GitHub:**
```bash
# Copy public key
cat ~/.ssh/id_ed25519_acedge123.pub
# Copy the output
```

3. **Add to GitHub:**
   - Go to: https://github.com/settings/keys (as acedge123)
   - Click "New SSH key"
   - Paste the public key
   - Title: "Agent Machine"
   - Click "Add SSH key"

4. **Configure git to use SSH:**
```bash
# Update remote URL
git remote set-url origin git@github.com:The-Gig-Agency/agentic-control-plane-kit.git

# Test connection
ssh -T git@github.com
# Should see: "Hi acedge123! You've successfully authenticated..."
```

## Step 4: Test Access

```bash
# Test clone
git clone https://github.com/The-Gig-Agency/agentic-control-plane-kit.git
# Or with SSH:
git clone git@github.com:The-Gig-Agency/agentic-control-plane-kit.git

# Test pull
cd agentic-control-plane-kit
git pull origin main

# Test push (if you have write access)
echo "# Test" >> README.md
git add README.md
git commit -m "Test commit"
git push origin main
```

## Troubleshooting

### "Repository not found" Error

**Possible causes:**
1. Token doesn't have `repo` scope
2. Account doesn't have access to the org
3. Using wrong account credentials

**Fix:**
- Verify token has `repo` scope
- Check org membership: https://github.com/orgs/The-Gig-Agency/people
- Ensure `acedge123` is in the org or has explicit repo access

### "Permission denied" Error

**Possible causes:**
1. Token expired
2. Token doesn't have correct scopes
3. SSH key not added to GitHub

**Fix:**
- Generate new token with `repo` scope
- Verify SSH key is added to acedge123 account
- Check token expiration date

### "Authentication failed" with Token

**Common mistake:** Using GitHub password instead of token

**Fix:** Always use the Personal Access Token as the password, not your GitHub account password.

## For Agent/Automation Use

If this is for an automated agent, use:

### Environment Variable Approach

```bash
# Set token as environment variable
export GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE

# Use in git operations
git clone https://acedge123:${GITHUB_TOKEN}@github.com/The-Gig-Agency/agentic-control-plane-kit.git
```

### Git Credential Store

```bash
# Store token in credential store
echo "https://acedge123:YOUR_TOKEN@github.com" > ~/.git-credentials
git config --global credential.helper store
```

### GitHub CLI (Recommended for Agents)

```bash
# Authenticate once
gh auth login --with-token < YOUR_TOKEN_FILE

# Then use gh commands
gh repo clone The-Gig-Agency/agentic-control-plane-kit
```

## Quick Checklist

- [ ] `acedge123` is admin of the repo
- [ ] Personal Access Token created with `repo` scope
- [ ] Token copied and saved securely
- [ ] Git configured on agent machine (credential helper or SSH)
- [ ] Test clone works
- [ ] Test pull works
- [ ] Test push works (if needed)

## Security Notes

- **Never commit tokens to git**
- Use environment variables or secure credential storage
- Rotate tokens periodically
- Use fine-grained tokens if available (GitHub's newer token system)
- Consider using SSH keys for better security
