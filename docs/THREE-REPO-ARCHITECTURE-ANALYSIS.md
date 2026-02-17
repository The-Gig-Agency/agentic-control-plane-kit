# Three-Repo Architecture: How They Work Together

**Repos:** agentic-control-plane-kit (A), governance-hub (B), key-vault-executor (C)  
**Last Updated:** February 2026

---

## Executive Summary

Three repos form a **separation-of-concerns** architecture:

| Repo | Role | Secrets | Policy | Execution | Audit |
|------|------|---------|--------|-----------|-------|
| **A** (kit) | Execution kernel | ❌ Never | ❌ Asks B | ✅ Executes | ❌ Sends to B |
| **B** (governance-hub) | Policy authority | ❌ Never | ✅ Decides | ❌ Never | ✅ Stores |
| **C** (key-vault-executor) | Key vault + executor | ✅ Stores | ❌ Never | ✅ External APIs | ❌ Never |

**Flow:** Agent → Repo A → [authorize] Repo B → Repo A → [execute] Repo C → External API (Shopify, CIQ, LeadScore)

---

## Repo A: agentic-control-plane-kit

**Purpose:** Embeddable kernel deployed into each SaaS project (CIQ Automations, Leadscore, etc.)

### What It Does
- Exposes `/manage` API for agents
- Validates API keys (local)
- Executes actions via packs (IAM, webhooks, settings, **Shopify**)
- **Calls Repo B** for authorization on write actions
- **Calls Repo C** for external API execution (Shopify, CIQ, LeadScore)
- **Emits audit events** to Repo B
- **Never stores secrets**

### Key Components
- **Router** (`kernel/src/router.ts`) – main request handler, injects `executor` and `controlPlane` into action context
- **ControlPlaneAdapter** (`kernel/src/control-plane-adapter.ts`) – HTTP client for Repo B `/authorize`
- **ExecutorAdapter** (`kernel/src/executor-adapter.ts`) – interface for Repo C; packs call `executor.execute(endpoint, params, tenantId)`
- **Shopify pack** (`packs/shopify/`) – example pack that:
  1. Authorizes write actions via `controlPlane.authorize()` before execution
  2. Executes via `executor.execute()` (Shopify, CIQ, LeadScore)
  3. Emits audit events via `emitAuditEvent()`

### Bindings Required
- `integration` – e.g. `"ciq-automations"` (identifies this kernel to Repo B/C)
- `kernelId` – for Repo B authorization (optional in bindings)
- Tenant, auth, database config

### Adapter Mismatch (Current State)
The kit’s `HttpExecutorAdapter` uses endpoint-style calls:
```
executor.execute('/api/tenants/{tenantId}/shopify/products.list', params, tenantId)
```

Repo C expects a single `POST /functions/v1/execute` with body:
```json
{
  "tenant_id": "...",
  "integration": "shopify",
  "action": "shopify.products.list",
  "params": {},
  "request_hash": "..."
}
```

**Gap:** A Repo C–specific adapter (e.g. `CiaExecutorAdapter`) is needed to map pack calls to Repo C’s API. The key-vault-executor INTEGRATION-GUIDE describes `ciaUrl`, `ciaServiceKey`, `ciaAnonKey` – that adapter is not yet in the kit.

---

## Repo B: governance-hub

**Purpose:** Central policy authority and audit store

### What It Does
- **Authorize** – `POST /functions/v1/authorize` – policy evaluation (<50ms target)
- **Audit ingest** – `POST /functions/v1/audit-ingest` – async audit log ingestion (202 Accepted)
- **Audit query** – `GET /functions/v1/audit-query` – query audit logs
- **Revoke** – `POST /functions/v1/revoke` – emergency revocation
- **Revocations snapshot** – `GET /functions/v1/revocations-snapshot` – fast revocation cache for kernels
- **Heartbeat** – `POST /functions/v1/heartbeat` – kernel registration/health

### Key Concepts
- **Authoritative model:** Kernels ask; platform decides. Policy is not advisory.
- **Decision types:** `allow` | `deny` | `require_approval`
- **params_summary:** Small, sanitized subset for policy (max 4KB) – not full params
- **request_hash:** SHA-256 from Repo A for idempotency and audit linking

### Integration with Repo A
- Repo A passes `ControlPlaneAdapter` (e.g. `HttpControlPlaneAdapter`) with `platformUrl` and `kernelApiKey`
- Shopify pack calls `controlPlane.authorize()` before write actions
- `emitAuditEvent()` sends events to Repo B via `AuditAdapter` – use **HttpAuditAdapter** to POST to `platformUrl/functions/v1/audit-ingest` with same `kernelApiKey` as authorize

