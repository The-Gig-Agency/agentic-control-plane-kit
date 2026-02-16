# Platform Build Plan: Repo B (Lovable Project)

## Overview

**Repo B**: `agentic-control-plane-platform` (Lovable project with Supabase backend)
**Goal**: Ship a credible governance console fast, while building real authority behind it

## Strategy: Shell First, Authority Behind

### Phase 1: Lovable Scaffolds UI Shells (Week 0)

**Pages to create (shells first):**

1. **Policies**
   - List policies
   - Create policy
   - Test policy
   - Publish policy

2. **Audit**
   - Search/filter interface
   - Export functionality
   - Basic visualizations

3. **Revocations**
   - Emergency revoke UI
   - Revocation history
   - Bulk operations

4. **Agents/Repos** (Inventory)
   - List registered kernels
   - Heartbeat status
   - Version tracking
   - Health monitoring

5. **Identities** (Later)
   - Identity management
   - SSO configuration
   - Cross-repo mapping

**Lovable can scaffold all of this immediately.**

---

## Phase 2: Cursor Builds "It Works" APIs (Week 1)

### Core APIs to Build

1. **`POST /api/authorize`** ⚡ **CRITICAL: Must be <50ms**
   - Input: `{kernelId, tenantId, actor, action, params}`
   - Output: `{decisionId, allowed, reason, policyId, expiresAt}`
   - **Purpose**: Authoritative decision-making
   - **Performance Requirements**:
     - Target: <50ms (sits on hot path of every privileged action)
     - Stateless evaluation (no joins across many tables)
     - Indexed policy lookup
     - In-memory cache layer (5-second refresh)
     - Deterministic evaluation path

2. **`POST /api/audit/ingest`**
   - Input: Audit entry from kernel
   - Output: `{ok, id}`
   - **Purpose**: Collect audit logs from kernels

3. **`GET /api/audit/query`** (Basic filters)
   - Query params: `tenantId`, `action`, `result`, `dateRange`
   - Output: `{entries: [], total, page}`
   - **Purpose**: Query audit logs

4. **`POST /api/revoke`**
   - Input: `{type: 'key' | 'tenant', id, reason}`
   - Output: `{ok, revoked: []}`
   - **Purpose**: Emergency revocation

5. **`POST /api/heartbeat`**
   - Input: `{kernelId, version, packs, env, status}` (with `Authorization: Bearer acp_kernel_xxx`)
   - Output: `{ok, kernelRegistered, policyVersion}`
   - **Purpose**: Kernel reports in, tracks inventory, receives policy version for cache invalidation

**That's enough to demo "authoritative control plane" in a week.**

---

## Critical Performance & Security Refinements

### Refinement 1: /authorize Performance (<50ms Target)

**This endpoint sits on the hot path of every privileged agent action. If it's slow, your entire system becomes unusable.**

**Required properties:**
- ✅ Stateless evaluation (no joins across many tables)
- ✅ Indexed policy lookup
- ✅ In-memory cache layer (5-second refresh)
- ✅ Deterministic evaluation path

**Implementation:**

```typescript
// platform/lib/policy-cache.ts
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

**This alone makes the system feel "instant."**

### Refinement 2: Decision Logging

**Right now audit_logs captures kernel-reported events. You must ALSO log platform decisions.**

**Added fields:**
- `decision_source`: 'platform' | 'kernel'
- `policy_id`: Which policy caused the decision
- `allowed`: Boolean decision result
- `decision_id`: Links kernel audit to platform decision

**This enables:**
- "Why was this denied?"
- "Which policy caused it?"
- "Was platform consulted?"

**Essential for enterprise trust.**

### Refinement 3: Kernel Authentication

**Kernels must authenticate to platform. Otherwise anyone could impersonate a kernel.**

**Added to kernels table:**
- `api_key_hash`: SHA-256 hash of kernel API key
- `organization_id`: Multi-tenant isolation

**Authentication model:**
```
Authorization: Bearer acp_kernel_xxx
```

**Required before production use.**

### Refinement 4: Policy Priority & Enabled Flag

**You will need deterministic evaluation ordering.**

**Added to policies table:**
- `priority`: INTEGER (lower = evaluated first)
- `enabled`: BOOLEAN (default TRUE)

**Evaluation order:**
1. enabled policies only
2. sorted by priority ASC
3. first match wins

**Without priority, policy conflicts become chaos.**

### Refinement 5: Organization Layer (Multi-Tenancy)

**Right now everything keys off kernel_id and tenant_id. You need organization layer for true SaaS.**

**Structure:**
```
organization
  ├ kernels
  ├ policies
  ├ audit_logs
  ├ revocations
