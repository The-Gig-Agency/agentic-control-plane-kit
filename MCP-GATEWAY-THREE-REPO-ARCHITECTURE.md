# MCP Gateway: Three-Repo Architecture

**Date:** February 2026  
**Purpose:** How Repo A, Repo B, and Repo C work together to provide the Echelon MCP Gateway service

---

## Executive Summary

The **Echelon MCP Gateway** is a registered kernel that provides universal governance for the Model Context Protocol (MCP) ecosystem. It is built using the **three-repo architecture** where each repository has a distinct responsibility:

| Repo | Name | Role in MCP Gateway |
|------|------|---------------------|
| **A** | `agentic-control-plane-kit` | Gateway implementation (kernel) |
| **B** | `governance-hub` | Authorization & audit (policy authority) |
| **C** | `key-vault-executor` | External API execution (future: Executor MCP) |

**Flow:**
```
Agent → MCP Gateway (Repo A) → [authorize] Repo B → Gateway → MCP Server → External APIs
```

---

## Repository Responsibilities

### Repo A: agentic-control-plane-kit (Gateway Implementation)

**What It Provides:**
- ✅ Complete MCP Gateway implementation (`gateway/` directory)
- ✅ MCP protocol handling (JSON-RPC 2.0 over stdio)
- ✅ Process management for downstream MCP servers
- ✅ Authorization integration with Repo B
- ✅ Audit event emission to Repo B
- ✅ Agent discovery protocol
- ✅ Comprehensive error handling

**Key Components:**
- `gateway/server.ts` - Main entry point, registers as kernel
- `gateway/proxy.ts` - MCP protocol proxy
- `gateway/policy.ts` - Authorization enforcement (calls Repo B)
- `gateway/audit.ts` - Audit emission (calls Repo B)
- `gateway/process-manager.ts` - Manages MCP server processes
- `gateway/discovery.ts` - Agent discovery and registration

**What It Does NOT Do:**
- ❌ Store external service credentials
- ❌ Make policy decisions (delegates to Repo B)
- ❌ Store audit logs (sends to Repo B)
- ❌ Execute external APIs directly (future: forwards to Repo C)

---

### Repo B: governance-hub (Policy Authority)

**What It Provides:**
- ✅ Authorization endpoint (`/functions/v1/authorize`)
- ✅ Audit ingestion endpoint (`/functions/v1/audit-ingest`)
- ✅ Kernel heartbeat/registration (`/functions/v1/heartbeat`)
- ✅ Policy evaluation engine
- ✅ Audit log storage
- ✅ Tenant management

**How Gateway Uses It:**

1. **Kernel Registration:**
   ```
   Gateway → POST /functions/v1/heartbeat
   {
     kernel_id: "mcp-gateway",
     version: "1.0.0",
     packs: ["mcp-governance"],
     env: "production"
   }
   ```

2. **Authorization (Every MCP Operation):**
   ```
   Gateway → POST /functions/v1/authorize
   {
     kernelId: "mcp-gateway",
     tenantId: "...",
     actor: { type: "system", id: "mcp-gateway" },
     action: "tool:fs.read_file",
     request_hash: "...",
     params_summary: {...},
     params_summary_schema_id: "mcp-v1"
   }
   
   Repo B → { decision: "allow" | "deny", decision_id: "...", ... }
   ```

3. **Audit Events (All Operations):**
   ```
   Gateway → POST /functions/v1/audit-ingest
   {
     event_id: "...",
     tenant_id: "...",
     integration: "mcp-gateway",
     pack: "mcp",
     action: "tool:fs.read_file",
     status: "success" | "denied",
     policy_decision_id: "...",
     ...
   }
   ```

**What It Does NOT Do:**
- ❌ Execute MCP operations
- ❌ Store MCP server credentials
- ❌ Manage MCP server processes

---

### Repo C: key-vault-executor (External API Execution)

