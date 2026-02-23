# Three-Repo Canonical Mental Model

**Date:** February 23, 2026  
**Purpose:** Authoritative model for Repo A, B, C roles and responsibilities

---

## Repo Roles (Corrected)

### Repo A — Execution Kernel (ACP kit)
**The obeyer.**

- Stateless execution logic, adapters, packs, and host integration
- **It does not decide policy. It asks and enforces.**
- Receives requests → Asks Repo B → Enforces decision → Calls Repo C if allowed

**Responsibilities:**
- ✅ Execute actions (tools, resources, prompts, sampling)
- ✅ Call Repo B for authorization
- ✅ Enforce authorization decisions
- ✅ Call Repo C for external execution
- ✅ Emit audit events to Repo B
- ❌ Never decides policy
- ❌ Never stores credentials
- ❌ Never makes authorization decisions

### Repo B — Governance Hub
**The policy authority.**

Source of truth for:
- ✅ Tenants / orgs
- ✅ API keys
- ✅ Policies & rules
- ✅ Authorization decisions
- ✅ Audit logs
- ✅ **MCP server configurations** (new)

**Responsibilities:**
- ✅ Evaluate policies
- ✅ Make authorization decisions
- ✅ Store audit logs
- ✅ Manage tenants and API keys
- ✅ Store MCP server configurations (not credentials)
- ❌ Never executes actions
- ❌ Never stores credentials
- ❌ Never touches external APIs

### Repo C — Executor / Key Vault
**The hands + secrets.**

- Performs real-world side effects using stored credentials
- Stores encrypted credentials
- Executes external API calls

**Responsibilities:**
- ✅ Store encrypted credentials
- ✅ Execute external API calls
- ✅ Emit audit events to Repo B
- ❌ Never decides policy
- ❌ Never makes authorization decisions
- ❌ Never evaluates rules

**That distinction is critical — and our implementation has it right.**

---

## The Three Auth Lanes (Final)

### Lane 1 — Human / Admin Auth (UI → Repo B / C)

**Purpose:** Manage tenants, policies, keys, connectors.

- Supabase Auth (or equivalent)
- User session JWT
- Enforced via RLS + roles
- **Never used by agents**

**Repo A is not in this lane.**

**Examples:**
- Admin creates tenant in Repo B
- Admin creates API key in Repo B
- Admin approves policy proposal in Repo B
- Admin views audit logs in Repo B

### Lane 2 — Kernel ↔ Governance (Repo A → Repo B)

**Purpose:** Ask "may I do this?"

**Flow:**
1. Repo A receives a request (agent, gateway, SaaS host)
2. Repo A calls Repo B `/authorize`
3. Repo B:
   - Loads tenant policy
   - Evaluates rules
   - Returns `allow` / `deny` + TTL
4. Repo A enforces the decision

**Auth:**
- Machine-to-machine secret
- Kernel identity registered in Repo B
- Scoped permissions (authorize + audit)

**Repo A is procedural. Repo B is decisional.**

**Examples:**
- Gateway calls Repo B: "May I call tool:amazon.order?"
- Repo B: "allow" (with TTL)
- Gateway enforces: allows the call

### Lane 3 — Execution Auth (Repo A → Repo C → External)

**Purpose:** Safely cause side effects.

**Flow:**
1. Repo A receives `ALLOW` from Repo B
2. Repo A calls Repo C with:
   - `tenant_id`
   - `action`
   - `parameters` (sanitized)
3. Repo C:
   - Validates caller
   - Loads vendor credentials
   - Executes external API call
4. Repo C emits audit event (to Repo B)

**Auth:**
- Internal executor secret
- Tenant context always explicit
- Vendor credentials never leave Repo C

**Examples:**
- Gateway calls Repo C: "Execute amazon.order for tenant X"
- Repo C: Retrieves credentials, calls Amazon API, returns result

---

## Secret Placement (Validated)

| Secret | Held by | Purpose |
|--------|---------|---------|
| Consumer API key | Agent / Client | Identify tenant |
| Kernel secret | Repo A | Call Repo B `/authorize` |
| Executor secret | Repo A | Request execution from Repo C |
| Vendor creds | Repo C | External API calls |
| Supabase service role | Repo B infra only | Never exposed |

**Critical Rules:**
- ✅ Consumer API key → Repo B (lookup tenant)
- ✅ Kernel secret → Repo A (authenticate to Repo B)
- ✅ Executor secret → Repo A (authenticate to Repo C)
- ✅ Vendor credentials → Repo C only (never in Repo A or B)
- ❌ Never expose Supabase service role key

---

## Corrected One-Line Summaries

**Repo A:** "Given a decision, execute safely."

**Repo B:** "Decide what is allowed and record it."

**Repo C:** "Touch the outside world, but never decide."

---

## How Our Implementation Aligns

### MCP Server Registration (Repo B)

**What We Built:**
- `tenant_mcp_servers` table in Repo B
- API endpoints for register/list/update/delete
- Stores server **configuration** (command, args, tool_prefix)

**Why This Is Correct:**
- ✅ Repo B is the "policy authority" - it decides what servers are allowed
- ✅ Server configuration is policy/configuration data, not execution
- ✅ Gateway (Repo A) asks Repo B "what servers can this tenant use?"
- ✅ Repo B never stores credentials (those go to Repo C)

**Auth Lane:** Lane 2 (Kernel ↔ Governance)
- Gateway calls Repo B with API key
- Repo B validates and returns server config
- Gateway uses config to route requests

### Credential Storage (Repo C)

**What We Built:**
- `tenant_credentials` table in Repo C
- AES-256 encrypted credential storage
- API endpoints for store/list/retrieve/delete

