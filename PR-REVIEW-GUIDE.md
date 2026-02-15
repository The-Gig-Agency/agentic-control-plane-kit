# PR Review Guide: api-docs-template feat/agentic-control-plane

## PR Overview
- **Repository**: acedge123/api-docs-template (lead scoring SaaS)
- **Branch**: `feat/agentic-control-plane`
- **Commits**: 2
- **Files Changed**: 13
- **Purpose**: Integrate agentic control plane kit into Django lead scoring repo

## Commit Analysis

### Commit 1: "feat: Add ACP /manage endpoint with Python kernel"
**Key Components:**
- `control_plane` app with `acp/router` implementing spec contract
- `meta.actions`, `meta.version` endpoints
- `leadscoring` domain pack stub
- Stub adapters (audit, idempotency, rate limit, ceilings)
- `POST /api/manage` with `X-API-Key` auth (stub accepts any key)
- Conforms to agentic-control-plane-kit spec

### Commit 2: "test(control-plane): add /api/manage smoke tests + local dev notes"
**Key Components:**
- Smoke tests for `/api/manage`
- Local dev notes

---

## Critical Review Points

### 1. Kernel Architecture Compliance ⚠️

**Must Verify:**
- [ ] **Framework-Agnostic**: Python kernel uses interfaces, not Django-specific code
- [ ] **Pure Functions**: Router is a pure function that returns a handler
- [ ] **Adapter Pattern**: All DB operations go through adapters, not direct ORM calls
- [ ] **No Hardcoded Dependencies**: Kernel doesn't import Django models directly

**What to Look For:**
```python
# ✅ GOOD: Interface-based
class DbAdapter(ABC):
    @abstractmethod
    def listApiKeys(self, tenant_id: str) -> List[ApiKey]:
        pass

# ❌ BAD: Direct Django imports in kernel
from scoringengine.models import ApiKey
```

**Red Flags:**
- Django model imports in `control_plane/acp/router.py`
- Direct `Model.objects.filter()` calls in handlers
- Hardcoded table names in kernel code

---

### 2. Adapter Implementations 🔴

**Critical: Stub Adapters**

The PR mentions "stub adapters" - this is acceptable for initial PR, but must verify:

- [ ] **Clear Marking**: Stubs are clearly marked with `# TODO` or `# STUB`
- [ ] **Fail Gracefully**: Stubs should raise `NotImplementedError`, not silently pass
- [ ] **Security**: Stub auth should NOT work in production (environment check)

**Expected Structure:**
```python
# ✅ GOOD: Clear stub with TODO
class StubAuditAdapter(AuditAdapter):
    async def log(self, entry: AuditEntry) -> None:
        # TODO: Implement real audit logging
        # STUB: Currently no-op for development
        logger.warning(f"STUB: Would log audit entry: {entry.action}")
        pass

# ❌ BAD: Silent stub
class StubAuditAdapter(AuditAdapter):
    async def log(self, entry: AuditEntry) -> None:
        pass  # Silent failure!
```

**Adapter Checklist:**
- [ ] **AuditAdapter**: Should write to `audit_log` table (even if stubbed)
- [ ] **IdempotencyAdapter**: Should use separate cache/table (NOT audit_log)
- [ ] **RateLimitAdapter**: Should track per-key and per-action
- [ ] **CeilingsAdapter**: Should check tenant limits
- [ ] **DbAdapter**: Must implement all pack methods (listApiKeys, createWebhook, etc.)

---

### 3. Router Implementation ✅

**Must Match Spec Exactly:**

- [ ] **Request Envelope**: Matches `ManageRequest` interface
  ```python
  {
    "action": "string",
    "params": {},
    "idempotency_key": "optional",
    "dry_run": false
  }
  ```

- [ ] **Response Envelope**: Matches `ManageResponse` interface
  ```python
  {
    "ok": bool,
    "request_id": "string",
    "data": {},
    "error": "optional",
    "code": "optional",
    "dry_run": bool,
    "constraints_applied": []
  }
  ```

- [ ] **Error Codes**: Must match exactly
  - `SCOPE_DENIED`
  - `VALIDATION_ERROR`
  - `NOT_FOUND`
  - `RATE_LIMITED`
  - `CEILING_EXCEEDED`
  - `IDEMPOTENT_REPLAY`
  - `INVALID_API_KEY`
  - `INTERNAL_ERROR`

- [ ] **Execution Order**: Must follow this sequence:
  1. Validate request schema
  2. Authenticate (API key)
  3. Lookup action
  4. Check dry-run support
  5. Check scope
  6. Rate limit
  7. Ceilings (for mutations)
  8. Idempotency replay
  9. Validate params
  10. Execute handler
  11. Audit log (ALWAYS)
  12. Store idempotency result