**Current Role (Phase 1):**
- ⚠️ **No direct integration** with MCP Gateway in Phase 1
- Gateway does not call Repo C directly
- Maintains clean separation: Gateway = governance, Repo C = execution

**Future Role (Phase 2):**
- ✅ **Executor MCP Server** - Repo C could implement an MCP server
- Gateway forwards authorized requests to Executor MCP
- Executor MCP handles credential storage and external API execution
- Preserves separation: Gateway enforces governance, Executor executes

**What It Could Provide (Phase 2):**
- MCP server implementation in Repo C
- Credential storage for external services (Amazon, Stripe, Shopify, etc.)
- External API execution with governance enforcement
- Secure credential management

**What It Does NOT Do (Phase 1):**
- ❌ Receive requests from MCP Gateway
- ❌ Store MCP server credentials (gateway manages MCP servers directly)

---

## Complete Flow: How They Work Together

### Example: Agent Calls MCP Tool

```
┌─────────┐
│  Agent  │
└────┬────┘
     │ 1. tools/call { name: "fs.read_file", arguments: {...} }
     ▼
┌─────────────────────────────────────┐
│  MCP Gateway (Repo A)               │
│  - Receives MCP request             │
│  - Extracts tenant ID               │
│  - Prepares authorization request   │
└────┬────────────────────────────────┘
     │ 2. authorize({ action: "tool:fs.read_file", ... })
     ▼
┌─────────────────────────────────────┐
│  Governance Hub (Repo B)            │
│  - Evaluates policies               │
│  - Checks rate limits               │
│  - Returns decision              │
└────┬────────────────────────────────┘
     │ 3. { decision: "allow", decision_id: "dec-123", ... }
     ▼
┌─────────────────────────────────────┐
│  MCP Gateway (Repo A)               │
│  - Caches decision (if allowed)     │
│  - Emits audit event                │
│  - Forwards to MCP server           │
└────┬────────────────────────────────┘
     │ 4. tools/call { name: "read_file", ... }
     ▼
┌─────────────────────────────────────┐
│  MCP Server (Filesystem)            │
│  - Executes tool                    │
│  - Returns result                    │
└────┬────────────────────────────────┘
     │ 5. { content: [{ type: "text", text: "..." }] }
     ▼
┌─────────────────────────────────────┐
│  MCP Gateway (Repo A)               │
│  - Returns result to agent          │
│  - Emits audit event (success)       │
└────┬────────────────────────────────┘
     │ 6. audit event
     ▼
┌─────────────────────────────────────┐
│  Governance Hub (Repo B)            │
│  - Stores audit log                  │
│  - Updates usage metrics             │
└─────────────────────────────────────┘
```

### Authorization Flow (Detailed)

**Step 1: Gateway Prepares Request**
```typescript
// gateway/policy.ts
const authRequest = {
  kernelId: "mcp-gateway",
  tenantId: extractTenantId(),
  actor: { type: "system", id: "mcp-gateway" },
  action: "tool:fs.read_file",
  request_hash: hashParams(arguments),
  params_summary: sanitizeParams(arguments),
  params_summary_schema_id: "mcp-v1"
};
```

**Step 2: Gateway Calls Repo B**
```typescript
// Uses ControlPlaneAdapter from kernel
const decision = await controlPlane.authorize(authRequest);
// POST https://governance-hub.supabase.co/functions/v1/authorize
```

**Step 3: Repo B Evaluates Policies**
- Checks policies for `tool:fs.read_file`
- Evaluates rate limits
- Checks approval requirements
- Returns decision

**Step 4: Gateway Enforces Decision**
```typescript
if (decision.decision === 'deny') {
  throw new AuthorizationError(decision.reason);
}
// Cache if allowed
if (decision.decision === 'allow' && decision.decision_ttl_ms) {
  await cache.set(cacheKey, decision, decision.decision_ttl_ms);
}
```

### Audit Flow (Detailed)