```

**This allows:**
- Multiple customers using your platform
- True SaaS control plane model
- Enterprise multi-tenant platform

**Without this, you're accidentally building single-tenant infrastructure.**

### Refinement 6: API Response Enhancements

**`/authorize` response includes decision ID:**
```typescript
{
  decisionId: string,  // Links to audit log
  allowed: boolean,
  reason?: string,
  policyId?: string,  // Which policy matched
  expiresAt?: number  // Cache TTL
}
```

**This lets kernel include decisionId in audit logs. Creates full traceability chain.**

**`/heartbeat` includes platform response:**
```typescript
{
  ok: true,
  kernelRegistered: true,
  policyVersion: "v42"  // Signals when to refresh cache
}
```

**This lets kernels know when to refresh local caches.**

### Refinement 7: Optional Decision Caching in Kernel (V2)

**Kernel can cache allow decisions briefly:**

```typescript
// kernel/src/adapters/platform-policy-adapter.ts
const decisionCache = new Map<string, {decision: Decision, expiresAt: number}>()
const CACHE_TTL = 5000 // 5 seconds

async authorize(request: AuthorizationRequest): Promise<Decision> {
  const cacheKey = `${request.kernelId}:${request.tenantId}:${request.action}`
  const cached = decisionCache.get(cacheKey)
  
  if (cached && Date.now() < cached.expiresAt && cached.decision.allowed) {
    return cached.decision // Cache hit for allowed decisions only
  }
  
  const decision = await platformClient.authorize(request)
  
  if (decision.allowed && decision.expiresAt) {
    decisionCache.set(cacheKey, {
      decision,
      expiresAt: decision.expiresAt
    })
  }
  
  return decision
}
```

**Reduces platform load dramatically. Optional for V1, valuable for V2.**

---

## Phase 3: Kernel Repo Changes (Tiny, Surgical)

### Changes to `agentic-control-plane-kit` Repo

**Add to kernel:**

1. **`PlatformPolicyAdapter`** (calls `/authorize`)
   ```typescript
   // kernel/src/adapters/platform-policy-adapter.ts
   class PlatformPolicyAdapter implements ControlPlaneAdapter {
     async authorize(request: AuthorizationRequest) {
       // HTTP call to platform /api/authorize
     }
   }
   ```

2. **`PlatformAuditSink`** (sends audit upstream)
   ```typescript
   // kernel/src/adapters/platform-audit-sink.ts
   class PlatformAuditSink implements AuditAdapter {
     async log(entry: AuditEntry) {
       // Log locally first
       await localAuditAdapter.log(entry);
       // Then stream to platform (fire-and-forget)
       await platformClient.streamAudit(entry);
     }
   }
   ```

3. **`KernelHeartbeat`** (reports version + packs + env)
   ```typescript
   // kernel/src/heartbeat.ts
   export async function sendHeartbeat(config: {
     platformUrl: string;
     kernelId: string;
     version: string;
     packs: string[];
     env: string;
   }) {
     await fetch(`${platformUrl}/api/heartbeat`, {
       method: 'POST',
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

**No UI. No DB. No platform concerns.**

---

## Two Hard Rules (To Keep It Clean)

### Rule 1: Platform Owns Policy Decisions

**Kernel asks; platform decides.**

```typescript
// Kernel MUST consult platform
const decision = await platformAdapter.authorize({
  kernelId, tenantId, actor, action, params
});

// Kernel executes only if platform authorizes
if (!decision.allowed) {
  return { ok: false, code: 'POLICY_DENIED' };
}
```

**No local policy evaluation. Platform is authoritative.**

### Rule 2: Degraded Mode Support

**Kernel can run with degraded mode if platform is unreachable.**

**Configurable per action:**
- `fail-closed`: Deny if platform unreachable (secure default)
- `fail-open`: Allow if platform unreachable (availability mode)

```json
{
  "control_plane": {
    "enabled": true,
    "url": "https://platform.example.com",
    "fail_mode": "closed",  // or "open"
    "fail_mode_overrides": {
      "domain.*.read": "open",  // Reads can fail-open
      "domain.*.delete": "closed"  // Deletes must fail-closed
    }
  }
}
```

**That's the enterprise story.**

---

## Repo Structure (Won't Collapse Later)

### Lovable Project Structure

```
agentic-control-plane-platform/
├── app/                    # Next.js app directory
│   ├── api/               # Cursor-built endpoints
│   │   ├── authorize/
│   │   ├── audit/
│   │   │   ├── ingest/
│   │   │   └── query/
│   │   ├── revoke/
│   │   └── heartbeat/
│   ├── policies/          # Lovable UI pages
│   ├── audit/
│   ├── revocations/
│   ├── agents/
│   └── identities/
├── lib/
│   ├── sdk/               # Shared typed client
│   │   ├── authorize.ts
│   │   ├── audit.ts
│   │   └── types.ts
│   └── platform/          # Platform business logic
│       ├── policy-engine.ts
│       ├── policy-cache.ts  # In-memory cache (<50ms target)
│       ├── authorization.ts
│       └── audit-service.ts
├── supabase/
│   ├── migrations/
│   └── functions/
└── packages/
    └── sdk/               # Optional: shared typed client
```

**If Lovable is Next.js:**
- APIs in `app/api/*`
- Keep internal `/lib/sdk` for typed calls
- UI pages in `app/*/page.tsx`

---

## V1 Policy Model (Dead Simple)

### Policy Structure

**Policies as "deny/allow + conditions":**

```typescript
interface Policy {
  id: string;
  organizationId: string;  // Multi-tenant isolation
  kernelId?: string;  // NULL = applies to all kernels in org
  tenantId?: string;  // NULL = global policy
  name: string;
  version: string;
  effect: 'allow' | 'deny';
  priority: number;  // Lower = evaluated first (default: 100)
  enabled: boolean;  // Default: true
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
    
    // IP allowlist (later)
    ipAllowlist?: string[];  // Future feature
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

**This gets you 80% of value with 20% complexity.**

---

## Build Order

### Week 0: Lovable Scaffolds
- [ ] Create Next.js project structure
- [ ] Scaffold UI pages (shells)
- [ ] Set up Supabase backend
- [ ] Create database schema (with organizations, policy priority, decision logging)

### Week 1: Cursor Builds APIs
- [ ] `POST /api/authorize` - Policy evaluation engine (<50ms target, with cache)
- [ ] `POST /api/audit/ingest` - Audit log ingestion (with decision logging)
- [ ] `GET /api/audit/query` - Basic audit query
- [ ] `POST /api/revoke` - Revocation service
- [ ] `POST /api/heartbeat` - Kernel registration (with authentication)
- [ ] Policy cache implementation (in-memory, 5s TTL)
- [ ] Kernel authentication middleware

### Week 2: Connect UI to APIs
- [ ] Policies page connects to authorize API
- [ ] Audit page connects to query API
- [ ] Revocations page connects to revoke API
- [ ] Agents page shows heartbeat data

### Week 3: Kernel Integration
- [ ] Add `PlatformPolicyAdapter` to kernel
- [ ] Add `PlatformAuditSink` to kernel
- [ ] Add `KernelHeartbeat` to kernel
- [ ] Test end-to-end flow

---

## Database Schema (Supabase)

### Core Tables

```sql
-- Organizations (multi-tenant SaaS layer)
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies
CREATE TABLE policies (
  id UUID PRIMARY KEY,
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
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kernel_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  result TEXT,
  request_id TEXT,
  payload JSONB,
  -- Platform decision fields
  decision_source TEXT,  -- 'platform' | 'kernel'
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  allowed BOOLEAN,
  decision_id TEXT,  -- Links kernel audit to platform decision
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_decision ON audit_logs(decision_id);
CREATE INDEX idx_audit_logs_policy ON audit_logs(policy_id);

-- Revocations
CREATE TABLE revocations (
  id UUID PRIMARY KEY,
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
  api_key_hash TEXT NOT NULL,  -- SHA-256 hash of kernel API key
  version TEXT,
  packs TEXT[],
  env TEXT,
  last_heartbeat TIMESTAMPTZ,
  status TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kernels_org ON kernels(organization_id);
CREATE INDEX idx_kernels_api_key_hash ON kernels(api_key_hash);
```

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

**That's enough to show "authoritative control plane" working.**

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

## Key Principles

1. **Platform owns decisions** - Kernel asks, platform decides
2. **Degraded mode support** - Fail-closed or fail-open
3. **Simple policy model** - 80% value, 20% complexity
4. **Shell first** - Lovable scaffolds UI, Cursor builds APIs
5. **Clean separation** - No platform code in kernel repo
6. **Performance critical** - /authorize must be <50ms (hot path)
7. **Full traceability** - Every decision logged with policy ID
8. **Multi-tenant from day 1** - Organization layer required
9. **Kernel authentication** - Required before production
10. **Deterministic evaluation** - Priority-based policy ordering

---

## Next Steps

1. **Lovable**: Create project structure and scaffold UI pages
2. **Cursor**: Build Week 1 APIs (authorize, audit, revoke, heartbeat)
3. **Integration**: Connect UI to APIs
4. **Kernel**: Add platform adapters (minimal changes)
5. **Testing**: End-to-end validation

---

*Last Updated: February 2025*
*Status: Planning - Ready for Implementation*
*Version: 2.0 - With Performance & Security Refinements*
