# ACP Alignment Comparison: agentic-control-plane-kit vs api-docs-template

**Date:** February 2026  
**Purpose:** Compare ACP implementations to identify misalignments

---

## Summary

### ✅ Aligned Components

1. **Authorization Logic** - Both repos have the same authorization flow:
   - Write actions (`manage.domain`, `manage.write`) call Repo B `/authorize`
   - Fail-closed if Repo B is unreachable
   - Uses `tenant_uuid` from `ACP_TENANT_ID` or `GOVERNANCE_TENANT_ID`
   - Same scope-based authorization (no keyword checking)

2. **Control Plane Adapter** - Both have:
   - `authorize()` method for Repo B authorization
   - `heartbeat()` method for kernel registration
   - Same error handling and response parsing

3. **Environment Variables** - Both support:
   - `ACP_BASE_URL` (new standard) and `GOVERNANCE_HUB_URL` (legacy)
   - `ACP_TENANT_ID` (new standard) and `GOVERNANCE_TENANT_ID` (legacy)
   - `ACP_KERNEL_KEY` for authentication

4. **Router Structure** - Both have:
   - Same request validation
   - Same pack merging logic
   - Same action registry pattern
   - Same audit logging structure

---

## ❌ Missing in api-docs-template

### 1. Governance Pack (Python Implementation)

**Status:** ❌ **NOT IMPLEMENTED**

**What's Missing:**
- No `governance.propose_policy` action
- No governance pack in `backend/control_plane/packs.py`
- No governance pack handler implementation

**What Exists in Main Repo:**
- TypeScript governance pack: `packs/governance/` (actions, handlers, index, README)
- Documentation: `docs/GOVERNANCE-PACK.md`

**Action Required:**
- Create Python governance pack in `api-docs-template/backend/control_plane/governance_pack.py`
- Add `governance.propose_policy` action definition
- Implement handler that calls Repo B `/functions/v1/policy-propose`
- Register pack in `views.py`

---

### 2. ControlPlaneAdapter.proposePolicy() Method

**Status:** ❌ **NOT IMPLEMENTED**

**What's Missing:**
- `HttpControlPlaneAdapter` in api-docs-template doesn't have `proposePolicy()` method
- No interface for policy proposals

**What Exists in Main Repo:**
- TypeScript `ControlPlaneAdapter` interface has optional `proposePolicy()` method
- `HttpControlPlaneAdapter` implements `proposePolicy()` that calls `/functions/v1/policy-propose`

**Action Required:**
- Add `proposePolicy()` method to `api-docs-template/backend/control_plane/control_plane_adapter.py`
- Method should POST to `{platform_url}/functions/v1/policy-propose`

---

## 📋 Detailed Comparison

### Router Implementation

| Feature | agentic-control-plane-kit | api-docs-template | Status |
|---------|---------------------------|-------------------|--------|
| Authorization check for write actions | ✅ Yes | ✅ Yes | ✅ Aligned |
| Scope-based authorization | ✅ Yes | ✅ Yes | ✅ Aligned |
| Tenant UUID handling | ✅ Yes | ✅ Yes | ✅ Aligned |
| Policy decision tracking | ✅ Yes | ✅ Yes | ✅ Aligned |
| Audit logging | ✅ Yes | ✅ Yes | ✅ Aligned |

### Control Plane Adapter

| Method | agentic-control-plane-kit | api-docs-template | Status |
|--------|---------------------------|-------------------|--------|
| `authorize()` | ✅ Yes | ✅ Yes | ✅ Aligned |
| `heartbeat()` | ✅ Yes | ✅ Yes | ✅ Aligned |
| `proposePolicy()` | ✅ Yes (TypeScript) | ❌ No | ❌ Missing |

### Packs

| Pack | agentic-control-plane-kit | api-docs-template | Status |
|------|---------------------------|-------------------|--------|
| IAM | ✅ Yes (TypeScript) | ❌ No (not needed?) | ⚠️ Different |
| Webhooks | ✅ Yes (TypeScript) | ❌ No (not needed?) | ⚠️ Different |
| Settings | ✅ Yes (TypeScript) | ❌ No (not needed?) | ⚠️ Different |
| Domain (Leadscoring) | ✅ Yes (TypeScript) | ✅ Yes (Python) | ✅ Aligned |
| Governance | ✅ Yes (TypeScript) | ❌ No | ❌ Missing |

---

## 🔧 Required Actions to Align

### Priority 1: Add Governance Pack to api-docs-template

1. **Create governance pack file:**
   ```python
   # backend/control_plane/governance_pack.py
   from control_plane.acp.types import ActionDef, Pack
   
   def handle_propose_policy(params, ctx):
       # Implementation that calls Repo B /functions/v1/policy-propose
       pass
   
   governance_pack = Pack(
       name="governance",
       actions=[
           ActionDef(
               name="governance.propose_policy",
               scope="manage.governance",
               description="Propose a policy to Governance Hub",
               params_schema={...},
               supports_dry_run=True,
           ),
       ],
       handlers={
           "governance.propose_policy": handle_propose_policy,
       },
   )
   ```

2. **Add proposePolicy to ControlPlaneAdapter:**
   ```python
   # backend/control_plane/control_plane_adapter.py
   def proposePolicy(self, request: Dict) -> Dict:
       url = f"{self.platform_url}/functions/v1/policy-propose"
       # POST to Repo B
       pass
   ```

3. **Register pack in views.py:**
   ```python
   from control_plane.governance_pack import governance_pack
   
   _router = create_manage_router(
       # ... existing params ...
       packs=[leadscoring_pack, governance_pack],  # Add governance pack
   )
   ```

---

## 📝 Notes

- The main repo (agentic-control-plane-kit) has the governance pack in **TypeScript only**
- api-docs-template uses **Python/Django**, so needs a Python implementation
- The authorization logic and control plane adapter are already aligned
- Only the governance pack functionality is missing

---

## ✅ Verification Checklist

After implementing the governance pack in api-docs-template:

- [ ] `governance.propose_policy` action is defined
- [ ] Handler calls Repo B `/functions/v1/policy-propose`
- [ ] `ControlPlaneAdapter.proposePolicy()` method exists
- [ ] Governance pack is registered in `views.py`
- [ ] Test proposal submission works end-to-end
- [ ] Audit events are logged for proposals
