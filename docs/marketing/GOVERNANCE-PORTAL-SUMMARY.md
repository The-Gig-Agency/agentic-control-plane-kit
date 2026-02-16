# Governance Portal (Repo B) - Consolidated Summary

**Project:** `agentic-control-plane-platform`  
**Purpose:** Authoritative governance console for agentic control plane kernels  
**Stack:** React Router (Lovable) + Supabase Edge Functions (Cursor) + Supabase Postgres  
**Status:** Ready for Implementation (with surgical tweaks for production readiness)  
**Last Updated:** February 2026

**⚠️ Critical Production Tweaks Applied:**
- Bounded params (no `params: any` on hot path) + hard size limits (4KB/8KB)
- Decision cache tokens (policy_version + TTL)
- Split audit storage (hot index vs cold blob)
- HMAC kernel authentication (not raw SHA-256)
- Precise degraded mode (per action class)
- Schema alignment with Repo A's AuditEvent
- Approval as first-class decision type (allow/deny/require_approval)
- Fast revocation enforcement (snapshot endpoint for local caching)
- Async audit ingest (batch, 202 Accepted, tolerant)
- Naming consistency (snake_case everywhere)
- Winning UI primitives (Capabilities Matrix, Runbooks, Timeline)

---

## Executive Summary

The Governance Portal is a centralized control plane platform that provides authoritative policy decisions, audit management, and governance services for multiple agentic control plane kernels. It transforms the kernel from a distributed middleware system into true control plane infrastructure.

**Key Distinction:** The platform is **authoritative** (makes decisions), not just **advisory** (suggests policies). Kernels ask; platform decides.

**Commercial Model:** Free/open kernel (Repo A) + Paid/enterprise platform (Repo B)

---

## Strategic Vision: Authoritative Model

### The Critical Distinction

**❌ Advisory Model (Insufficient):**
```
Platform → distributes policy → kernels enforce locally
```
- Policy can drift
- Policy can be bypassed
- Distributed middleware system

**✅ Authoritative Model (Required):**
```
Kernel → asks platform → platform decides → kernel executes
```
- Policy is authoritative
- Policy is enforceable
- True control plane infrastructure

### Real-World Examples

Every successful control plane uses the authoritative model:
- **Kubernetes**: kubelet asks API server for authorization
- **AWS**: SDKs ask AWS control plane for permissions
- **Stripe**: Client libraries ask Stripe platform for authorization
- **Terraform**: Providers ask Terraform Cloud for policy decisions

### Why This Matters

**Without centralized authority:**
- Useful dev tool
- Advisory policies
- Distributed middleware

**With centralized authority:**
- Category-defining infrastructure
- Authoritative governance
- Control plane platform

---

## Two-Repo Strategy

### Repo A: `agentic-control-plane-kit` (Kernel)
**Purpose:** Embeddable execution kernel + spec + conformance

**Contains:**
- Kernel implementations (TypeScript, Python)
- Adapter interfaces (DB, Audit, Idempotency, Rate Limit, Ceilings)
- **NEW:** `ControlPlaneAdapter` interface (thin HTTP client)
- Core packs (iam, webhooks, settings)
- Conformance tests
- Spec definitions

**Characteristics:**
- Stable, portable, framework-agnostic
- Minimal dependencies
- Boring releases
- Wide compatibility

### Repo B: `agentic-control-plane-platform` (Platform)
**Purpose:** Governance services + UI + multi-repo management

**Contains:**
- Authoritative policy service (decision API)
- Policy authoring UI
- Audit lake + query API + dashboards
- Identity registry + SSO
- Revocation + alerting
- Multi-kernel inventory
- Connectors (Slack, Teams, SIEM, PagerDuty)

**Characteristics:**
- Fast iteration
- UI churn
- Integrations
- Opinionated hosting

**Why Separate:**
- Different release cycles
- Different buyers (developers vs. organizations)
- Different risk profiles
- Proven model (Linux kernel vs. distros, Terraform vs. Terraform Cloud)