**Why This Is Correct:**
- ✅ Repo C is the "hands + secrets" - it holds credentials
- ✅ Credentials are encrypted at rest
- ✅ Gateway (Repo A) asks Repo C "execute this with tenant's credentials"
- ✅ Repo C never decides policy (that's Repo B)

**Auth Lane:** Lane 3 (Execution Auth)
- Gateway calls Repo C with executor secret
- Repo C retrieves credentials, executes, returns result
- Repo C emits audit to Repo B

---

## Complete Flow: MCP Gateway Example

### Step 1: Agent Registers MCP Server

```
Agent → Gateway (Repo A)
  ↓
Gateway → Repo B: POST /functions/v1/mcp-servers/register
  ↓
Repo B: Validates API key → tenant_id
Repo B: Stores server config (NOT credentials)
Repo B: Returns success
  ↓
Gateway → Agent: Success
```

**Auth Lane:** Lane 2 (Kernel ↔ Governance)
- Gateway uses API key to authenticate to Repo B
- Repo B validates and stores configuration

### Step 2: Agent Registers Credentials

```
Agent → Repo C: POST /functions/v1/credentials/store
  ↓
Repo C: Validates API key → tenant_id (via Repo B)
Repo C: Encrypts credentials (AES-256)
Repo C: Stores encrypted credentials
Repo C: Returns credential_id
  ↓
Agent: Receives credential_id
```

**Auth Lane:** Lane 3 (Execution Auth)
- Agent uses API key to authenticate to Repo C
- Repo C validates via Repo B, stores credentials

### Step 3: Agent Uses MCP Server

```
Agent → Gateway (Repo A): tools/call { name: "amazon.order" }
  ↓
Gateway → Repo B: POST /functions/v1/authorize
  ↓
Repo B: Evaluates policies
Repo B: Returns { decision: "allow", decision_ttl_ms: 5000 }
  ↓
Gateway: Caches decision, enforces allow
Gateway → Repo B: GET /functions/v1/mcp-servers/list
  ↓
Repo B: Returns server config for tenant
  ↓
Gateway → Repo C: POST /functions/v1/credentials/retrieve
  ↓
Repo C: Retrieves and decrypts credentials
Repo C: Executes Amazon API call
Repo C → Repo B: Emit audit event
  ↓
Gateway → Agent: Returns result
```

**Auth Lanes:**
- **Lane 2:** Gateway → Repo B (authorization)
- **Lane 3:** Gateway → Repo C (execution)

---

## Why This Supports Both Enterprise + Consumer

### Enterprise SaaS

**Embedded Repo A:**
- SaaS embeds Repo A kernel
- Repo A calls Repo B for authorization
- Repo A calls Repo C for execution
- Governance remains centralized

**Example:** CIQ Automations
- Repo A deployed as `/manage` endpoint
- Calls Repo B for Shopify authorization
- Calls Repo C for Shopify execution
- All policy decisions from Repo B

### Consumer Gateway

**Hosted Repo A:**
- Gateway is hosted Repo A instance
- Same authorization flow (Repo B)
- Same execution flow (Repo C)
- Multi-tenant via API keys

**Example:** MCP Gateway
- Gateway receives MCP requests
- Calls Repo B for authorization
- Calls Repo C for execution
- Same authority, different entry point

**Key Insight:**
- ✅ Policy logic never duplicated
- ✅ Same Repo B authority for all
- ✅ Same Repo C execution for all
- ✅ Different entry points (embedded vs hosted)

---

## Validation Checklist

### Repo A (Execution Kernel)
- ✅ Never decides policy → **Correct:** Always asks Repo B
- ✅ Never stores credentials → **Correct:** Always calls Repo C
- ✅ Enforces decisions → **Correct:** Caches and enforces Repo B decisions
- ✅ Emits audit → **Correct:** Sends audit events to Repo B

### Repo B (Governance Hub)
- ✅ Decides policy → **Correct:** Evaluates policies, returns decisions
- ✅ Stores audit logs → **Correct:** All audit events stored in Repo B
- ✅ Manages tenants → **Correct:** Tenant management in Repo B
- ✅ Stores MCP server config → **Correct:** Configuration is policy data
- ❌ Never executes → **Correct:** Repo B never touches external APIs
- ❌ Never stores credentials → **Correct:** Credentials go to Repo C

### Repo C (Executor / Key Vault)
- ✅ Stores credentials → **Correct:** Encrypted credential storage
- ✅ Executes external APIs → **Correct:** Calls Amazon, Stripe, etc.
- ✅ Emits audit → **Correct:** Sends audit events to Repo B
- ❌ Never decides policy → **Correct:** Repo C never evaluates rules
- ❌ Never makes authorization decisions → **Correct:** Repo B decides

---

## Summary

**Our implementation correctly follows the canonical model:**

1. ✅ **Repo A** asks Repo B, enforces decisions, calls Repo C
2. ✅ **Repo B** decides policy, stores config, never executes
3. ✅ **Repo C** stores secrets, executes, never decides

**Auth lanes are correctly separated:**
- ✅ Lane 1: Human/admin (UI → Repo B/C)
- ✅ Lane 2: Kernel ↔ Governance (Repo A → Repo B)
- ✅ Lane 3: Execution (Repo A → Repo C → External)

**Secret placement is correct:**
- ✅ Consumer API key → Repo B (tenant lookup)
- ✅ Kernel secret → Repo A (auth to Repo B)
- ✅ Executor secret → Repo A (auth to Repo C)
- ✅ Vendor credentials → Repo C only

**This model supports both enterprise and consumer:**
- ✅ Same Repo B authority
- ✅ Same Repo C execution
- ✅ Different entry points (embedded vs hosted)
- ✅ Policy logic never duplicated

---

**Document Version:** 1.0  
**Last Updated:** February 23, 2026  
**Status:** Validated Against Canonical Model