---

### 4. Meta Actions Endpoints 🔍

**Must Verify:**

- [ ] **meta.actions**:
  - Returns full action registry with schemas
  - Requires `manage.read` or `meta.discover` scope
  - Includes all enabled packs

- [ ] **meta.version**:
  - Returns API version info
  - Requires `manage.read` or `meta.discover` scope

**Expected Response:**
```python
# meta.actions
{
  "ok": True,
  "data": {
    "actions": [
      {
        "name": "meta.actions",
        "scope": "manage.read",
        "description": "...",
        "params_schema": {...},
        "supports_dry_run": False
      },
      # ... all other actions
    ]
  }
}
```

---

### 5. Domain Pack Structure 📦

**Lead Scoring Pack Should Have:**

- [ ] **Actions**: Follow naming `domain.leadscoring.*`
  - `domain.leadscoring.models.list`
  - `domain.leadscoring.models.create`
  - `domain.leadscoring.rules.update`
  - `domain.leadscoring.scores.recompute`
  - `domain.leadscoring.leads.export`

- [ ] **Handlers**: Use adapter interfaces
  ```python
  # ✅ GOOD
  async def handleModelsList(params, ctx: ActionContext):
      models = await ctx.db.listScoringModels(ctx.tenantId)
      return {"data": models}
  
  # ❌ BAD
  async def handleModelsList(params, ctx: ActionContext):
      models = ScoringModel.objects.filter(tenant_id=ctx.tenantId)  # Direct ORM!
      return {"data": models}
  ```

- [ ] **Impact Shape**: Dry-run actions return standardized impact
  ```python
  {
    "creates": [{"type": "scoring_model", "count": 1}],
    "updates": [],
    "deletes": [],
    "side_effects": [],
    "risk": "low",
    "warnings": []
  }
  ```

---

### 6. Bindings Configuration 📋

**Must Have `controlplane.bindings.json`:**

```json
{
  "tenant": {
    "table": "tenants",
    "id_column": "id",
    "get_tenant_fn": "get_tenant_id",
    "is_admin_fn": "is_platform_admin"
  },
  "auth": {
    "keys_table": "api_keys",
    "key_prefix": "lsk_",
    "prefix_length": 12,
    "key_hash_column": "key_hash",
    "key_prefix_column": "prefix",
    "scopes_column": "scopes"
  },
  "database": {
    "adapter": "django",
    "connection_env": "DATABASE_URL"
  },
  "packs": {
    "enabled": ["iam", "webhooks", "settings", "domain"]
  },
  "domain": {
    "namespace": "domain.leadscoring"
  }
}
```

**Verify:**
- [ ] File exists in repo root
- [ ] All required fields present
- [ ] Matches actual Django schema
- [ ] Packs enabled match installed packs

---

### 7. Django Integration 🔗

**Endpoint Wrapper Should:**

- [ ] **Location**: `api/views/manage.py` or `api/urls.py`
- [ ] **Method**: `POST` only
- [ ] **Auth**: Extracts `X-API-Key` header
- [ ] **Request**: Converts Django request to `ManageRequest`
- [ ] **Response**: Converts `ManageResponse` to Django JsonResponse

**Expected Pattern:**
```python
# api/views/manage.py
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from control_plane.acp.router import createManageRouter

@require_http_methods(["POST"])
def manage_endpoint(request):
    body = json.loads(request.body)
    response = await router(body, {
        "request": request,
        "ipAddress": get_client_ip(request)
    })
    return JsonResponse(json.loads(response.body), status=response.status)
```

---

### 8. Testing Coverage 🧪

**Smoke Tests Should Cover:**

- [ ] **meta.actions**: Returns action list
- [ ] **meta.version**: Returns version info
- [ ] **Domain actions**: At least one leadscoring action
- [ ] **Error cases**: Invalid action, missing scope, validation errors
- [ ] **Auth**: Missing/invalid API key

**Test Structure:**
```python
def test_meta_actions():
    response = client.post('/api/manage', {
        'action': 'meta.actions'
    }, headers={'X-API-Key': 'test_key'})
    assert response.status_code == 200
    assert 'actions' in response.json()['data']
```

---

### 9. Security Concerns 🔒

**Critical Checks:**

- [ ] **Stub Auth**: Must be development-only
  ```python
  # ✅ GOOD
  if settings.DEBUG:
      # Stub auth for development
  else:
      # Real auth for production
  
  # ❌ BAD
  # Stub auth always enabled
  ```

