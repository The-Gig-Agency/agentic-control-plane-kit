# Git Pull Then Push Commands

## Repo B (governance-hub)

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

# Pull latest changes
git pull origin main

# If there are conflicts, resolve them, then:
git add .
git commit -m "Merge remote changes"

# Add new files
git add supabase/migrations/20260225000000_add_email_verification.sql
git add supabase/functions/verify-email/
git add supabase/functions/api-keys-create/index.ts
git add supabase/functions/tenants-create/SECURITY-UPDATES.md

# Commit
git commit -m "Add email verification support (Option B)

- Migration: Add email_verified, verification_tokens, signup_idempotency, signup_rate_limits
- Verify-email endpoint: Validates token, upgrades scopes, creates Stripe customer
- API key creation: Defaults to read-only scopes if email not verified
- Implements Option B: Immediate key with read-only until verified"

# Push
git push origin main
```

## Repo A (agentic-control-plane-kit)

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Pull latest changes
git pull origin main

# If there are conflicts, resolve them, then:
git add .
git commit -m "Merge remote changes"

# Add new files
git add SIGNUP-SECURITY-IMPLEMENTATION.md SECURITY-IMPLEMENTATION-STATUS.md

# Commit
git commit -m "Add security implementation documentation

- Document Option B implementation (immediate key, read-only until verified)
- Status tracking for Repo B and main website updates
- Testing checklist and deployment steps"

# Push
git push origin main
```

## If Merge Conflicts Occur

If `git pull` shows conflicts:

1. **Check status:**
   ```bash
   git status
   ```

2. **Resolve conflicts** in the files listed

3. **After resolving:**
   ```bash
   git add .
   git commit -m "Resolve merge conflicts"
   git push origin main
   ```

## Alternative: Rebase Instead of Merge

If you prefer rebase:

```bash
git pull --rebase origin main
# Resolve conflicts if any
git add .
git rebase --continue
git push origin main
```