**Step 1: Gateway Creates Audit Event**
```typescript
// gateway/audit.ts
const event = {
  event_id: crypto.randomUUID(),
  tenant_id: tenantId,
  integration: "mcp-gateway",
  pack: "mcp",
  action: "tool:fs.read_file",
  status: decision.decision === 'allow' ? 'success' : 'denied',
  policy_decision_id: decision.decision_id,
  ...
};
```

**Step 2: Gateway Emits to Repo B**
```typescript
// Uses HttpAuditAdapter from kernel
await auditAdapter.logEvent(event);
// POST https://governance-hub.supabase.co/functions/v1/audit-ingest
```

**Step 3: Repo B Stores Audit Log**
- Stores in `audit_logs` table
- Updates usage metrics
- Available for compliance and analytics

---

## Data Flow Summary

### Authorization Data Flow

```
Agent Request
    ↓
Gateway (Repo A)
    ├─> Extract tenant ID
    ├─> Prepare authorization request
    └─> Call Repo B /authorize
         ↓
    Governance Hub (Repo B)
    ├─> Evaluate policies
    ├─> Check rate limits
    └─> Return decision
         ↓
    Gateway (Repo A)
    ├─> Cache decision (if allowed)
    ├─> Enforce decision
    └─> Forward to MCP server (if allowed)
```

### Audit Data Flow

```
MCP Operation
    ↓
Gateway (Repo A)
    ├─> Create audit event
    ├─> Include decision metadata
    └─> Emit to Repo B /audit-ingest
         ↓
    Governance Hub (Repo B)
    ├─> Store in audit_logs
    ├─> Update metrics
    └─> Available for compliance
```

### Future: Execution Data Flow (Phase 2)

```
Authorized Request
    ↓
Gateway (Repo A)
    ├─> Forward to Executor MCP
    └─> Call Repo C MCP server
         ↓
    Executor MCP (Repo C)
    ├─> Validate credentials
    ├─> Execute external API
    └─> Return sanitized result
         ↓
    Gateway (Repo A)
    └─> Return to agent
```

---

## Environment Variables & Configuration

### Repo A (Gateway)

**Required:**
```bash
ACP_BASE_URL=https://governance-hub.supabase.co  # Repo B URL
ACP_KERNEL_KEY=acp_kernel_xxxxx                  # Repo B API key
ACP_TENANT_ID=be1b7614-...                       # Tenant UUID from Repo B
```

**Optional:**
```bash
ENVIRONMENT=production
LOG_LEVEL=info
```

### Repo B (Governance Hub)

**No changes required** - Gateway uses existing endpoints:
- `/functions/v1/authorize` (already exists)
- `/functions/v1/audit-ingest` (already exists)
- `/functions/v1/heartbeat` (already exists)

### Repo C (Key Vault Executor)

**No integration in Phase 1** - Gateway does not call Repo C

**Future (Phase 2):**
```bash
# If Repo C implements MCP server
EXECUTOR_MCP_URL=...
EXECUTOR_MCP_KEY=...
```

---

## Security Model

### Credential Separation

**Critical:** Each repo has distinct responsibilities:

- **Repo A (Gateway):** Never stores external credentials
- **Repo B (Governance Hub):** Never stores external credentials
- **Repo C (Key Vault Executor):** Stores external service credentials

**Gateway Credentials:**
- Gateway uses `ACP_KERNEL_KEY` to authenticate with Repo B
- Gateway does NOT store MCP server credentials (managed separately)
- Gateway does NOT store external API credentials (future: Repo C)

### Authorization Model

**Fail-Closed:**
- If Repo B is unavailable → Gateway denies all requests
- If authorization fails → Gateway denies request
- Security > Availability

**Audit Model:**
- All operations are audited (allowed and denied)
- Audit events sent to Repo B (best-effort, non-blocking)
- Repo B stores all audit logs for compliance

---

## Integration Points

### Repo A → Repo B

**Endpoints Used:**
1. `POST /functions/v1/heartbeat` - Kernel registration
2. `POST /functions/v1/authorize` - Authorization requests
3. `POST /functions/v1/audit-ingest` - Audit event emission

