# Governance Pack: Enabling Agents to Create Policies

**Purpose:** Allow agents (e.g. clawdbot, edge bots) to propose policies, limits, and runbooks via Repo B — **without** giving them authority to publish.  
**Scope:** Implementation guide for Repo A (Agent Starter Kit)  
**Last Updated:** February 2026

**Agents interact with governance only via proposal endpoints. Admins publish. Enforcement reads only published versions.**

---

## Overview

The Governance Pack provides a `governance.propose_policy` action that allows agents to propose policies to Governance Hub (Repo B). The proposal-only model ensures:

- ✅ Agents can propose policies
- ❌ Agents cannot publish policies (human approval required)
- ✅ All proposals are audited
- ✅ Platform admins review and approve/reject

**Flow:** Agent → `governance.propose_policy` → Repo B `POST /functions/v1/policy-propose` → `policy_proposals` (status=proposed) → Human approves → `policy-publish` → `policy_versions` → enforcement reads from `policy_versions`.

---

## Proposal Envelope DSL

Every proposal must conform to:

```json
{
  "org_id": "uuid",
  "title": "string",
  "summary": "string",
  "proposal_kind": "policy|limit|runbook|revocation_suggestion",
  "proposal_spec_version": 1,
  "proposal": { "type": "LimitPolicy" | "RequireApprovalPolicy", "data": { } },
  "rationale": "string",
  "evidence": { "audit_event_ids": [], "links": [] },
  "author_type": "agent",
  "author_id": "string"
}
```

### MVP Proposal Types

**LimitPolicy:**
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

**RequireApprovalPolicy:**
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

### Validation Rules
- `title` max 120 chars; `summary` max 300; `rationale` max 2000
- `action` matches `^[a-z0-9_.-]+$`
- `window_seconds` 60–604800; `max` 1–1_000_000
- Reject payloads containing likely secrets (API keys, JWTs)

---

## Policy Conditions DSL

Agent proposals must output the **Policy Conditions DSL** only inside the proposal payload; the proposal is not executed until published. This schema applies to the `conditions` field of published policies.

### DSL Reference

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `action` | `string` \| `string[]` \| `{ $contains: string }` | Action pattern(s). Wildcard `*` = any segment. | `"domain.*.delete"`, `["shopify.products.create", "shopify.products.update"]`, `{ "$contains": "delete" }` |
| `tenantId` | `string` \| `string[]` | Restrict to tenant(s) | `"uuid"` or `["uuid1", "uuid2"]` |
| `actorType` | `'api_key'` \| `'user'` \| `'agent'` | Restrict by actor type | `"api_key"` |
| `timeWindow` | `object` | Restrict by time | See below |
| `amountCeiling` | `object` | Max value for a params_summary field | `{ "field": "count", "max": 10 }` |
| `requireApproval` | `boolean` | If effect=allow, require human approval | `true` |

**timeWindow:**
```json
{
  "daysOfWeek": [1, 2, 3, 4, 5],
  "hours": [9, 17],
  "timezone": "America/New_York"
}
```
- `daysOfWeek`: 0=Sun … 6=Sat
- `hours`: `[start, end)` in 24h

**Operator-style:**
```json
{ "action": { "$contains": "delete" } }
```
- `$contains` — action string contains substring (e.g. any delete action)

---

## Usage

### 1. Add Governance Pack to Router

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

### 4. Agent Usage

Agents can propose policies via the `/manage` endpoint:

```bash
curl -X POST https://your-app.com/api/manage \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

---

## Implementation Details

### Action: `governance.propose_policy`

- **Scope:** `manage.governance`
- **Params:** 
  - `title` (string, max 120 chars)
  - `summary` (string, max 300 chars)
  - `proposal_kind` ("policy" | "limit" | "runbook" | "revocation_suggestion")
  - `proposal` (LimitPolicy | RequireApprovalPolicy)
  - `rationale` (string, max 2000 chars)
  - `evidence` (optional, object with `audit_event_ids` and `links`)
- **Handler:** Calls Repo B `POST /functions/v1/policy-propose`

### ControlPlaneAdapter Extension

The `HttpControlPlaneAdapter` includes a `proposePolicy` method that forwards proposals to Repo B:

```typescript
await controlPlane.proposePolicy({
  org_id: bindings.org_id || deriveFromTenant(tenantId),
  title: params.title,
  summary: params.summary,
  proposal_kind: params.proposal_kind,
  proposal: params.proposal,
  rationale: params.rationale,
  evidence: params.evidence || {},
  author_type: 'agent',
  author_id: ctx.apiKeyId,
});
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Agent creates overly permissive proposal | Proposal-only; human must approve before publish |
| Agent gets publish access | Separate agent proposal token; never give admin/publish endpoints |
| Proposal spam | Rate-limit `policy-propose`; size limits (64KB) |
| Malformed or malicious proposal | DSL validation; reject secrets; strict schema |

---

## Related Documentation

- **Repo B Integration:** See `governance-hub/docs/REPO-B-AGENT-POLICY-PLAN.md`
- **Policy Conditions DSL:** See `governance-hub/INTEGRATION-GUIDE.md`
- **Architecture:** See `docs/THREE-REPO-ARCHITECTURE-ANALYSIS.md`

---

## Summary

- **Proposal-only model:** Agents propose; humans approve and publish. No direct policy creation by agents.
- **Governance Pack:** Provides `governance.propose_policy` action that forwards to Repo B.
- **Scope:** `manage.governance` - requires API key with governance scope.
- **Enforcement boundary:** Repo A forwards proposals; Repo B stores, approves, and enforces.

This keeps Repo B as the sole governance authority and prevents recursive privilege escalation.
