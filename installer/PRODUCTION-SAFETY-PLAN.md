# Production Safety & Install Contract

## Overview

This document outlines the safety improvements needed to make the ACP installer production-ready and bulletproof for enterprise deployments.

## Current State Assessment

### ✅ What Works
- Lazy router initialization (good)
- Graceful env var handling in router
- Partial route collision check (import name only)

### ❌ Critical Gaps
- No full route collision detection
- No migration timing validation
- Import-time env reads (heartbeat on module load)
- No feature flag support
- No base-path namespace option
- No migration staging options

---

## Required Improvements

### 1. Route Collision Detection & Base Path Support

**Problem**: Installer only checks import name, not actual route path. Can overwrite existing `/api/manage`.

**Solution**:
- Detect existing routes matching `/api/manage` (or configured base path)
- Fail install with clear error if collision found
- Auto-suggest `--base-path /acp` or `--base-path /echelon` as alternative
- Write chosen base path into bindings for consistency

**Implementation**:
```typescript
// installer/installers/django-installer.ts
async function checkRouteCollision(backendDir: string, basePath: string): Promise<boolean> {
  // Check urls.py for existing route
  // Check for patterns like: path('api/manage', ...)
  // Return true if collision found
}

// CLI option
--base-path <path>  // Default: /api/manage, override: /api/acp, /api/echelon, etc.
```

**Bindings update**:
```json
{
  "base_path": "/api/acp",  // Written to bindings.json
  "endpoint_path": "/api/acp/manage"  // Full endpoint path
}
```

---

### 2. Migration Staging Options

**Problem**: Migrations are always generated, but no control over when/how they run.

**Solution**: Add migration control flags

**New CLI options**:
```bash
--no-migrations      # Code-only install (no migration files)
--migrations-only     # Generate migrations, don't install code
--dry-run            # Show what would be generated (no writes)
```

**Implementation**:
```typescript
// installer/cli.ts
interface InstallOptions {
  // ... existing options
  noMigrations?: boolean;
  migrationsOnly?: boolean;
  dryRun?: boolean;
}

// In installer:
if (options.dryRun) {
  console.log('DRY RUN - Would generate:');
  // Show file paths, route changes, etc.
  return;
}

if (options.migrationsOnly) {
  await generateMigrations(...);
  console.log('✅ Migrations generated. Run them, then install code.');
  return;
}

if (options.noMigrations) {
  console.log('⚠️  Skipping migrations. You must run them manually before using ACP.');
  // Skip migration generation
}
```

**Migration validation**:
- Only CREATE new tables/indexes
- Never ALTER/DROP existing tables
- Validate SQL before writing (syntax check)

---

### 3. No Import-Time Environment Reads

**Problem**: Heartbeat sent on module import, can crash if env vars missing.

**Solution**: Move all env reads inside handler, make everything lazy.

**Current (BAD)**:
```python
# views.py - Module level
_control_plane = HttpControlPlaneAdapter(...)  # ❌ Reads env at import
_send_heartbeat()  # ❌ Runs on import
```

**Fixed (GOOD)**:
```python
# views.py - Handler level only
def manage_endpoint(request):
    router = _get_router()  # Lazy init, reads env here
    # Heartbeat only sent if router successfully initialized
    # And only on first request, not module import
```

**Rules**:
- ✅ `os.getenv()` / `Deno.env.get()` inside handler functions only
- ❌ No env reads at module top-level (except truly optional defaults)
- ✅ All Repo B/Repo C client initialization inside handler
- ✅ Heartbeat sent on first request, not module load

---

### 4. Feature Flag Support

**Problem**: No way to disable ACP without removing code.

**Solution**: Add `ACP_ENABLED` feature flag.

**Implementation**:
```python
# views.py
@csrf_exempt
@require_http_methods(["POST"])
def manage_endpoint(request):
    # Check feature flag first
    if os.getenv('ACP_ENABLED', 'false').lower() != 'true':
        return JsonResponse({
            "ok": False,
            "error": "ACP is disabled. Set ACP_ENABLED=true to enable.",
            "code": "FEATURE_DISABLED"
        }, status=503)
    
    # Continue with normal handler...
```

**Install behavior**:
- Installer sets `ACP_ENABLED=false` by default in `.env.example`
- User must explicitly enable after migrations are run
- Allows: deploy code → run migrations → enable feature flag

---

### 5. Graceful Degradation & Fail-Open/Fail-Closed

**Problem**: If Repo B unreachable, entire system fails.

**Solution**: Configurable graceful degradation.

**Implementation**:
```python
# config.py or bindings
ACP_FAIL_MODE = os.getenv('ACP_FAIL_MODE', 'open')  # 'open' | 'closed'

# In router:
if control_plane:
    try:
        auth_result = await control_plane.authorize(...)
    except Exception as e:
        if ACP_FAIL_MODE == 'closed':
            return {"ok": False, "error": "Governance hub unreachable", "code": "GOVERNANCE_UNAVAILABLE"}
        else:  # fail-open
            logger.warning(f"Governance hub unreachable, allowing: {e}")
            # Continue with local-only mode
```

