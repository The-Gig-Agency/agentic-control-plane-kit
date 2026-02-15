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

1. **`POST /api/authorize`**
   - Input: `{kernelId, tenantId, actor, action, params}`
   - Output: `{allowed, reason, policy, expiresAt}`
   - **Purpose**: Authoritative decision-making

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
   - Input: `{kernelId, version, packs, env, status}`
   - Output: `{ok, registered}`
   - **Purpose**: Kernel reports in, tracks inventory

**That's enough to demo "authoritative control plane" in a week.**

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
  name: string;
  version: string;
  effect: 'allow' | 'deny';
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
- [ ] Create database schema

### Week 1: Cursor Builds APIs
- [ ] `POST /api/authorize` - Policy evaluation engine
- [ ] `POST /api/audit/ingest` - Audit log ingestion
- [ ] `GET /api/audit/query` - Basic audit query
- [ ] `POST /api/revoke` - Revocation service
- [ ] `POST /api/heartbeat` - Kernel registration

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
-- Policies
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  kernel_id TEXT,
  tenant_id UUID,  -- NULL = global policy
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  effect TEXT CHECK (effect IN ('allow', 'deny')),
  conditions JSONB NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  kernel_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  result TEXT,
  request_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ
);

-- Revocations
CREATE TABLE revocations (
  id UUID PRIMARY KEY,
  kernel_id TEXT,
  tenant_id UUID,
  api_key_id UUID,
  reason TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT
);

-- Kernel Inventory
CREATE TABLE kernels (
  id TEXT PRIMARY KEY,  -- kernelId
  version TEXT,
  packs TEXT[],
  env TEXT,
  last_heartbeat TIMESTAMPTZ,
  status TEXT,
  registered_at TIMESTAMPTZ
);
```

---

## Success Criteria

### Week 1 Demo

**Can demonstrate:**
- ✅ Kernel asks platform for authorization
- ✅ Platform returns authoritative decision
- ✅ Audit logs stream to platform
- ✅ Can revoke access in real-time
- ✅ Can see kernel inventory

**That's enough to show "authoritative control plane" working.**

---

## Key Principles

1. **Platform owns decisions** - Kernel asks, platform decides
2. **Degraded mode support** - Fail-closed or fail-open
3. **Simple policy model** - 80% value, 20% complexity
4. **Shell first** - Lovable scaffolds UI, Cursor builds APIs
5. **Clean separation** - No platform code in kernel repo

---

## Next Steps

1. **Lovable**: Create project structure and scaffold UI pages
2. **Cursor**: Build Week 1 APIs (authorize, audit, revoke, heartbeat)
3. **Integration**: Connect UI to APIs
4. **Kernel**: Add platform adapters (minimal changes)
5. **Testing**: End-to-end validation

---

*Last Updated: January 2025*
*Status: Planning - Ready for Implementation*