---

## Technical Architecture

### Core APIs

#### 1. `POST /api/authorize` ⚡ **CRITICAL: <50ms Target**

**Purpose:** Authoritative decision-making (sits on hot path of every privileged action)

**Input:**
```typescript
{
  kernelId: string;
  tenantId: string;
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
    api_key_id?: string;
  };
  action: string;  // e.g., "domain.publishers.delete"
  request_hash: string;  // SHA-256 hash from Repo A (canonical, sanitized)
  params_summary?: {     // Optional, tiny, schema-driven (NOT full params)
    // Only essential fields for policy evaluation
    // e.g., { amount: 100, type: 'refund' } NOT full request object
  };
  params_summary_schema_id?: string;  // Schema ID so policies know what they're evaluating
}
```

**⚠️ CRITICAL: Hard Size Limits**
- `params_summary` max: **4KB** (reject with 413 if larger)
- Request body max: **8KB** (reject with 413 if larger)
- Prevents huge JSON from blowing latency
- Prevents accidental PII ingestion
- Enables caching (request_hash is stable)

**⚠️ CRITICAL: Do NOT accept `params: any` on hot path**
- Use `params_summary` for policy evaluation only
- `params_summary_schema_id` tells policies what schema to expect

**Output:**
```typescript
{
  decision_id: string;      // Links to audit log
  decision: 'allow' | 'deny' | 'require_approval';  // First-class approval support
  approval_id?: string;     // If require_approval, ID for tracking approval
  reason?: string;
  policy_id?: string;        // Which policy matched
  policy_version: string;    // Policy version/hash for cache invalidation
  expires_at?: number;       // Cache TTL (milliseconds)
  decision_ttl_ms?: number; // How long kernel can cache this decision
}
```

**Decision Types:**
- `allow`: Execute immediately
- `deny`: Reject immediately
- `require_approval`: Pause execution, emit audit "pending approval", wait for approval
  - Kernel stores `approval_id` and can resume when approved (runbook continuation)
  - Enables "Runbooks + approvals" workflow

**Decision Cache Token:**
Kernels can safely cache decisions using:
- Cache key: `action + actor + tenant + request_hash + policy_version`
- Cache TTL: `decision_ttl_ms` (default: 5000ms)
- Cache invalidation: When `policy_version` changes, cache is invalidated

This keeps platform authoritative while enabling fast kernel-side caching.

**Decision Cache Token:**
Kernels can safely cache decisions using:
- Cache key: `action + actor + tenant + request_hash + policy_version`
- Cache TTL: `decision_ttl_ms` (default: 5000ms)
- Cache invalidation: When `policy_version` changes, cache is invalidated

This keeps platform authoritative while enabling fast kernel-side caching.

**Performance Requirements:**
- Target: <50ms (hot path)
- Stateless evaluation (no joins across many tables)
- Indexed policy lookup
- In-memory cache layer (5-second refresh)
- Deterministic evaluation path

**Implementation:**
```typescript
// In-memory policy cache
let cachedPolicies: Policy[] = []
let lastRefresh = 0
const CACHE_TTL = 5000 // 5 seconds

export async function getPolicies(organizationId: string, kernelId?: string): Promise<Policy[]> {
  if (Date.now() - lastRefresh > CACHE_TTL) {
    cachedPolicies = await loadPoliciesFromDB(organizationId, kernelId)
    lastRefresh = Date.now()
  }
  return cachedPolicies
}

// Evaluation order:
// 1. enabled policies only
// 2. sorted by priority ASC
// 3. first match wins
```

#### 2. `POST /api/audit/ingest`

**Purpose:** Collect audit logs from kernels (async, tolerant)

**Input:** 
- Single audit entry OR batch array
- Audit entry from kernel (unified `AuditEvent` format)

**Output:** `202 Accepted` (async processing)
```typescript
{
  ok: true,
  accepted: number,  // Number of events accepted
  ids?: string[]     // Event IDs (if available immediately)
}
```