**Default behavior**:
- **Read actions**: Fail-open (allow if Repo B unreachable)
- **Write actions**: Configurable (default: fail-open, can set fail-closed)

**Configuration**:
```bash
ACP_FAIL_MODE=open      # Allow if Repo B unreachable (default)
ACP_FAIL_MODE=closed    # Deny if Repo B unreachable (strict)
ACP_FAIL_MODE=read-open  # Open for reads, closed for writes (recommended)
```

---

### 6. Pre-Install Validation

**New validation checks**:

```typescript
// installer/cli.ts - Before install
async function validatePreInstall(options: InstallOptions): Promise<void> {
  const issues: string[] = [];
  
  // 1. Route collision check
  const basePath = options.basePath || '/api/manage';
  if (await checkRouteExists(basePath)) {
    issues.push(`Route collision: ${basePath} already exists`);
    console.log(`💡 Suggestion: Use --base-path /api/acp`);
  }
  
  // 2. Production mode confirmation
  if (options.env === 'production') {
    const confirmed = await promptConfirm('⚠️  Installing in PRODUCTION mode. Continue?');
    if (!confirmed) {
      throw new Error('Installation cancelled');
    }
  }
  
  // 3. Migration validation (if generating)
  if (!options.noMigrations) {
    const migrations = await generateMigrations({ dryRun: true });
    // Validate: no ALTER/DROP statements
    for (const migration of migrations) {
      if (migration.includes('ALTER TABLE') || migration.includes('DROP TABLE')) {
        issues.push('Migration contains ALTER/DROP - not allowed');
      }
    }
  }
  
  if (issues.length > 0) {
    throw new Error(`Pre-install validation failed:\n${issues.join('\n')}`);
  }
}
```

---

## Implementation Checklist

### Phase 1: Critical Safety (Must Have)
- [ ] Route collision detection with base-path support
- [ ] No import-time env reads (move to handler)
- [ ] Feature flag (`ACP_ENABLED`)
- [ ] Pre-install validation (route check, production confirmation)

### Phase 2: Migration Control (High Value)
- [ ] `--no-migrations` flag
- [ ] `--migrations-only` flag
- [ ] `--dry-run` flag
- [ ] Migration validation (no ALTER/DROP)

### Phase 3: Graceful Degradation (Nice to Have)
- [ ] Fail-open/fail-closed configuration
- [ ] Read vs write action differentiation
- [ ] Better error messages for governance hub failures

---

## Updated Install Flow

### Development Mode (Safe)
```bash
npx echelon install --env development
# ✅ Auto-generates safe kernel ID
# ✅ Skips production checks
# ✅ Creates .env.example with ACP_ENABLED=false
```

### Production Mode (Strict)
```bash
# Step 1: Pre-flight check
npx echelon install --env production --dry-run

# Step 2: Generate migrations only
npx echelon install --env production --migrations-only

# Step 3: Review migrations, run them
python manage.py migrate

# Step 4: Install code (migrations already run)
npx echelon install --env production --no-migrations

# Step 5: Set environment variables
export ACP_ENABLED=true
export ACP_BASE_URL=...
export ACP_KERNEL_KEY=...

# Step 6: Restart application
```

### With Base Path (If Collision)
```bash
# Detects collision, suggests:
npx echelon install --base-path /api/acp

# Installs to /api/acp/manage instead of /api/manage
```

---

## Production Install Recommendations Document

See `PRODUCTION-INSTALL-GUIDE.md` for customer-facing documentation.

---

## Testing Plan

### Unit Tests
- [ ] Route collision detection
- [ ] Base path generation
- [ ] Migration validation (reject ALTER/DROP)
- [ ] Feature flag behavior

### Integration Tests
- [ ] Install with `--no-migrations`
- [ ] Install with `--migrations-only`
- [ ] Install with `--base-path`
- [ ] Install in production mode (should prompt)

### Manual Tests
- [ ] Install on fresh repo (should work)
- [ ] Install on repo with existing `/api/manage` (should fail + suggest)
- [ ] Install with `ACP_ENABLED=false` (should return 503)
- [ ] Test graceful degradation (unplug Repo B, should continue)

---

## Migration Guide for Existing Installations

For repos already using ACP:

1. **Add feature flag** (backward compatible):
   - Add `ACP_ENABLED=true` to env (defaults to enabled if not set)
   - No code changes needed

2. **Move env reads to handler** (breaking if env vars missing):
   - Update `views.py` to lazy-load everything
   - Test that startup doesn't fail if env vars missing

3. **Add base path support** (optional):
   - If no collision, no changes needed
   - If collision, reinstall with `--base-path`

---

## Timeline

- **Week 1**: Phase 1 (Critical Safety)
- **Week 2**: Phase 2 (Migration Control)
- **Week 3**: Phase 3 (Graceful Degradation) + Testing
- **Week 4**: Documentation + Customer-facing guide

---

## Success Criteria

✅ Installer can be run on production repo without risk
✅ Route collisions are caught and handled gracefully
✅ Migrations can be staged separately from code
✅ System degrades gracefully if Repo B unreachable
✅ Feature flag allows safe enable/disable
✅ No import-time failures from missing env vars
