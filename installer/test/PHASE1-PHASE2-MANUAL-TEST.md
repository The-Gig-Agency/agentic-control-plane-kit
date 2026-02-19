# Phase 1 & Phase 2 Manual Test Checklist

## Quick Verification Tests

### Phase 1: Critical Safety Features

#### ✅ Test 1.1: Route Collision Detection
**Expected**: Installer detects existing `/api/manage` route and fails with suggestion

**Manual Test**:
```bash
# Create test project with existing route
mkdir -p test-collision/backend/api
cat > test-collision/backend/api/urls.py << 'EOF'
from django.urls import path
urlpatterns = [
    path('api/manage', some_view),
]
EOF

# Try to install
cd test-collision
npx echelon install --framework django --env production

# Expected: Error message about route collision + suggestion to use --base-path
```

**Code Verification**:
- [x] `installer/cli.ts` has `checkRouteCollision()` function
- [x] `validatePreInstall()` calls `checkRouteCollision()`
- [x] Error message suggests `--base-path /api/acp`

#### ✅ Test 1.2: Base-Path Support
**Expected**: `--base-path` flag works and writes to bindings

**Manual Test**:
```bash
mkdir test-basepath
cd test-basepath
npx echelon install --framework django --env development --base-path /api/acp --no-migrations

# Check bindings.py contains base_path
grep -i "base_path" backend/control_plane/bindings.py
# Expected: base_path: '/api/acp'
```

**Code Verification**:
- [x] `InstallOptions` includes `basePath?: string`
- [x] CLI parsing includes `--base-path` argument
- [x] `generateBindings()` includes `base_path` in output
- [x] `addUrlRoute()` uses `basePath` parameter

#### ✅ Test 1.3: Feature Flag (ACP_ENABLED)
**Expected**: Generated endpoint checks `ACP_ENABLED` and returns 503 if disabled

**Manual Test**:
```bash
mkdir test-featureflag
cd test-featureflag
npx echelon install --framework django --env development --no-migrations

# Check generated endpoint
grep -A 5 "ACP_ENABLED" backend/control_plane/views/manage.py
# Expected: Feature flag check at start of handler
```

**Code Verification**:
- [x] `generate-endpoint.ts` includes feature flag check
- [x] Check happens before any processing
- [x] Returns `503 FEATURE_DISABLED` if not enabled
- [x] `.env.example` includes `ACP_ENABLED=false`

#### ✅ Test 1.4: Lazy Env Reads
**Expected**: No `os.environ.get()` at module level, all inside `_get_router()`

**Manual Test**:
```bash
# Check generated endpoint
grep -n "os.environ.get" backend/control_plane/views/manage.py

# Expected: All env reads are inside _get_router() function, not at module level
# Should NOT see env reads at top of file
```

**Code Verification**:
- [x] Generated endpoint has `_get_router()` function
- [x] All `os.environ.get()` calls are inside `_get_router()`
- [x] No env reads at module top-level
- [x] Heartbeat moved to first request (not module import)

#### ✅ Test 1.5: Production Confirmation
**Expected**: Production install prompts for confirmation

**Manual Test**:
```bash
mkdir test-prod
cd test-prod
echo "n" | npx echelon install --framework django --env production
# Expected: Prompt "Installing in PRODUCTION mode. Continue? [y/N]:"
# Expected: Installation cancelled if "n"
```

**Code Verification**:
- [x] `validatePreInstall()` includes production confirmation
- [x] `promptConfirm()` function exists
- [x] Only runs in production mode

---

### Phase 2: Migration Control Features

#### ✅ Test 2.1: --dry-run Flag
**Expected**: Shows what would be generated without writing files

**Manual Test**:
```bash
mkdir test-dryrun
cd test-dryrun
npx echelon install --framework django --env development --dry-run

# Expected output:
# - "DRY RUN MODE - No files will be written"
# - List of files that would be generated
# - No actual files created
```

**Code Verification**:
- [x] `InstallOptions` includes `dryRun?: boolean`
- [x] `dryRunInstall()` function exists
- [x] CLI parsing includes `--dry-run` argument
- [x] Early return before actual installation

#### ✅ Test 2.2: --no-migrations Flag
**Expected**: Generates code but skips migrations

**Manual Test**:
```bash
mkdir test-nomigrations
cd test-nomigrations
npx echelon install --framework django --env development --no-migrations

# Check files created
ls -la backend/control_plane/
# Expected: bindings.py, views/, adapters/ exist

# Check migrations NOT created
ls backend/your_app/migrations/ 2>/dev/null || echo "Migrations directory doesn't exist (correct)"
# Expected: No migration files
```

**Code Verification**:
- [x] `InstallOptions` includes `noMigrations?: boolean`
- [x] `django-installer.ts` checks `options.noMigrations`
- [x] Skips `generateMigrations()` call if flag set
- [x] Shows warning message

#### ✅ Test 2.3: --migrations-only Flag
**Expected**: Generates migrations only, skips code

**Manual Test**:
```bash
mkdir test-migrationsonly
cd test-migrationsonly
npx echelon install --framework django --env development --migrations-only

# Check migrations created
ls backend/your_app/migrations/*.py
# Expected: Migration file exists

# Check code NOT created
ls backend/control_plane/ 2>/dev/null || echo "Control plane directory doesn't exist (correct)"
# Expected: No control_plane directory
```

**Code Verification**:
- [x] `InstallOptions` includes `migrationsOnly?: boolean`
- [x] `migrationsOnlyInstall()` function exists
- [x] Early return after migration generation
- [x] Shows next steps message

#### ✅ Test 2.4: Migration Validation
**Expected**: Validates migrations before generating (rejects ALTER/DROP)

**Manual Test**:
```bash
# This is harder to test manually since our template doesn't have ALTER/DROP
# But we can verify validation runs:

mkdir test-validation
cd test-validation
npx echelon install --framework django --env development --migrations-only

# Check output for validation message
# Expected: "Validating migrations..." or "Migration validation passed"
```

**Code Verification**:
- [x] `generate-migrations.ts` exports `validateMigrations()`
- [x] Validation runs before generation
- [x] Checks for forbidden SQL patterns (ALTER, DROP, etc.)
- [x] Django migrations only use CreateModel (safe by design)

---

## Automated Code Verification

Run these commands to verify code structure:

```bash
# Check Phase 1 features exist
grep -r "checkRouteCollision" installer/cli.ts
grep -r "basePath" installer/cli.ts
grep -r "ACP_ENABLED" installer/generators/generate-endpoint.ts
grep -r "_get_router" installer/generators/generate-endpoint.ts

# Check Phase 2 features exist
grep -r "dryRun" installer/cli.ts
grep -r "noMigrations" installer/cli.ts
grep -r "migrationsOnly" installer/cli.ts
grep -r "validateMigrations" installer/generators/generate-migrations.ts
```

---

## Test Results Summary

### Phase 1: Critical Safety ✅
- [x] Route collision detection implemented
- [x] Base-path support implemented
- [x] Feature flag implemented
- [x] Lazy env reads implemented
- [x] Production confirmation implemented

### Phase 2: Migration Control ✅
- [x] --dry-run flag implemented
- [x] --no-migrations flag implemented
- [x] --migrations-only flag implemented
- [x] Migration validation implemented

---

## Next Steps

1. **Manual Testing**: Run the manual tests above in a real environment
2. **Integration Testing**: Test full install flows with different flag combinations
3. **Edge Cases**: Test with various project structures and existing routes
4. **Documentation**: Update user-facing docs with new flags