- [ ] **Tenant Scoping**: All DB operations must be tenant-scoped
  ```python
  # ✅ GOOD
  models = await ctx.db.listScoringModels(ctx.tenantId)  # Explicit tenant
  
  # ❌ BAD
  models = await ctx.db.listScoringModels()  # No tenant!
  ```

- [ ] **Scope Enforcement**: Deny-by-default
- [ ] **Audit Logging**: Always logs, even on errors

---

### 10. Documentation 📚

**Must Have:**

- [ ] **Local Dev Notes**: How to run and test
- [ ] **README Updates**: Documents `/api/manage` endpoint
- [ ] **Stub Warnings**: Clear indication of what's stubbed
- [ ] **Next Steps**: What needs to be implemented

---

## Approval Decision Matrix

### ✅ **APPROVE** if:

1. ✅ Follows kernel architecture (interfaces, not direct DB)
2. ✅ Stub adapters are clearly marked and fail gracefully
3. ✅ Router matches spec exactly (envelope, error codes, execution order)
4. ✅ Meta actions work correctly
5. ✅ Domain pack structure is correct
6. ✅ Tests cover main flows
7. ✅ Security: Stub auth is development-only
8. ✅ Documentation is clear

### 🔄 **REQUEST CHANGES** if:

1. ❌ Direct Django ORM calls in handlers (not using adapters)
2. ❌ Stub auth could work in production
3. ❌ Missing critical safety rails (idempotency, dry-run)
4. ❌ Router doesn't match spec (wrong envelope, error codes)
5. ❌ No tenant scoping in DB operations
6. ❌ Tests are insufficient
7. ❌ No documentation

### ❌ **REJECT** if:

1. ❌ Hardcoded framework dependencies in kernel
2. ❌ Security vulnerabilities (stub auth in production)
3. ❌ Completely breaks existing functionality
4. ❌ No tests at all

---

## Specific Code Patterns to Check

### ✅ Good Patterns:

```python
# Pure router function
def createManageRouter(config: KernelConfig) -> ManageRouter:
    # No side effects, returns handler
    pass

# Interface-based adapter
class DjangoDbAdapter(DbAdapter):
    async def listApiKeys(self, tenant_id: str) -> List[ApiKey]:
        # Uses Django ORM but through interface
        return [self._serialize(k) for k in ApiKey.objects.filter(tenant_id=tenant_id)]

# Handler uses context
async def handleAction(params, ctx: ActionContext):
    # Uses ctx.db, not direct import
    data = await ctx.db.listSomething(ctx.tenantId)
    return {"data": data}
```

### ❌ Bad Patterns:

```python
# Direct model import in handler
from scoringengine.models import ScoringModel

async def handleAction(params, ctx: ActionContext):
    # Direct ORM call, bypasses adapter
    models = ScoringModel.objects.filter(tenant_id=ctx.tenantId)
    return {"data": models}

# Hardcoded in kernel
def createManageRouter():
    # Direct Django import in kernel
    from django.conf import settings
    # ...
```

---

## Questions to Ask Reviewer

1. **Are stub adapters clearly marked?** (Look for TODOs, comments)
2. **Is stub auth development-only?** (Check environment checks)
3. **Do handlers use adapters?** (Search for direct model imports)
4. **Does router match spec?** (Compare envelope, error codes)
5. **Are all DB operations tenant-scoped?** (Check for tenant_id parameter)
6. **Do tests cover error cases?** (Invalid action, missing scope, etc.)

---

## Next Steps After Approval

1. **Replace Stub Adapters**: Implement real audit, idempotency, rate limit, ceilings
2. **Implement Real Auth**: Replace stub API key validation
3. **Expand Domain Pack**: Add more leadscoring actions
4. **Add Integration Tests**: Test full flows end-to-end
5. **Generate OpenAPI**: Create OpenAPI spec from actions
6. **Connect Edge Bot**: Test with actual agent

---

## Review Checklist Summary

**Architecture (Must Have):**
- [ ] Kernel is framework-agnostic
- [ ] Adapters are interfaces
- [ ] Handlers use ctx.db, not direct DB

**Implementation (Must Have):**
- [ ] Router matches spec exactly
- [ ] Error codes match spec
- [ ] Execution order is correct
- [ ] Meta actions work

**Safety (Must Have):**
- [ ] Stub auth is dev-only
- [ ] Tenant scoping enforced
- [ ] Audit logging always
- [ ] Idempotency implemented

**Quality (Should Have):**
- [ ] Tests cover main flows
- [ ] Documentation is clear
- [ ] Stubs are marked
- [ ] No security issues

---

**Recommendation**: Review the actual code diff to verify these points. If you can share the diff or specific files, I can provide more targeted feedback.