**Behavior:**
- Accepts batch (array of events)
- Returns `202 Accepted` immediately (async processing)
- Stores to hot index quickly (indexed fields)
- Blob write optional/background (if org requires full detail retention)
- Tolerant: Partial failures don't break the request

**This ensures audit ingestion never blocks kernel operations.**

#### 3. `GET /api/audit/query`

**Purpose:** Query audit logs

**Query Params:** `tenantId`, `action`, `result`, `dateRange`, `page`, `limit`

**Output:** `{entries: [], total: number, page: number}`

#### 4. `POST /api/revoke`

**Purpose:** Emergency revocation

**Input:**
```typescript
{
  type: 'key' | 'tenant' | 'kernel';
  id: string;
  reason: string;
}
```

**Output:** `{ok: true, revoked: string[]}`

#### 4b. `GET /api/revocations/snapshot?kernelId=...`

**Purpose:** Fast local enforcement - kernels can cache revocations

**Query Params:**
- `kernelId`: Required

**Output:**
```typescript
{
  revocations: {
    api_keys: string[];      // Revoked API key IDs
    tenants: string[];       // Revoked tenant IDs
    kernels: string[];       // Revoked kernel IDs
  };
  revocations_version: string;  // Version/hash for cache invalidation
  expires_at: number;           // When snapshot expires
}
```

**Usage:**
- Kernels call this periodically (or on startup)
- Cache the snapshot locally
- Can instantly deny revoked keys/tenants even if platform hiccups
- `revocations_version` included in `/heartbeat` response for cache invalidation

**This enables fast local enforcement without platform dependency.**

#### 5. `POST /api/heartbeat`

**Purpose:** Kernel registration and health tracking

**Input:**
```typescript
{
  kernelId: string;
  version: string;
  packs: string[];
  env: string;
  status: 'healthy' | 'degraded';
}
```

**Headers:** `Authorization: Bearer acp_kernel_xxx`

**Output:**
```typescript
{
  ok: true;
  kernel_registered: boolean;
  policy_version: string;  // Signals when to refresh cache
  revocations_version: string;  // Signals when to refresh revocation snapshot
}
```

**⚠️ Naming Consistency:**
- All wire format uses `snake_case` (not `camelCase`)
- Consistent: `policy_version`, `decision_id`, `expires_at`, `kernel_registered`, etc.

---

## Database Schema

### Core Tables

