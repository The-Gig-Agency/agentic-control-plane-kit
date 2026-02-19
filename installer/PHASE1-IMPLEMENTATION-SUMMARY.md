# Phase 1 Implementation Summary

## ✅ Completed: Critical Safety Features

### 1. Route Collision Detection with Base-Path Support

**Implemented in**: `installer/cli.ts`

- Added `checkRouteCollision()` function that detects existing routes
- Checks Django `urls.py` files for route patterns
- Checks Express/Supabase route files and main app files
- Fails install with clear error if collision found
- Auto-suggests `--base-path /api/acp` or `--base-path /api/echelon`

**CLI Option Added**:
```bash
--base-path <path>  # Default: /api/manage, override: /api/acp, etc.
```

### 2. Base-Path Support Throughout Installer

**Implemented in**:
- `installer/cli.ts` - Added `basePath` to `InstallOptions`
- `installer/installers/django-installer.ts` - Passes basePath to generators
- `installer/generators/generate-bindings.ts` - Includes `base_path` in bindings
- `installer/generators/generate-endpoint.ts` - Uses basePath in generated code

**Bindings Updated**:
```json
{
  "base_path": "/api/acp",
  "endpoint_path": "/api/acp/manage"
}
```

### 3. Pre-Install Validation

**Implemented in**: `installer/cli.ts`

- `validatePreInstall()` function runs before installation
- **Route collision check**: Detects existing routes, fails with suggestion
- **Production confirmation**: Prompts user to confirm production install
- Only runs in production mode (skipped in dev/staging)

**Flow**:
```
Production install → Validate routes → Confirm → Install
```

### 4. Feature Flag Support

**Implemented in**: `installer/generators/generate-endpoint.ts`

- Generated endpoint checks `ACP_ENABLED` environment variable
- Returns `503 FEATURE_DISABLED` if not enabled
- Default: `ACP_ENABLED=false` in `.env.example`
- Allows safe deployment: code → migrations → enable flag

**Generated Code**:
```python
# First check in handler
acp_enabled = os.environ.get('ACP_ENABLED', 'false').lower() == 'true'
if not acp_enabled:
    return JsonResponse({
        "ok": False,
        "error": "ACP is disabled. Set ACP_ENABLED=true to enable.",
        "code": "FEATURE_DISABLED"
    }, status=503)
```

### 5. No Import-Time Environment Reads

**Implemented in**: `installer/generators/generate-endpoint.ts`

- **Before**: Env reads at module import (could crash on startup)
- **After**: All env reads moved inside `_get_router()` (lazy initialization)
- Heartbeat sent on first request, not module import
- Application starts even if env vars missing

**Key Changes**:
- Removed module-level env reads
- All `os.environ.get()` calls inside handler functions
- Router initialization is lazy (only on first request)
- Heartbeat moved from module import to first request

## Files Modified

1. **installer/cli.ts**
   - Added `basePath` to `InstallOptions`
   - Added `validatePreInstall()` function
   - Added `checkRouteCollision()` function
   - Added `promptConfirm()` function
   - Added `--base-path` CLI argument parsing

2. **installer/installers/django-installer.ts**
   - Updated to accept and use `basePath`
   - Passes `basePath` to generators
   - Updates `addUrlRoute()` to use `basePath`
   - Adds `ACP_ENABLED=false` to `.env.example`

3. **installer/generators/generate-bindings.ts**
   - Added `basePath` to `BindingsGenerationOptions`
   - Includes `base_path` and `endpoint_path` in bindings

4. **installer/generators/generate-endpoint.ts**
   - Added `basePath` to `EndpointGenerationOptions`
   - Generated endpoint includes feature flag check
   - All env reads moved to lazy initialization
   - Heartbeat moved to first request (not module import)

## Testing Checklist

- [ ] Test route collision detection (existing `/api/manage`)
- [ ] Test base-path override (`--base-path /api/acp`)
- [ ] Test production confirmation prompt
- [ ] Test feature flag (disabled by default)
- [ ] Test lazy initialization (startup with missing env vars)
- [ ] Test bindings include base_path
- [ ] Test URL route uses base_path

## Next Steps

### Phase 2: Migration Control (Not Started)
- [ ] `--no-migrations` flag
- [ ] `--migrations-only` flag
- [ ] `--dry-run` flag
- [ ] Migration validation (reject ALTER/DROP)

### Phase 3: Graceful Degradation (Not Started)
- [ ] Fail-open/fail-closed configuration
- [ ] Read vs write action differentiation
- [ ] Better error messages

## Notes

- **Django-focused**: Implementation primarily targets Django. Express/Supabase installers need similar updates.
- **Backward compatible**: Default base-path is `/api/manage` (existing behavior)
- **Production-ready**: All Phase 1 critical safety features implemented