### Stack
- React (Lovable) + Vite + Tailwind + shadcn-ui
- Supabase Edge Functions (Deno)
- Supabase Postgres

---

## Repo C: key-vault-executor

**Purpose:** Secure storage of API keys and execution of external API calls

**Naming:** "CIA" in env vars and tables (e.g. `CIA_SERVICE_KEY`, `cia_service_keys`) is historical shorthand for **CIQ Automations**. Repo C was split from that SaaS repo; CIQ Automations is now a tenant that uses Repo C.

### What It Does
- **Stores secrets** in Supabase Vault (tenant → secret mapping in `tenant_integrations`)
- **Executes actions** on Shopify, CIQ, LeadScore via `POST /functions/v1/execute`
- **Authenticates** Repo A instances via service keys (HMAC-SHA-256)
- **Enforces** action allowlist – only executes whitelisted actions
- **Never** makes policy decisions or stores audit logs

### Three Pillars
1. **cia_service_keys** – authenticate Repo A instances (e.g. CIQ Automations, Leadscore)
2. **action_allowlist** – whitelist of allowed actions per integration
3. **tenant_integrations** – map `tenant_id` → `integration` → `secret_name` (Vault ref)

### Execute API
```
POST /functions/v1/execute
Headers: apikey (Supabase anon), Authorization: Bearer <CIA_SERVICE_KEY>
Body: { tenant_id, integration, action, params, request_hash, trace? }
```

### Integration Handlers
- **Shopify** – loads token from Vault, calls Shopify Admin GraphQL
- **CIQ** – loads token, calls Creator IQ API
- **LeadScore** – placeholder

---

## End-to-End Flow (Write Action)

```
1. Agent sends: POST /manage { action: "shopify.products.create", params: {...} }
2. Repo A: Validate API key, scope, rate limit
3. Repo A (Shopify pack): controlPlane.authorize({ kernelId, tenantId, actor, action, request_hash })
4. Repo B: Evaluate policies → { decision: "allow", decision_id }
5. Repo A (Shopify pack): executor.execute(...)  // Calls Repo C
6. Repo C: Validate service key, check allowlist, resolve secret, call Shopify API
7. Repo C: Return sanitized result (no tokens)
8. Repo A: emitAuditEvent() → Repo B audit-ingest
9. Repo B: Store audit log
10. Repo A: Return response to agent
```

---

## Documentation Gaps & Inconsistencies

### 1. Executor Adapter
- **CiaExecutorAdapter** maps pack endpoint calls to Repo C's `/functions/v1/execute`. Config: `ciaUrl`, `ciaServiceKey`, `ciaAnonKey`.

### 2. Audit Path ✅ Resolved
- **HttpAuditAdapter** in `kernel/src/audit-adapter.ts` – POSTs `AuditEvent` to Repo B `platformUrl/functions/v1/audit-ingest`. Config: `platformUrl`, `kernelApiKey`. Note: Repo B uses `supabase.auth.getUser(token)` – `kernelApiKey` must be a valid Supabase JWT.

### 3. Naming: Why "CIA"?
- **CIA** = **CIQ Automations** (historical shorthand). Repo C was split from that SaaS repo; CIQ Automations is now a kernel/tenant that uses Repo C. Env vars retain the prefix; naming is cosmetic.
- Repo B is “Governance Hub” / “Platform”
- Repo A is “Kernel” / “Agent Starter Kit”

### 4. controlplane.bindings.json
- Current `controlplane.bindings.json` has tenant/auth/database but no `integration` – the schema was updated to require it
- `config/bindings.schema.json` now requires `integration`

---

## Quick Reference: Env Vars

### Repo A (per SaaS deployment)
```
MANAGE_BASE_URL=...           # If A is behind a proxy
CIA_URL=https://...supabase.co
CIA_SERVICE_KEY=cia_service_...
CIA_ANON_KEY=...              # Supabase anon (for Repo C)
PLATFORM_URL=https://...supabase.co  # Repo B
KERNEL_API_KEY=...            # For Repo B authorize
KERNEL_ID=ciq-automations-kernel
```

### Repo B
```
HMAC_PEPPER=...
```

### Repo C
```
CIA_SERVICE_KEY_PEPPER=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Summary

The three repos implement a clean separation:

- **Repo A** is the execution kernel – it orchestrates, validates, and delegates.
- **Repo B** is the policy authority – it authorizes and stores audit logs.
- **Repo C** is the key vault and executor – it holds secrets and calls external APIs.

**Completed:** `CiaExecutorAdapter` and `HttpAuditAdapter` are in the kit for Repo C (execute) and Repo B (audit-ingest).