```sql
-- Organizations (multi-tenant SaaS layer)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kernel_id TEXT,  -- NULL = applies to all kernels in org
  tenant_id UUID,  -- NULL = global policy
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  effect TEXT CHECK (effect IN ('allow', 'deny')),
  conditions JSONB NOT NULL,
  reason TEXT,
  priority INTEGER DEFAULT 100,  -- Lower = evaluated first
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policies_org_kernel ON policies(organization_id, kernel_id) WHERE enabled = TRUE;
CREATE INDEX idx_policies_priority ON policies(priority) WHERE enabled = TRUE;

-- Audit Logs (kernel-reported + platform decisions)
-- "Hot index" - indexed fields only, no raw payload
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID,  -- From Repo A's AuditEvent
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kernel_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  integration TEXT,  -- From Repo A (e.g., "ciq-automations")
  pack TEXT,  -- From Repo A (e.g., "domain", "iam")
  schema_version INTEGER DEFAULT 1,  -- From Repo A's AuditEvent
  actor_type TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  status TEXT,  -- 'success' | 'error' | 'denied'
  request_hash TEXT,  -- SHA-256 from Repo A (canonical, sanitized)
  request_id TEXT,
  -- Platform decision fields
  decision_source TEXT,  -- 'platform' | 'kernel' | 'kernel_degraded'
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  policy_decision_id TEXT,  -- Links kernel audit to platform decision
  allowed BOOLEAN,
  degraded_reason TEXT,  -- e.g., 'platform_unreachable' if degraded
  -- Result metadata (what changed)
  result_meta JSONB,  -- { resource_type, resource_id, count, ids_created, etc. }
  latency_ms INTEGER,
  error_code TEXT,
  error_message_redacted TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Blobs (optional, compressed JSON for cold storage)
-- Only store if org requires full detail retention
CREATE TABLE audit_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id UUID REFERENCES audit_logs(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  compressed_data BYTEA,  -- Compressed JSON (gzip)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ⚠️ CRITICAL: Split storage prevents JSONB bloat
-- Hot index: Fast queries on indexed fields
-- Cold blob: Optional compressed storage (can be disabled per org)

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_decision ON audit_logs(policy_decision_id);
CREATE INDEX idx_audit_logs_policy ON audit_logs(policy_id);
CREATE INDEX idx_audit_logs_request_hash ON audit_logs(request_hash);
CREATE INDEX idx_audit_logs_event_id ON audit_logs(event_id);
CREATE INDEX idx_audit_logs_status ON audit_logs(status, created_at DESC);

-- Revocations
CREATE TABLE revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kernel_id TEXT,
  tenant_id UUID,
  api_key_id UUID,
  reason TEXT,
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_by TEXT
);

-- Kernel Inventory (with authentication)
CREATE TABLE kernels (
  id TEXT PRIMARY KEY,  -- kernelId
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_hmac TEXT NOT NULL,  -- HMAC-SHA-256(PEPPER, kernel_api_key) - NOT raw SHA-256
  version TEXT,
  packs TEXT[],
  env TEXT,
  last_heartbeat TIMESTAMPTZ,
  status TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ⚠️ CRITICAL: Use HMAC with server-side pepper, not raw SHA-256
-- api_key_hmac = HMAC(PEPPER, presented_key)
-- Never store plain SHA of a key without a server-side pepper

CREATE INDEX idx_kernels_org ON kernels(organization_id);
CREATE INDEX idx_kernels_api_key_hmac ON kernels(api_key_hmac);
```

---

## Policy Model

### Policy Structure

```typescript
interface Policy {
  id: string;
  organizationId: string;  // Multi-tenant isolation
  kernelId?: string;       // NULL = applies to all kernels in org
  tenantId?: string;       // NULL = global policy
  name: string;
  version: string;
  effect: 'allow' | 'deny';
  priority: number;        // Lower = evaluated first (default: 100)
  enabled: boolean;        // Default: true
  conditions: {
    // Action match (supports wildcards)
    action?: string | string[];  // e.g., "domain.*.delete"
    
    // Tenant match (optional)
    tenantId?: string | string[];
    
    // Actor type
    actorType?: 'api_key' | 'user' | 'agent';
    
    // Time window
    timeWindow?: {
      daysOfWeek?: number[];  // 0-6 (Sunday-Saturday)
      hours?: [number, number];  // [start, end]
      timezone?: string;
    };
    
    // Amount ceilings (for billing/refunds)
    amountCeiling?: {
      field: string;  // e.g., "params.amount"
      max: number;
    };
  };
  reason?: string;  // Human-readable explanation
}
```

### Example Policies

**Prevent weekend deletes:**
```json
{
  "name": "prevent-weekend-deletes",
  "effect": "deny",
  "priority": 10,
  "conditions": {
    "action": "domain.*.delete",
    "timeWindow": {
      "daysOfWeek": [0, 6]  // Sunday, Saturday
    }
  },
  "reason": "Deletes are not allowed on weekends"
}
```

**Limit refund amounts:**
```json
{
  "name": "max-refund-amount",
  "effect": "deny",
  "priority": 20,
  "conditions": {
    "action": "domain.billing.refund",
    "amountCeiling": {
      "field": "params.amount",
      "max": 1000
    }
  },
  "reason": "Refunds over $1000 require approval"
}
```

---

## Implementation Phases

### Phase 1: Lovable Scaffolds UI Shells (Week 0)