**Authentication:**
- Uses `ACP_KERNEL_KEY` (Supabase JWT token)
- Set in Gateway environment variables

**Data Format:**
- Authorization: `AuthorizationRequest` / `AuthorizationResponse`
- Audit: `AuditEvent` (standard kernel format)

### Repo A → Repo C

**Current:** No integration (Phase 1)

**Future (Phase 2):**
- Gateway forwards authorized requests to Executor MCP
- Executor MCP handles credential storage and execution
- Maintains clean separation

### Repo B → Repo C

**Current:** No direct integration

**Future:** Repo B could query Repo C for credential status, but not required

---

## Deployment Architecture

### Gateway Deployment

**Single Instance Per Tenant (Phase 1):**
- One gateway instance = one tenant
- `ACP_TENANT_ID` set per instance
- Simple deployment model

**Multi-Tenant (Phase 2):**
- One gateway instance = multiple tenants
- API key handshake for tenant identification
- More complex but scalable

### Repo B Deployment

**Centralized:**
- Single Governance Hub instance
- Serves all kernels (Leadscore, CIQ, MCP Gateway, etc.)
- Multi-tenant by design

### Repo C Deployment

**Centralized:**
- Single Key Vault Executor instance
- Serves all kernels that need external API execution
- Multi-tenant by design

---

## Monitoring & Observability

### What to Monitor

**Repo A (Gateway):**
- Authorization latency (should be < 50ms with cache)
- Cache hit rate (should be > 80%)
- MCP server health
- Request throughput

**Repo B (Governance Hub):**
- Authorization request volume from `mcp-gateway`
- Audit event volume from `mcp-gateway`
- Policy evaluation latency
- Kernel registration status

**Repo C (Key Vault Executor):**
- No monitoring needed for Phase 1 (no integration)

### Key Metrics

**Authorization:**
- Requests per second
- Cache hit rate
- Deny rate
- Average latency

**Audit:**
- Events per second
- Storage success rate
- Compliance coverage

**MCP Operations:**
- Tool calls per second
- Resource operations per second
- Error rate
- Average latency

---

## Troubleshooting

### Gateway Can't Connect to Repo B

**Symptoms:**
- Authorization failures
- Audit events not stored
- Kernel registration fails

**Check:**
1. `ACP_BASE_URL` is correct
2. `ACP_KERNEL_KEY` is valid Supabase JWT
3. Network connectivity to Repo B
4. Repo B endpoints are deployed

### Authorization Always Denies

**Symptoms:**
- All MCP operations denied
- No policies configured

**Check:**
1. Policies exist in Repo B for MCP actions
2. Tenant ID is correct
3. Kernel is registered in Repo B
4. Policies are active (not draft)

### Audit Events Not Stored

**Symptoms:**
- Operations succeed but no audit logs
- Compliance gaps

**Check:**
1. `audit-ingest` endpoint is deployed
2. `ACP_KERNEL_KEY` has audit permissions
3. Repo B database is accessible
4. Audit adapter is configured correctly

---

## Summary

### Three-Repo Architecture for MCP Gateway

**Repo A (agentic-control-plane-kit):**
- ✅ Implements MCP Gateway
- ✅ Calls Repo B for authorization
- ✅ Emits audit events to Repo B
- ❌ Does NOT store credentials
- ❌ Does NOT make policy decisions

**Repo B (governance-hub):**
- ✅ Provides authorization endpoint
- ✅ Provides audit ingestion
- ✅ Stores audit logs
- ✅ Evaluates policies
- ❌ Does NOT execute MCP operations

**Repo C (key-vault-executor):**
- ⚠️ No integration in Phase 1
- ✅ Future: Executor MCP server
- ✅ Stores external credentials
- ✅ Executes external APIs

**Together, they provide:**
- ✅ Universal MCP governance
- ✅ Policy enforcement
- ✅ Audit and compliance
- ✅ Secure credential management (future)
- ✅ Scalable architecture

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Production-Ready (Phase 1)
