# Governance Pack

The Governance Pack enables agents to propose policies, limits, and runbooks to Governance Hub (Repo B) for review and approval.

## Overview

This pack provides a **proposal-only** model where:
- ✅ Agents can propose policies via `governance.propose_policy`
- ❌ Agents cannot publish policies (human approval required)
- ✅ All proposals are audited
- ✅ Platform admins review and approve/reject

**Flow:** Agent → `governance.propose_policy` → Repo B `POST /functions/v1/policy-propose` → `policy_proposals` (status=proposed) → Human approves → `policy-publish` → `policy_versions` → enforcement reads from `policy_versions`.

## Actions

### `governance.propose_policy`

Propose a policy, limit, or runbook to Governance Hub for review and approval.

**Scope:** `manage.governance`

**Parameters:**
- `title` (string, max 120 chars) - Short title for the proposal
- `summary` (string, max 300 chars) - Brief summary of the proposal
- `proposal_kind` (string) - Type: `"policy"` | `"limit"` | `"runbook"` | `"revocation_suggestion"`
- `proposal` (object) - The proposal payload:
  - `type` (string) - `"LimitPolicy"` | `"RequireApprovalPolicy"`
  - `data` (object) - Proposal-specific data
- `rationale` (string, max 2000 chars) - Explanation for why this proposal is needed
- `evidence` (object, optional) - Supporting evidence:
  - `audit_event_ids` (string[]) - Audit event IDs that support this proposal
  - `links` (string[]) - URLs to relevant documentation or evidence

**Example:**

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "Prevent weekend deletes",
    "summary": "Block all delete actions on weekends",
    "proposal_kind": "policy",
    "proposal": {
      "type": "RequireApprovalPolicy",
      "data": {
        "action": "domain.*.delete",
        "scope": "tenant",
        "approver_role": "org_admin",
        "message": "Deletes require approval on weekends"
      }
    },
    "rationale": "Prevent accidental data loss during off-hours",
    "evidence": {
      "audit_event_ids": [],
      "links": []
    }
  }
}
```

## Setup

### 1. Add to Router Config

```typescript
import { governancePack } from './packs/governance';
import { HttpControlPlaneAdapter } from './kernel/src/control-plane-adapter';

const controlPlane = new HttpControlPlaneAdapter({
  platformUrl: process.env.GOVERNANCE_HUB_URL || process.env.ACP_BASE_URL!,
  kernelApiKey: process.env.ACP_KERNEL_KEY!,
});

const router = createManageRouter({
  // ... other config
  packs: [iamPack, webhooksPack, settingsPack, governancePack],
  controlPlane,  // Required for governance pack
});
```

### 2. Environment Variables

```bash
GOVERNANCE_HUB_URL=https://your-governance-hub.supabase.co
ACP_KERNEL_KEY=acp_kernel_xxxxx
```

### 3. Bindings Configuration

Ensure `org_id` is available in bindings (or derive from tenant):

```json
{
  "integration": "your-integration",
  "org_id": "org-uuid-here",  // Optional: can be derived from tenant
  // ... other bindings
}
```

## Proposal Types

### LimitPolicy

Defines rate limits or ceilings:

```json
{
  "type": "LimitPolicy",
  "data": {
    "action": "email.send",
    "scope": "tenant|api_key|actor",
    "window_seconds": 3600,
    "max": 100,
    "enforcement": "hard|soft",
    "message": "Optional reason"
  }
}
```

### RequireApprovalPolicy

Requires human approval for specific actions:

```json
{
  "type": "RequireApprovalPolicy",
  "data": {
    "action": "billing.modify",
    "scope": "tenant|org",
    "approver_role": "org_admin",
    "message": "Optional message"
  }
}
```

## Security

| Risk | Mitigation |
|------|------------|
| Agent creates overly permissive proposal | Proposal-only; human must approve before publish |
| Agent gets publish access | Separate agent proposal token; never give admin/publish endpoints |
| Proposal spam | Rate-limit `policy-propose`; size limits (64KB) |
| Malformed or malicious proposal | DSL validation; reject secrets; strict schema |

## Related Documentation

- **Full Documentation:** See `docs/GOVERNANCE-PACK.md`
- **Repo B Integration:** See `governance-hub/docs/REPO-B-AGENT-POLICY-PLAN.md`
- **Policy Conditions DSL:** See `governance-hub/INTEGRATION-GUIDE.md`