**Frontend (React Router pages):**
1. **Policies** (`/policies`) - List, create, test, publish
2. **Audit** (`/audit`) - Search/filter, export, visualizations
3. **Revocations** (`/revocations`) - Emergency revoke, history, bulk operations
4. **Kernels** (`/kernels`) - List kernels, heartbeat status, version tracking
5. **Runbooks** (`/runbooks`) - Runbook management and approval workflows
6. **Approvals** (`/approvals`) - Pending approvals queue
7. **Identities** (`/identities`) (Later) - Identity management, SSO

**Lovable creates React Router pages that fetch from backend APIs (which Cursor builds).**

### Phase 2: Cursor Builds APIs (Week 1)

**Backend (Supabase Edge Functions):**
- ✅ `POST /functions/authorize` - Policy evaluation (<50ms, with cache, size limits, approval support)
- ✅ `POST /functions/audit-ingest` - Audit log ingestion (async, batch, 202 Accepted)
- ✅ `GET /functions/audit-query` - Audit query
- ✅ `POST /functions/revoke` - Revocation service
- ✅ `GET /functions/revocations-snapshot` - Fast revocation snapshot (for local caching)
- ✅ `POST /functions/heartbeat` - Kernel registration (with authentication, policy_version, revocations_version)

**Infrastructure:**
- Policy cache (in-memory, 5s TTL)
- Kernel authentication middleware
- Database schema (with organizations, policy priority, decision logging)
- Supabase Edge Functions deployment

### Phase 3: Connect UI to APIs (Week 2)

**Frontend (Lovable) connects React Router pages to backend APIs:**
- Policies page → `fetch('/functions/authorize')`
- Audit page → `fetch('/functions/audit-query')`
- Revocations page → `fetch('/functions/revoke')`
- Kernels page → `fetch('/functions/heartbeat')` (for status)
- Runbooks page → `fetch('/functions/authorize')` (for approval workflow)
- Approvals page → `fetch('/functions/approvals')` (for pending approvals)

**Frontend uses `fetch()` to call Supabase Edge Functions.**

### Phase 4: Kernel Integration (Week 3)

**Changes to `agentic-control-plane-kit` Repo:**

1. **`PlatformPolicyAdapter`** (calls `/authorize`)
   ```typescript
   class PlatformPolicyAdapter implements ControlPlaneAdapter {
     async authorize(request: AuthorizationRequest) {
       // HTTP call to platform /api/authorize
     }
   }
   ```

2. **`PlatformAuditSink`** (sends audit upstream)
   ```typescript
   class PlatformAuditSink implements AuditAdapter {
     async logEvent(event: AuditEvent) {
       // Log locally first
       await localAuditAdapter.logEvent(event);
       // Then stream to platform (fire-and-forget)
       await platformClient.streamAudit(event);
     }
   }
   ```

3. **`KernelHeartbeat`** (reports version + packs + env)
   ```typescript
   export async function sendHeartbeat(config: {
     platformUrl: string;
     kernelId: string;
     version: string;
     packs: string[];
     env: string;
   }) {
     await fetch(`${platformUrl}/api/heartbeat`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${config.kernelApiKey}`
       },
       body: JSON.stringify({
         kernelId: config.kernelId,
         version: config.version,
         packs: config.packs,
         env: config.env,
         status: 'healthy',
         timestamp: Date.now()
       })
     });
   }
   ```

---

## Key Requirements

### Performance
- **`/authorize` endpoint: <50ms target** (hot path)
- Stateless evaluation
- In-memory policy cache (5-second refresh)
- Indexed lookups

### Security
- **Kernel authentication** (api_key_hmac with HMAC-SHA-256, organization_id)
- HMAC-SHA-256 for API keys
- Policy priority and enabled flags
- Decision logging with traceability

### Multi-Tenancy
- **Organization layer** (organizations table)
- All resources scoped to organization_id
- True SaaS control plane model

### Traceability
- **Decision logging** (decision_source, policy_id, allowed, decision_id)
- Links kernel audit to platform decision
- Full audit trail

### Degraded Mode
- **Fail-closed** (deny if platform unreachable) - secure default
- **Fail-open** (allow if platform unreachable) - availability mode
- Configurable per action

---

## Two Hard Rules

### Rule 1: Platform Owns Policy Decisions

**Kernel asks; platform decides.**

```typescript
// Kernel MUST consult platform
const decision = await platformAdapter.authorize({
  kernelId, tenantId, actor, action, params
});

