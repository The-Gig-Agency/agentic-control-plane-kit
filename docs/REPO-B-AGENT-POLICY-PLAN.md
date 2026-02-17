# Repo B (Governance Hub): Enabling Agents to Create Policies & Limits

**Purpose:** Plan for allowing agents (e.g. clawdbot, edge bots) to propose policies, limits, and runbooks via Repo B — **without** giving them authority to publish.  
**Scope:** Planning only — no implementation.  
**Last Updated:** February 2026

**Primary reference:** `governance-hub-agentification.md` (proposal-only design). Copy from `~/Downloads/governance-hub-agentification.md` into repo docs if needed.

**Agents interact with governance only via proposal endpoints. Admins publish. Enforcement reads only published versions.**

---

## Recommended Approach: Proposal-Only (from governance-hub-agentification.md)

**Agents can propose, never publish.** Human approval required for all policy changes.

| Invariant | Meaning |
|-----------|---------|
| Agent write access | `policy_proposals` insert only |
| Agent NO access | `policy_versions`, `revocations`, `kernel_keys`, org membership |
| Publishing | Only org admins can approve/reject/publish |
| Audit | Every status transition → `policy_change_events` |

**Flow:** Agent → `governance.propose_policy` → Repo B `POST /functions/v1/policy-propose` → `policy_proposals` (status=proposed) → Human approves → `policy-publish` → `policy_versions` → enforcement reads from `policy_versions`.

---

## Proposal Envelope DSL (governance-hub-agentification.md)

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

## Policy Conditions DSL (existing policies table)

Agent proposals must output the **Policy Conditions DSL** only inside the proposal payload; the proposal is not executed until published. This schema applies to the `conditions` field of published policies.

### DSL Reference (from INTEGRATION-GUIDE + policy-engine)

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

**Operator-style (INTEGRATION-GUIDE):**
```json
{ "action": { "$contains": "delete" } }
```
- `$contains` — action string contains substring (e.g. any delete action)

**Implementation note:** The authorize Edge Function currently uses simplified matching (`action` exact or `*`). The lib/policy-engine supports wildcards, timeWindow, amountCeiling. Align authorize with policy-engine (or vice versa) before agent-proposed policies go live.

### Validation for Proposals (when DSL is used in proposal payload)

- **Required:** `conditions` must be valid JSON, max 4KB (same as params_summary)
- **Schema check:** Reject unknown top-level keys; validate operator names (`$contains` only for now)
- **Templates:** Provide agent-facing templates (e.g. "business_hours_only", "deny_deletes") to reduce invalid DSL

---

## Current State

### Repo B Today
- **Policies** stored in `policies` table (organization_id, kernel_id, tenant_id, effect, conditions, priority, enabled)
- **Policy conditions** (JSONB): Uses DSL above — action patterns, tenantId, actorType, timeWindow, amountCeiling, requireApproval
- **Creation path:** Human users via React UI (Policies.tsx) → Supabase client → `policies` table
- **Evaluation path:** Repo A `/authorize` → Repo B `POST /functions/v1/authorize` → (simplified inline logic; lib/policy-engine has full DSL support)

### Repo A (Kernel) Today
- **Rate limits, ceilings:** Implemented via adapters (RateLimitAdapter, CeilingsAdapter) — host app provides these; not stored in Repo B
- **Policy decisions:** Repo A asks Repo B; Repo B is authoritative

### Gap
- No API for agents to create or modify policies
- No API for agents to set limits (rate limits, ceilings) — those live in Repo A adapters, not Repo B
- Agents can only *use* the /manage API; they cannot *configure* governance

---

## Goals

1. **Agent-created policies** — Agent can create allow/deny policies for its tenant (e.g. "deny domain.leadscoring.questions.upsert_bulk outside business hours")
2. **Agent-set limits** — Agent can define rate limits, ceilings, or similar constraints (where those are stored)
3. **Scoped & secure** — Agent can only affect its own tenant/org; all changes audited
4. **Human override** — Platform admins can review, approve, or revoke agent-created policies

---

## Design Decisions

### 1. Where Do Proposals Live? (Proposal-Only Model)
**Recommendation:** New tables `policy_proposals`, `policy_versions`, `policy_change_events`. Enforcement reads from `policy_versions` (or existing `policies`); proposals never directly affect enforcement until published by admin.

**Rationale:** Separation prevents agents from escalating privilege. Human approval is mandatory.

