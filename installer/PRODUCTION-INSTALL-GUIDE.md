# Production Install Guide

## Safe Install Contract

This guide ensures a safe, bulletproof installation of the Agentic Control Plane (ACP) in production environments.

---

## Pre-Install Checklist

### 1. Route Collision Check

**Default endpoint**: `/api/manage`

**Before installing**, verify this route doesn't exist:

```bash
# Check your codebase
grep -r "api/manage" your-codebase/
grep -r "path.*manage" your-urls-file.py
```

**If collision found**: Use `--base-path` to namespace ACP:

```bash
npx echelon install --base-path /api/acp
# Installs to /api/acp/manage instead
```

### 2. Migration Review

**ACP only creates new tables** - never modifies existing ones.

**Tables created**:
- `api_keys` (if not exists)
- `audit_logs` (if not exists)
- `user_tenant_mapping` (if not exists)
- Indexes on new tables only

**No ALTER/DROP statements** - safe to run on production.

### 3. Backup Recommendation

**Before installing**:
- Backup your database
- Commit current code state
- Create a rollback branch

---

## Installation Options

### Option A: Staged Deployment (Recommended for Production)

**Step 1: Pre-flight check**
```bash
npx echelon install --env production --dry-run
# Shows what would be generated (no changes)
```

**Step 2: Generate migrations only**
```bash
npx echelon install --env production --migrations-only
# Creates migration files, no code changes
```

**Step 3: Review and run migrations**
```bash
# Review generated migrations
cat backend/your_app/migrations/XXXX_add_control_plane_tables.py

# Run migrations
python manage.py migrate
```

**Step 4: Install code (migrations already run)**
```bash
npx echelon install --env production --no-migrations
# Installs code, skips migration generation
```

**Step 5: Configure environment**
```bash
# Set in your deployment platform (Railway, Heroku, etc.)
ACP_ENABLED=false  # Start disabled
ACP_BASE_URL=https://your-governance-hub.supabase.co
ACP_KERNEL_KEY=acp_kernel_xxxxx
ACP_TENANT_ID=your-tenant-uuid
```

**Step 6: Enable ACP**
```bash
# After migrations are confirmed and code is deployed
ACP_ENABLED=true
# Restart application
```

### Option B: Single-Step Install (Development/Staging)

```bash
npx echelon install --env staging
# Generates everything, you run migrations manually
```

---

## Post-Install Safety

### Feature Flag

**ACP is disabled by default** after installation.

**Enable when ready**:
```bash
export ACP_ENABLED=true
# Or set in your deployment platform
```

**If disabled**, `/api/manage` returns:
```json
{
  "ok": false,
  "error": "ACP is disabled. Set ACP_ENABLED=true to enable.",
  "code": "FEATURE_DISABLED"
}
```

### Graceful Degradation

**If Governance Hub (Repo B) is unreachable**:

**Default behavior** (fail-open):
- Read actions: Allowed (local-only mode)
- Write actions: Allowed (local-only mode)
- Logs warning, continues operation

**Strict mode** (fail-closed):
```bash
ACP_FAIL_MODE=closed
# Denies all actions if Repo B unreachable
```

**Recommended** (read-open, write-closed):
```bash
ACP_FAIL_MODE=read-open
# Allows reads, requires Repo B for writes
```

### Lazy Initialization

**All environment variables are read inside the handler** - not at module import.

**This means**:
- ✅ Application starts even if env vars missing
- ✅ No startup crashes from missing configuration
- ✅ First request initializes ACP (lazy load)

---

## Deploy Order

### Preferred Order (Safest)

1. **Run migrations** → Creates tables
2. **Deploy code** → ACP code goes live (but disabled)
3. **Set env vars** → Configure Repo B connection
4. **Enable feature flag** → `ACP_ENABLED=true`
5. **Restart app** → ACP becomes active

### Alternative Order (If migrations must run after deploy)

1. **Deploy code** → ACP code goes live (but disabled)
2. **Set `ACP_ENABLED=false`** → Keep disabled
3. **Run migrations** → Creates tables
4. **Set env vars** → Configure Repo B
5. **Enable feature flag** → `ACP_ENABLED=true`
6. **Restart app** → ACP becomes active

**Why this works**: Feature flag prevents ACP from executing before tables exist.

---

## Risk Summary

### Biggest Risks

1. **Route collision** → Mitigated by collision detection + base-path
2. **Code deployed before migrations** → Mitigated by feature flag + staged deploy
3. **Env vars required at import** → Mitigated by lazy initialization

### Mitigations

- ✅ **Route collision**: Installer detects and suggests base-path
- ✅ **Migration timing**: Feature flag prevents execution before ready
- ✅ **Import-time failures**: All env reads moved to handler

---

## Troubleshooting

### "Route collision detected"

**Solution**: Use `--base-path`:
```bash
npx echelon install --base-path /api/acp
```

### "ACP_ENABLED not set"

**Solution**: Set feature flag:
```bash
export ACP_ENABLED=true
```

### "Governance hub unreachable"

**Check**:
1. Is `ACP_BASE_URL` correct?
2. Is `ACP_KERNEL_KEY` valid?
3. Is Repo B (Governance Hub) running?

**Behavior**:
- Default: Continues in local-only mode (fail-open)
- Strict: Denies all actions (fail-closed, set `ACP_FAIL_MODE=closed`)

### "Tables don't exist"

**Solution**: Run migrations:
```bash
python manage.py migrate
```

**Prevention**: Use staged deployment (migrations first, then code).

---

## Configuration Reference

### Required Environment Variables

```bash
# Feature flag (must be 'true' to enable)
ACP_ENABLED=true

# Governance Hub (Repo B)
ACP_BASE_URL=https://your-governance-hub.supabase.co
ACP_KERNEL_KEY=acp_kernel_xxxxx
ACP_TENANT_ID=your-tenant-uuid

# Key Vault Executor (Repo C) - Optional
CIA_URL=https://your-executor.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx
CIA_ANON_KEY=eyJ...
```

### Optional Configuration

```bash
# Failure mode (default: 'open')
ACP_FAIL_MODE=open          # Allow if Repo B unreachable
ACP_FAIL_MODE=closed        # Deny if Repo B unreachable
ACP_FAIL_MODE=read-open     # Allow reads, require Repo B for writes

# Kernel identity
KERNEL_ID=your-kernel-id    # Default: auto-generated
```

---

## Rollback Plan

If you need to rollback:

### Option 1: Disable Feature Flag
```bash
ACP_ENABLED=false
# Restart app - ACP disabled, code still present
```

### Option 2: Remove Route
```python
# In urls.py, comment out:
# path('api/manage', manage_endpoint, name='manage'),
```

### Option 3: Uninstall
```bash
npx echelon uninstall
# Removes code, keeps migrations (you can remove manually)
```

---

## Support

For issues or questions:
- Check `TROUBLESHOOTING.md`
- Run `npx echelon doctor` for health check
- Review installation logs

---

## Summary

✅ **Safe to install in production** with these safeguards:
- Route collision detection
- Feature flag (disabled by default)
- Lazy initialization (no import-time failures)
- Staged deployment support
- Graceful degradation

✅ **Recommended flow**:
1. Pre-flight check (`--dry-run`)
2. Generate migrations (`--migrations-only`)
3. Run migrations
4. Install code (`--no-migrations`)
5. Set env vars
6. Enable feature flag (`ACP_ENABLED=true`)

This ensures zero downtime and safe rollback capability.