// Kernel executes only if platform authorizes
if (!decision.allowed) {
  return { ok: false, code: 'POLICY_DENIED', reason: decision.reason };
}
```

**No local policy evaluation. Platform is authoritative.**

### Rule 2: Degraded Mode Support

**Kernel can run with degraded mode if platform is unreachable.**

**Precise fail-open rules (per action class):**
- **reads**: `open` (allow if platform unreachable)
- **writes**: `closed` (deny if platform unreachable)
- **deletes**: `closed` (deny if platform unreachable)
- **money-moving**: `closed` (deny if platform unreachable)

**Configuration:**
```json
{
  "control_plane": {
    "enabled": true,
    "url": "https://platform.example.com",
    "fail_mode": "closed",  // Default: secure (deny)
    "fail_mode_overrides": {
      "domain.*.read": "open",        // Reads can fail-open
      "domain.*.list": "open",        // Lists can fail-open
      "domain.*.delete": "closed",    // Deletes must fail-closed
      "domain.*.refund": "closed",    // Money-moving must fail-closed
      "domain.*.charge": "closed"     // Money-moving must fail-closed
    }
  }
}
```

**Degraded decision logging:**
When kernel makes decision in degraded mode:
- `decision_source`: `'kernel_degraded'`
- `degraded_reason`: `'platform_unreachable'`
- `allowed`: Based on fail-mode rules (open = allow, closed = deny)

**This ensures every degraded decision is traceable and auditable.**

---

## Success Criteria

### Week 1 Demo

**Can demonstrate:**
- ✅ Kernel asks platform for authorization (<50ms response)
- ✅ Platform returns authoritative decision with decisionId
- ✅ Audit logs stream to platform (with decision_source, policy_id)
- ✅ Can revoke access in real-time
- ✅ Can see kernel inventory (with authentication)
- ✅ Full traceability: decisionId links kernel audit to platform decision
- ✅ Multi-tenant: organizations isolate customers

**End-to-end flow:**
```
Agent → Kernel → Platform /authorize (<50ms) → Decision → Execution
                    ↓
                Audit stored centrally (with decision traceability)
                    ↓
                Revocation possible instantly
```

**This is a real control plane. Not a simulation. Not a toy. A real control plane.**

---

## Project Structure

### Architecture: React Router Frontend + Supabase Edge Functions Backend

**Clean Separation:**
- **Frontend (Lovable)**: React + React Router (pure client UI, navigation only)
- **Backend (Cursor builds)**: Supabase Edge Functions (API logic)
- **Database**: Supabase Postgres

**React Router handles navigation only. Supabase Edge Functions handle backend logic.**

### Lovable Project (Repo B)

```
agentic-control-plane-platform/
├── src/                    # React frontend (Lovable)
│   ├── pages/             # React Router pages
│   │   ├── Policies.tsx
│   │   ├── Audit.tsx
│   │   ├── Revocations.tsx
│   │   ├── Kernels.tsx
│   │   ├── Runbooks.tsx
│   │   └── Approvals.tsx
│   ├── components/        # React components
│   ├── lib/               # Frontend utilities
│   │   └── api-client.ts  # fetch() wrapper for backend APIs
│   └── router.tsx         # React Router configuration
├── supabase/
│   ├── functions/         # Supabase Edge Functions (Cursor builds)
│   │   ├── authorize/
│   │   │   └── index.ts
│   │   ├── audit-ingest/
│   │   │   └── index.ts
│   │   ├── audit-query/
│   │   │   └── index.ts
│   │   ├── revoke/
│   │   │   └── index.ts
│   │   ├── revocations-snapshot/
│   │   │   └── index.ts
│   │   └── heartbeat/
│   │       └── index.ts
│   ├── migrations/        # Database migrations
│   └── seed.sql
├── lib/                   # Shared backend logic (Cursor builds)
│   ├── policy-engine.ts
│   ├── policy-cache.ts    # In-memory cache (<50ms target)
│   ├── authorization.ts
│   └── audit-service.ts
└── packages/
    └── sdk/               # Optional: shared typed client
