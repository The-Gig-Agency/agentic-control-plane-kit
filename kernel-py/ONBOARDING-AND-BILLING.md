# Onboarding and Billing Extensions

This document describes optional extensions for agent onboarding, usage tracking, and billing.

## Overview

These features are **optional** and can be added to any ACP kernel implementation:

1. **Usage Limit Enforcement** - Free tier limits and upgrade prompts
2. **Onboarding Endpoint** - Self-service agent registration
3. **Usage Endpoint** - Check usage statistics
4. **Billing Support** - Billable flags in action definitions

## Backward Compatibility

All changes are backward compatible:
- `ActionDef.billable` defaults to `True` (existing actions are billable by default)
- `ActionDef.billing_unit` defaults to `None` (optional)
- Usage enforcement is opt-in (only if control plane has `get_usage()` method)
- Onboarding/usage endpoints are separate modules (don't affect core router)

## Implementation Guide

### 1. Update ActionDef (Already Done)

The `ActionDef` class in `acp/types.py` now includes:
```python
@dataclass
class ActionDef:
    # ... existing fields ...
    billable: bool = True  # Optional: Whether this action should be billed
    billing_unit: Optional[str] = None  # Optional: "call" | "token" | "row" | "sec"
```

**No changes needed** - existing code continues to work.

### 2. Add Usage Enforcement to Router (Optional)

If you want free tier limits, add usage enforcement to your router:

```python
from acp.usage import enforce_usage_limit, UpgradeRequiredError

def router(request_body: Dict, meta: Dict) -> Dict:
    # ... existing auth and validation ...
    
    # After authorization, before handler execution
    usage_warning = None
    if not dry_run and control_plane and tenant_uuid:
        try:
            usage_warning = enforce_usage_limit(tenant_uuid, action, control_plane, bindings)
        except UpgradeRequiredError as e:
            _log_audit({
                "tenant_id": tenant_uuid,
                "action": action,
                "result": "denied",
                "error_message": str(e),
            })
            return {
                "ok": False,
                "code": "UPGRADE_REQUIRED",
                "error": e.message,
                "upgrade_url": e.upgrade_url,
                "usage": e.usage,
            }
    
    # ... execute handler ...
    
    # Add warning to response if approaching limit
    response = {
        "ok": True,
        "data": data,
    }
    if usage_warning:
        response["warning"] = usage_warning
    
    return response
```

### 3. Extend Control Plane Adapter (Optional)

If you want usage tracking, add `get_usage()` to your control plane adapter:

```python
class ControlPlaneAdapter:
    # ... existing methods ...
    
    def get_usage(self, tenant_id: str, period_start: Optional[str] = None,
                  period_end: Optional[str] = None) -> UsageResponse:
        """
        Get usage statistics for a tenant
        
        Returns:
            UsageResponse with tier, calls_used, calls_limit, etc.
        """
        raise NotImplementedError
```

See `api-docs-template/backend/control_plane/control_plane_adapter.py` for a complete HTTP implementation.

### 4. Add Onboarding Endpoint (Optional)

Create an onboarding endpoint for self-service registration:

```python
@csrf_exempt
@require_http_methods(["POST"])
def onboard_leadscoring(request):
    """
    POST /api/onboard/leadscoring
    
    Creates tenant in Repo B, Stripe customer, Django API key.
    Returns credentials immediately.
    """
    # 1. Create tenant in Repo B (source of truth)
    # 2. Create Stripe customer via Repo C
    # 3. Create API key
    # 4. Return credentials
    pass
```

See `api-docs-template/backend/control_plane/onboarding_views.py` for a complete Django implementation.

### 5. Add Usage Endpoint (Optional)

Create a usage endpoint for checking statistics:

```python
@csrf_exempt
@require_http_methods(["GET"])
def get_usage(request):
    """
    GET /api/usage
    
    Returns usage statistics for authenticated tenant.
    """
    # Authenticate via API key
    # Query control plane for usage
    # Return usage stats
    pass
```

See `api-docs-template/backend/control_plane/usage_views.py` for a complete Django implementation.

### 6. Include Billable in Audit Logs (Optional)

When logging successful actions, include `billable` from action definition:

```python
audit_entry = {
    "tenant_id": tenant_uuid,
    "action": action,
    "result": "success",
    # ... other fields ...
}

# Add billable and billing_unit from action definition
if action_def:
    audit_entry["billable"] = action_def.billable
    if action_def.billing_unit:
        audit_entry["billing_unit"] = action_def.billing_unit

_log_audit(audit_entry)
```

## Reference Implementation

See `api-docs-template` (Repo A) for a complete working implementation:
- `backend/control_plane/acp/router.py` - Router with usage enforcement
- `backend/control_plane/control_plane_adapter.py` - Control plane adapter with `get_usage()`
- `backend/control_plane/onboarding_views.py` - Onboarding endpoint
- `backend/control_plane/usage_views.py` - Usage endpoint
- `backend/control_plane/acp/types.py` - ActionDef with billable fields

## Architecture Notes

- **Backward Compatible**: All changes are optional and don't break existing code
- **Opt-in**: Usage enforcement only runs if control plane has `get_usage()` method
- **Fail-open**: If usage check fails, request proceeds (resilience)
- **Framework-agnostic**: Core logic works with Django, FastAPI, Express, etc.

## Next Steps

1. Implement Repo B endpoints: `/functions/v1/tenants/create` and `/functions/v1/usage`
2. Implement Repo C Stripe endpoints (or update executor adapter)
3. Add `billable` column to Repo B `audit_logs` table
4. Test end-to-end onboarding and billing flow

See `AGENT-ONBOARDING-PLAN.md` for complete architecture and implementation details.