### 2. How Does the Agent Call Repo B?
**Recommended (governance-hub-agentification.md):**
- Repo B: `POST /functions/v1/policy-propose` — agent (or human) submits proposal
- Repo A: Add **Governance Pack** with `governance.propose_policy` action that forwards to Repo B
- Agent token: Separate "agent proposal token" with scope only for `policy-propose` (and optionally `policy-simulate` read-only)
- Do NOT give agent: admin tokens, service-role keys, publish/approve endpoints

### 3. What Can Agents Do?
**Proposal-only (MVP):**
- Propose policy/limit/runbook via `governance.propose_policy` → Repo B `policy-propose`
- Read proposals (optional `policy-simulate` for preview)

**Agents cannot:** approve, reject, publish, or directly modify `policies` or `policy_versions`.

**Limits (separate design decision):** Rate limits and ceilings today live in Repo A adapters (DB or config), not in Repo B. Phase 2 would decide:
  - **2a.** Store limit config in Repo B (new table `tenant_limits`); Repo A fetches on startup or per-request. Repo B becomes source of truth for limits.
  - **2b.** Keep limits in Repo A; add Repo A `/manage` actions like `meta.limits.set` that update local config/DB. Repo B not involved.

**Recommendation:** Phase 1 first. For Phase 2, prefer **2a** if you want a single governance plane; **2b** if limits are tightly coupled to the kernel and you want to avoid Repo B complexity.

### 4. Authorization: Who Can Create Policies?
- **Actor:** The agent acts on behalf of a tenant, using an API key (or user token).
- **Rule:** Only tenant admins (or API keys with `manage.policies` scope) can create policies for that tenant.
- **Implementation:** Repo A validates scope before calling Repo B. Repo B trusts Repo A's `tenantId` and `actor`; optionally Repo B checks that the kernel is allowed to manage policies for that tenant (e.g. `kernels` table has `can_manage_policies` or similar).

### 5. Human-in-the-Loop (Proposal-Only)
- **Proposals from agents** remain in `status: proposed` until a human approves.
- **Approval flow:** Use existing `approvals` table pattern; add `policy_approvals` or extend approvals.
- **Override:** Platform admin can disable agent proposals or set org-level "require approval for agent proposals."

---

## Proposed Architecture (Proposal-Only)

### New Repo B Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/functions/v1/policy-propose` | POST | Agent proposal token OR user session | Submit proposal (insert `policy_proposals`) |
| `/functions/v1/policy-approve` | POST | Org admin only | Approve proposal |
| `/functions/v1/policy-reject` | POST | Org admin only | Reject proposal |
| `/functions/v1/policy-publish` | POST | Org admin only | Publish approved → `policy_versions` |
| `/functions/v1/policy-simulate` | GET | Read-only | Preview proposal effect (optional) |

**Agent token:** Minimal scope — only `policy-propose` (and optionally `policy-simulate`). Never admin or publish.

### New Repo A: Governance Pack (not meta pack)

**Folder:** `packs/governance/`

| Action | Scope | Calls Repo B |
|--------|-------|--------------|
| `governance.propose_policy` | `manage.governance` | POST /functions/v1/policy-propose |

**Handler:** Forwards proposal envelope to Repo B. Repo A never stores or activates policies.

### Schema Changes (Repo B) — from governance-hub-agentification.md

**New tables:**
- `policy_proposals` — id, org_id, status (proposed|approved|rejected|published|superseded), title, summary, proposal_kind, proposal_spec_version, proposal (JSONB), rationale, evidence, author_type, author_id
- `policy_versions` — id, org_id, policy_id, version, policy_json, created_by, proposal_id (links to proposal)
- `policy_change_events` — id, org_id, proposal_id, event_type (proposed|approved|rejected|published|rollback|comment), actor_type, actor_id, event_json

**Enforcement:** Reads from `policy_versions` (or existing `policies`); never reads proposals directly.

---

## Implementation Phases

### Phase 1: Proposal-Only governance (MVP)
- Add proposal tables: `policy_proposals`, `policy_versions`, `policy_change_events`
- Add proposal endpoints: `POST /functions/v1/policy-propose` (agent), `policy-approve`, `policy-reject`, `policy-publish` (admin only)
- Add UI: Proposals Inbox, Proposal Detail view, admin-only Approve/Reject/Publish
- Add Repo A **Governance Pack** with `governance.propose_policy`