```

**Frontend → Backend Communication:**
```typescript
// Frontend (React Router page)
// src/pages/Policies.tsx
const response = await fetch(`${SUPABASE_URL}/functions/v1/authorize`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ ... })
});

// Backend (Supabase Edge Function)
// supabase/functions/authorize/index.ts
Deno.serve(async (req) => {
  // Policy evaluation logic
  const result = await evaluatePolicy(request);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

**Note:** Frontend uses `fetch()` to call Supabase Edge Functions. React Router only handles client-side navigation.

**Key Points:**
- React Router is for UI navigation only (client-side routing)
- Supabase Edge Functions are for backend API logic
- Frontend and backend are completely separable concerns
- Frontend uses `fetch()` to call backend APIs

---

## UI Design: Winning Primitives

### 1. Capabilities Matrix
**Left:** Packs/Actions  
**Top:** Tenants or Roles  
**Cells:** Allow / Deny / Require Approval

Visual policy management - see all permissions at a glance.

### 2. Runbooks
**Human-friendly wrapper around multiple actions**
- Approvals attach to runbooks, not raw endpoints
- Pre-configured action sequences
- Approval workflows

**Example:** "Deploy Campaign" runbook = create campaign + create lists + send messages (requires approval)

### 3. Timeline
**Filter by:** tenant/action/actor/status  
**Click into:** `result_meta` to see "created 12 publishers", "deleted campaign 123"

**Shows:**
- What happened
- When it happened
- Who did it
- What changed (from `result_meta`)

**If Repo B ships with these 3 UI primitives, you're in "sellable dashboard" territory fast.**

---

## Key Principles

1. **Platform owns decisions** - Kernel asks, platform decides
2. **Degraded mode support** - Fail-closed or fail-open (precise per action class)
3. **Simple policy model** - 80% value, 20% complexity
4. **Shell first** - Lovable scaffolds UI, Cursor builds APIs
5. **Clean separation** - No platform code in kernel repo
6. **Performance critical** - /authorize must be <50ms (hot path)
7. **Full traceability** - Every decision logged with policy ID
8. **Multi-tenant from day 1** - Organization layer required
9. **Kernel authentication** - HMAC-SHA-256 with pepper (required before production)
10. **Deterministic evaluation** - Priority-based policy ordering
11. **Bounded params** - No `params: any` on hot path (use `params_summary` + `request_hash`)
12. **Split audit storage** - Hot index vs cold blob (prevent JSONB bloat)
13. **Decision cache tokens** - Policy version + TTL for safe kernel-side caching

---

## Next Steps

1. **Lovable**: Create project structure and scaffold UI pages
2. **Cursor**: Build Week 1 APIs (authorize, audit, revoke, heartbeat)
3. **Integration**: Connect UI to APIs
4. **Kernel**: Add platform adapters (minimal changes)
5. **Testing**: End-to-end validation

---

## Related Documents

For detailed information, see:
- **PLATFORM-BUILD-PLAN.md** - Complete technical specification
- **KERNEL-TO-PLATFORM-EVOLUTION.md** - Evolution strategy
- **REPO-SEPARATION-STRATEGY.md** - Two-repo model details
- **STRATEGIC-INSIGHT.md** - Authoritative vs Advisory model
- **VALUE-PROPOSITION.md** - Value proposition and benefits

---

*Last Updated: February 2026*  
*Status: Ready for Implementation*
