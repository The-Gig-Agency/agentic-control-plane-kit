# PR Review Checklist: api-docs-template feat/agentic-control-plane

## PR Summary
- **Branch**: `feat/agentic-control-plane`
- **Commits**: 2
- **Files Changed**: 13
- **Contributors**: 2 (Edge Bot + Cursor)

## Commit Analysis

### Commit 1: "feat: Add ACP /manage endpoint with Python kernel"
**What it adds:**
- ✅ `control_plane` app with `acp/router` implementing spec contract
- ✅ `meta.actions`, `meta.version` endpoints
- ✅ `leadscoring` domain pack stub
- ✅ Stub adapters (audit, idempotency, rate limit, ceilings)
- ✅ `POST /api/manage` with `X-API-Key` auth (stub accepts any key)
- ✅ Conforms to agentic-control-plane-kit spec

### Commit 2: "test(control-plane): add /api/manage smoke tests + local dev notes"
**What it adds:**
- ✅ Smoke tests for `/api/manage`
- ✅ Local dev notes

## Review Checklist

### ✅ Architecture Compliance

- [ ] **Kernel Approach**: Python implementation follows kernel pattern (pure functions, interface-based)
- [ ] **Adapter Pattern**: Adapters are interfaces, not direct DB calls
- [ ] **Pack Structure**: Domain pack follows template structure
- [ ] **Bindings File**: `controlplane.bindings.json` exists and is properly configured

### ✅ Implementation Quality

- [ ] **Router Implementation**: 
  - [ ] Single `/manage` endpoint
  - [ ] Request/response envelope matches spec
  - [ ] Proper error codes (SCOPE_DENIED, VALIDATION_ERROR, etc.)
  
- [ ] **Authentication**:
  - [ ] `X-API-Key` header parsing
  - [ ] API key validation (even if stubbed)
  - [ ] Tenant resolution from API key
  - [ ] Scope extraction

- [ ] **Meta Actions**:
  - [ ] `meta.actions` returns full action registry
  - [ ] `meta.version` returns API version info
  - [ ] Both require `manage.read` scope (or `meta.discover`)

- [ ] **Domain Pack**:
  - [ ] Actions follow naming: `domain.leadscoring.*`
  - [ ] Handlers use adapter interfaces (`ctx.db`, not direct DB)
  - [ ] Actions declare scopes
  - [ ] Dry-run actions return impact shape

### ✅ Adapter Implementation

- [ ] **Audit Adapter**:
  - [ ] Implements `log(entry)` method
  - [ ] Writes to audit log table
  - [ ] Captures all required fields (tenantId, action, result, etc.)

- [ ] **Idempotency Adapter**:
  - [ ] Implements `getReplay()` and `storeReplay()`
  - [ ] Uses separate cache/table (not audit_log)
  - [ ] Proper key format: `tenantId:action:idempotency_key`

- [ ] **Rate Limit Adapter**:
  - [ ] Implements `check()` method
  - [ ] Returns `{allowed, limit, remaining}`
  - [ ] Per-key and per-action limits

- [ ] **Ceilings Adapter**:
  - [ ] Implements `check()` method
  - [ ] Throws on ceiling breach
  - [ ] Tenant-scoped checks

- [ ] **DB Adapter**:
  - [ ] Implements all pack-specific methods (listApiKeys, createWebhook, etc.)
  - [ ] All methods are tenant-scoped
  - [ ] Uses Django ORM or raw SQL appropriately

### ✅ Safety Rails

- [ ] **Dry-Run Support**:
  - [ ] Actions declare `supports_dry_run`
  - [ ] Router rejects `dry_run=true` if action doesn't support it
  - [ ] Dry-run handlers return impact shape

- [ ] **Idempotency**:
  - [ ] Router checks idempotency cache before execution
  - [ ] Returns `IDEMPOTENT_REPLAY` code when found
  - [ ] Stores results after successful execution

- [ ] **Rate Limiting**:
  - [ ] Applied per-key and per-action
  - [ ] Returns `RATE_LIMITED` code when exceeded
  - [ ] Logged in audit