**Do NOT modify enforcement logic yet** — enforcement reads from `policy_versions` (or existing `policies`).

---

## Agent Starter Kit Pack Changes (Governance Pack)

Add a **Governance Pack** (not meta pack) so agents can propose policies via `/manage`.

### 1. New pack: `packs/governance/`

```
packs/governance/
  actions.ts    # governance.propose_policy definition
  handlers.ts   # handleProposePolicy
  schema.ts    # proposal envelope types (optional)
  index.ts     # export governancePack
```

### 2. Action: `governance.propose_policy`

- **Scope:** `manage.governance`
- **Params:** title, summary, proposal (typed: LimitPolicy | RequireApprovalPolicy), rationale
- **Handler:** Calls `ctx.controlPlane.request("/functions/v1/policy-propose", { method: "POST", body: { org_id, author_type: "agent", author_id: ctx.actor.id, ...params } })`

### 3. ControlPlaneAdapter extension

Add optional `request(path, opts)` method to ControlPlaneAdapter for generic Repo B calls, OR add `proposePolicy(params)` that POSTs to `/functions/v1/policy-propose`.

### 4. Router config

- Include `governancePack` in packs array
- ControlPlaneAdapter must be configured (platformUrl, kernelApiKey)
- Bindings must include `org_id` (or derive from tenant) for proposal scoping

### 5. Host app wiring

- Pass `controlPlane` with `platformUrl` + `kernelApiKey` (agent proposal token, NOT admin token)
- Ensure `org_id` available in bindings for proposal envelope

### 6. Enforcement boundary

- Repo A: exposes `governance.propose_policy`, forwards to Repo B, never stores or activates
- Repo B: stores proposals, enforces approval workflow, publishes to `policy_versions`, enforces policies

---

### Phase 2: Limits (separate design decision)
Limits are not policies today — they live in Repo A adapters. Phase 2 is a separate design decision:
- **Option A:** Store limit config in Repo B (`tenant_limits`); Repo A fetches on startup
- **Option B:** Keep limits in Repo A; add `meta.limits.set` / `meta.limits.list` that update local config

---

## Alternative (Not recommended initially): Direct Policy CRUD by agents

If you allowed agents to directly create/update/delete policies (e.g. `meta.policies.create`, `meta.policies.update`, `meta.policies.delete`, `meta.policies.list` calling Repo B `POST /policies`, etc.):

- **Warning:** This contradicts proposal-only. It is only safe if you require human approval anyway — which effectively becomes the proposal workflow again.
- **Recommendation:** Use proposal-only (Phase 1) instead. If you later need direct CRUD, add it as an explicit alternative with strict approval gates.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Agent creates overly permissive proposal | Proposal-only; human must approve before publish |
| Agent gets publish access | Separate agent proposal token; never give admin/publish endpoints |
| Proposal spam | Rate-limit `policy-propose`; size limits (64KB) |
| Malformed or malicious proposal | DSL validation; reject secrets; strict schema |

---

## Open Questions

1. **Scope naming:** Use `manage.governance` for proposal capability?
2. **Proposal → policy mapping:** When admin publishes, how does `LimitPolicy` / `RequireApprovalPolicy` map to existing `policies` table or `policy_versions`?
3. **Agent token:** How to issue "agent proposal token" — new kernel key type, or scope on existing API key?
4. **SaaS Agentification skill:** Update so agent knows `governance.propose_policy` and proposal envelope DSL.
5. **UI naming:** "Suggested Policies", "Policy PRs", or "Governance Inbox" (from governance-hub-agentification.md)?

---

## Summary

- **Primary design:** `governance-hub-agentification.md` — **proposal-only**. Agents propose; humans approve and publish. No direct policy creation by agents.
- **Proposal envelope DSL:** title, summary, proposal_kind, proposal (LimitPolicy | RequireApprovalPolicy), rationale, evidence. Strict validation.
- **Repo B:** New tables `policy_proposals`, `policy_versions`, `policy_change_events`. Endpoints: `policy-propose` (agent), `policy-approve/reject/publish` (admin only).
- **Repo A:** Add **Governance Pack** with `governance.propose_policy` — forwards to Repo B. Scope `manage.governance`. Agent token has minimal scope (propose only).
- **Policy Conditions DSL** (existing): Still applies to published policies; proposal types (LimitPolicy, RequireApprovalPolicy) map to enforcement format when published.

This keeps Repo B as the sole governance authority and prevents recursive privilege escalation.
