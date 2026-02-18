"""
Optional usage tracking and billing extensions for ACP router

This module provides optional usage limit enforcement and billing support.
Import and use these utilities if you need usage-based billing or free tier limits.

Usage:
    from acp.usage import enforce_usage_limit, UsageResponse, UpgradeRequiredError
    
    # In your router, after authorization but before handler execution:
    if not dry_run and control_plane:
        try:
            enforce_usage_limit(tenant_uuid, action, control_plane, bindings)
        except UpgradeRequiredError as e:
            return {
                "ok": False,
                "code": "UPGRADE_REQUIRED",
                "error": e.message,
                "upgrade_url": e.upgrade_url,
                "usage": e.usage,
            }
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class UsageResponse:
    """Response from usage query"""
    tenant_id: str
    tier: str  # 'free' | 'paid'
    calls_used: int
    calls_limit: int  # 100 for free tier, unlimited (or high number) for paid
    period_start: str  # ISO timestamp
    period_end: str  # ISO timestamp
    calls_remaining: Optional[int] = None  # Calculated: calls_limit - calls_used
    
    def __post_init__(self):
        if self.calls_remaining is None:
            self.calls_remaining = max(0, self.calls_limit - self.calls_used)


class UpgradeRequiredError(Exception):
    """Raised when free tier limit is reached and upgrade is required"""
    def __init__(self, message: str, usage: UsageResponse, upgrade_url: str):
        self.message = message
        self.usage = usage
        self.upgrade_url = upgrade_url
        super().__init__(self.message)


def enforce_usage_limit(
    tenant_uuid: str,
    action: str,
    control_plane: Any,
    bindings: Dict[str, Any],
    free_tier_limit: int = 100,
    warning_threshold: int = 90
) -> Optional[Dict[str, Any]]:
    """
    Check usage before executing action.
    Returns warning dict if approaching limit, raises UpgradeRequiredError if limit reached.
    
    Args:
        tenant_uuid: Tenant UUID
        action: Action name
        control_plane: Control plane adapter with get_usage() method
        bindings: Router bindings (for kernel_id, etc.)
        free_tier_limit: Free tier call limit (default: 100)
        warning_threshold: Threshold for warning (default: 90)
    
    Returns:
        Warning dict if approaching limit, None otherwise
    
    Raises:
        UpgradeRequiredError: If free tier limit is reached
    """
    if not tenant_uuid or not control_plane:
        return None  # Skip if no tenant or control plane
    
    # Check if control_plane has get_usage method (optional feature)
    if not hasattr(control_plane, 'get_usage'):
        return None  # Usage tracking not available
    
    try:
        # Query Repo B for usage (current month)
        now = datetime.now(timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        period_end = now.isoformat()
        
        usage = control_plane.get_usage(
            tenant_id=tenant_uuid,
            period_start=period_start,
            period_end=period_end
        )
        
        # Check if free tier and limit reached
        if usage.tier == "free" and usage.calls_used >= usage.calls_limit:
            # Generate upgrade URL
            upgrade_url = f"/api/upgrade/checkout?tenant={tenant_uuid}"
            raise UpgradeRequiredError(
                message=f"Free tier limit reached ({usage.calls_limit} calls). Add a payment method to continue.",
                usage=usage,
                upgrade_url=upgrade_url
            )
        
        # Check if approaching limit (warning threshold)
        if usage.tier == "free" and usage.calls_used >= warning_threshold:
            calls_remaining = usage.calls_limit - usage.calls_used
            upgrade_url = f"/api/upgrade/checkout?tenant={tenant_uuid}"
            return {
                "message": f"You have {calls_remaining} free calls remaining. Add a payment method to continue after {usage.calls_limit} calls.",
                "upgrade_url": upgrade_url,
                "usage": {
                    "calls_used": usage.calls_used,
                    "calls_limit": usage.calls_limit,
                    "calls_remaining": calls_remaining,
                    "tier": usage.tier
                }
            }
        
        return None  # No warning needed
    except UpgradeRequiredError:
        raise  # Re-raise upgrade required errors
    except Exception as e:
        # If usage check fails, log but don't block (fail open for resilience)
        print(f"[USAGE] Usage check failed: {e}, allowing request to proceed")
        return None