- [ ] **Ceilings**:
  - [ ] Applied before mutations
  - [ ] Returns `CEILING_EXCEEDED` code
  - [ ] Tenant-scoped

- [ ] **Scope Checking**:
  - [ ] Deny-by-default
  - [ ] Returns `SCOPE_DENIED` code
  - [ ] Logged in audit

### ✅ Testing

- [ ] **Smoke Tests**:
  - [ ] Test `meta.actions` endpoint
  - [ ] Test `meta.version` endpoint
  - [ ] Test domain pack actions
  - [ ] Test error cases (invalid action, missing scope, etc.)

- [ ] **Integration Tests**:
  - [ ] Test full request flow
  - [ ] Test idempotency replay
  - [ ] Test dry-run mode
  - [ ] Test rate limiting
  - [ ] Test audit logging

### ✅ Documentation

- [ ] **README Updates**:
  - [ ] Documents `/api/manage` endpoint
  - [ ] Shows example requests
  - [ ] Links to control plane docs

- [ ] **Local Dev Notes**:
  - [ ] How to run locally
  - [ ] How to test
  - [ ] Environment variables needed

- [ ] **Bindings Documentation**:
  - [ ] `controlplane.bindings.json` is documented
  - [ ] Shows required fields
  - [ ] Example configuration

### ✅ Code Quality

- [ ] **Python Best Practices**:
  - [ ] Type hints used
  - [ ] Proper error handling
  - [ ] No hardcoded values
  - [ ] Follows Django patterns (if Django)

- [ ] **Structure**:
  - [ ] Clear separation: kernel/packs/adapters
  - [ ] No circular dependencies
  - [ ] Proper imports

### ⚠️ Potential Issues to Check

1. **Stub Adapters**: 
   - ⚠️ "Stub accepts any key" - ensure this is clearly marked as temporary
   - ⚠️ Stub adapters should fail gracefully, not silently pass

2. **Python vs TypeScript**:
   - ⚠️ Ensure Python implementation matches TypeScript kernel spec
   - ⚠️ Type hints should match TypeScript interfaces

3. **Django Integration**:
   - ⚠️ Ensure adapters use Django ORM properly
   - ⚠️ Tenant scoping via RLS or explicit WHERE clauses
   - ⚠️ Transaction handling

4. **Testing**:
   - ⚠️ Smoke tests should be comprehensive enough
   - ⚠️ Consider adding invariant tests (like in kit)

## Specific Files to Review

Based on the architecture, these files should exist:

1. `control_plane/acp/router.py` - Main router
2. `control_plane/acp/auth.py` - API key validation
3. `control_plane/acp/adapters/` - Adapter implementations
4. `control_plane/packs/leadscoring/` - Domain pack
5. `controlplane.bindings.json` - Bindings config
6. `api/views/manage.py` or `api/urls.py` - Django endpoint
7. `tests/test_control_plane.py` - Tests

## Recommendations

### Must Have Before Merge

1. ✅ Real API key validation (not stub)
2. ✅ Real adapter implementations (at least audit and idempotency)
3. ✅ Comprehensive tests
4. ✅ Documentation

### Nice to Have

1. OpenAPI generation
2. Invariant tests
3. Integration with existing Django auth
4. Performance benchmarks

## Approval Criteria

**Approve if:**
- ✅ Follows kernel architecture
- ✅ Adapters are properly implemented (not all stubs)
- ✅ Tests pass and cover main flows
- ✅ Documentation is clear
- ✅ No security issues (stub auth is clearly marked)

**Request Changes if:**
- ❌ Hardcoded framework dependencies in kernel
- ❌ Direct DB calls in handlers (not using adapters)
- ❌ Missing safety rails (dry-run, idempotency, rate limits)
- ❌ No tests or insufficient coverage
- ❌ Security issues (stub auth in production)

## Next Steps After Merge

1. Implement real adapters (replace stubs)
2. Add domain pack actions (leadscoring.models.*, etc.)
3. Generate OpenAPI spec
4. Run verify script (when Python version exists)
5. Connect Edge Bot to test
