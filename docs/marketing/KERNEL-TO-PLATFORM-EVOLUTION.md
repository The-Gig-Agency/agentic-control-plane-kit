# Evolution Plan: From Kernel to Authoritative Control Plane Platform

## Executive Summary: The Critical Strategic Refinement

**The single most important architectural decision:** Make the platform **authoritative**, not just advisory.

### The Distinction That Defines the Category

**❌ Advisory Model (Distributed Middleware):**
- Platform distributes policies → kernels enforce locally
- Policy can drift, be bypassed, become advisory
- Result: Useful dev tool

**✅ Authoritative Model (Control Plane Infrastructure):**
- Kernel asks platform → platform decides → kernel executes
- Policy is authoritative, enforceable, cannot be bypassed
- Result: Category-defining infrastructure

### Why This Matters

This is how every successful control plane works:
- **Kubernetes**: kubelet asks API server for authorization
- **AWS**: SDKs ask AWS control plane for permissions
- **Stripe**: Client libraries ask Stripe platform for authorization
- **Terraform**: Providers ask Terraform Cloud for policy decisions

**The architecture:**
- **Kernel** = Execution agent (embeddable, portable)
- **Platform** = Decision authority (centralized, authoritative)

**This creates:**
- True control plane infrastructure
- Enterprise-grade governance
- Commercial viability (hosted platform)
- Strategic infrastructure position

---

## Critique Analysis & Strategic Refinement

### Current State: Control Plane Kernel ✅

**What we provide:**
- ✅ **Execution control** - Router, action handlers, request/response flow
- ✅ **Permission control** - Scope-based access, API key auth, tenant isolation
- ✅ **Audit hooks** - Audit adapter interface, logging infrastructure

### Missing: Authoritative Control Plane Platform ❌

**What's missing:**
- ❌ **Centralized policy engine** - Dynamic rules, conditions, policy evaluation
- ❌ **Centralized audit viewer** - UI/dashboard to view, search, analyze audit logs
- ❌ **Centralized identity registry** - Cross-repo identity management, SSO
- ❌ **Centralized revocation system** - Emergency revoke, bulk operations, alerts
- ❌ **Authoritative decision-making** - Platform as decision authority, not just policy distributor

## Critical Strategic Insight: Authority vs Advisory

### The Key Distinction

**❌ Advisory Model (Insufficient):**
```
Platform → distributes policy → kernels enforce locally
```
- Policy can drift
- Policy can be bypassed
- Policy becomes advisory
- Distributed middleware system

**✅ Authoritative Model (Required):**
```
Kernel → asks platform → platform decides → kernel executes
```
- Policy is authoritative
- Policy is enforceable
- Policy cannot be bypassed
- True control plane infrastructure

### Why This Matters

This is the difference between:
- **Distributed middleware system** (useful dev tool)
- **Control plane infrastructure** (category-defining platform)

**Real-world examples:**
- **Kubernetes**: kubelet (kernel) asks API server (platform) for authorization
- **AWS**: SDKs (kernel) ask AWS control plane (platform) for permissions
- **Stripe**: Client libraries (kernel) ask Stripe platform (control plane) for authorization
- **Terraform**: Providers (kernel) ask Terraform Cloud (platform) for policy decisions

## Revised Architecture: Authoritative Control Plane

### Two-Tier Architecture with Centralized Authority

```
┌─────────────────────────────────────────┐
│  Control Plane Platform (Authoritative)  │
│  - Centralized policy engine             │
│  - Centralized authorization decisions   │
│  - Audit viewer UI                       │
│  - Identity registry                     │
│  - Revocation system                     │
│  - Cross-repo management                │
│                                          │
│  Platform = Decision Authority           │
└──────────────────┬──────────────────────┘
                   │
                   │ authorize({kernelId, tenantId, actor, action, params})
                   │ ← Returns: {allowed: boolean, reason?: string, policy?: object}
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Control Plane Kit (Execution Agent)     │
│  - Kernel (execution, auth, audit hooks) │
│  - Packs (IAM, webhooks, settings)      │
│  - Adapter interfaces                    │
│                                          │
│  Kernel = Enforcement Agent              │
│  Must consult platform for decisions     │
└─────────────────────────────────────────┘
```

### Authority Flow

**Current (Advisory):**
```typescript
// Kernel evaluates policy locally
const policy = await policyAdapter.evaluate(request);
if (!policy.allowed) {
  return { ok: false, code: 'POLICY_DENIED' };
}
```

**Revised (Authoritative):**
```typescript
// Kernel asks platform for authorization
const decision = await controlPlane.authorize({
  kernelId: 'ciq-automations-v1',
  tenantId: ctx.tenantId,
  actor: { type: 'api_key', id: ctx.apiKeyId },
  action: req.action,
  params: req.params,
  metadata: {
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId
  }
});

if (!decision.allowed) {
  return {
    ok: false,
    code: 'POLICY_DENIED',
    reason: decision.reason,
    policy: decision.policy
  };
}

// Kernel executes only if platform authorizes
```

## Implementation Strategy: Two-Repo Model

### Architecture

**Repo A: `agentic-control-plane-kit`** (Kernel - Execution Agent)
- Embedded in repos
- Consults platform for authorization
- Enforces platform decisions
- Streams audit logs to platform
- **Stable, minimal deps, boring releases**

**Repo B: `agentic-control-plane-platform`** (Platform - Decision Authority)
- Hosted service (SaaS or self-hosted)
- Authoritative policy engine
- Centralized authorization
- Audit aggregation
- Identity registry
- Revocation system
- Management UI
- **Fast iteration, UI churn, integrations**

### Why Separate Repos?

Following proven patterns:
- **Linux**: Kernel vs. Distros
- **Terraform**: Terraform vs. Terraform Cloud
- **Kubernetes**: kubelet vs. Control Plane

**Different needs:**
- **Kernel**: Stability, minimal deps, wide compatibility
- **Platform**: Fast iteration, UI churn, opinionated hosting

**Mixing them guarantees pain.**

See [REPO-SEPARATION-STRATEGY.md](./REPO-SEPARATION-STRATEGY.md) for detailed breakdown.

### Commercial Model

**Repo A: `agentic-control-plane-kit`** (Free/Open)
- Kernel (embeddable, framework-agnostic)
- Core packs (IAM, webhooks, settings)
- Local execution
- **License**: MIT (open source)
- **Buyers**: Developers embedding in repos

**Repo B: `agentic-control-plane-platform`** (Paid/Enterprise)
- Control plane platform (hosted)
- Authoritative governance
- Centralized management
- Enterprise features
- **License**: Proprietary (or open core)
- **Buyers**: Organizations managing multiple repos
- **Revenue**: Subscription-based

**Proven Model:**
- Kubernetes / GKE
- Terraform / Terraform Cloud
- Elastic / Elastic Cloud
- Supabase (open core + hosted)

## Evolution Plan (Revised)

### Phase 1: Authoritative Policy Engine (High Priority, 4-5 weeks)

**Goal:** Platform as authoritative decision-maker for all authorization

**Components:**

1. **Control Plane Authorization API**
   - `POST /authorize` endpoint
   - Input: kernelId, tenantId, actor, action, params
   - Output: {allowed, reason, policy, expiresAt}
   - Real-time decision making

2. **Policy Engine (Platform-side)**
   - Policy definition language
   - Policy evaluation engine
   - Policy cache (for performance)
   - Policy versioning

3. **Kernel Authorization Adapter**
   - `ControlPlaneAdapter` interface
   - Calls platform `/authorize` endpoint
   - Caches decisions (with TTL)
   - Handles platform unavailability (fail-closed or fail-open mode)

4. **Policy Pack (Platform-side)**
   - `policy.define` action
   - `policy.list` action
   - `policy.evaluate` action (for testing)
   - `policy.version` action

**Implementation:**

**Platform Side:**
```typescript
// platform/src/authorization/engine.ts
export async function authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
  const { kernelId, tenantId, actor, action, params } = request;
  
  // 1. Load policies for kernel + tenant
  const policies = await loadPolicies(kernelId, tenantId);
  
  // 2. Evaluate policies
  const decision = evaluatePolicies(policies, { actor, action, params });
  
  // 3. Log decision
  await logAuthorizationDecision(request, decision);
  
  // 4. Return authoritative decision
  return decision;
}
```

**Kernel Side:**
```typescript
// kernel/src/auth.ts (revised)
interface ControlPlaneAdapter {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

// In router.ts
const decision = await controlPlaneAdapter.authorize({
  kernelId: bindings.kernelId, // From bindings.json
  tenantId,
  actor: { type: 'api_key', id: apiKeyId },
  action,
  params,
  metadata: { ipAddress, userAgent, requestId }
});

if (!decision.allowed) {
  return {
    ok: false,
    code: 'POLICY_DENIED',
    reason: decision.reason
  };
}
```

**Key Features:**
- Real-time authorization (no policy sync needed)
- Centralized policy updates (immediate effect)
- Cannot be bypassed (kernel must consult platform)
- Fail-safe modes (fail-closed for security, fail-open for availability)

**Value:**
- ✅ Authoritative governance
- ✅ Real-time policy updates
- ✅ Centralized control
- ✅ Enterprise-grade security

---

### Phase 2: Centralized Revocation System (High Priority, 2-3 weeks)

**Goal:** Platform can revoke access in real-time

**Components:**

1. **Revocation API (Platform)**
   - `POST /revoke` endpoint
   - Revoke by: tenantId, apiKeyId, kernelId, pattern
   - Immediate effect (no sync delay)

2. **Revocation Cache (Platform)**
   - In-memory revocation list
   - Distributed cache (Redis)
   - TTL-based expiration

3. **Revocation Check (Kernel)**
   - Check revocation status during authorization
   - Platform returns `allowed: false` if revoked
   - Kernel respects decision

**Implementation:**

**Platform Side:**
```typescript
// platform/src/revocation/service.ts
export async function revoke(options: RevocationOptions) {
  const { tenantId, apiKeyId, kernelId, reason } = options;
  
  // 1. Add to revocation cache
  await revocationCache.set(`${kernelId}:${apiKeyId}`, {
    revoked: true,
    reason,
    revokedAt: Date.now()
  });
  
  // 2. Invalidate authorization cache
  await invalidateAuthCache(tenantId, apiKeyId);
  
  // 3. Send alerts
  await sendRevocationAlerts(options);
}
```

**Kernel Side:**
```typescript
// Authorization already checks revocation via platform
// No additional code needed - platform returns allowed: false
```

**Key Features:**
- Real-time revocation (immediate effect)
- Bulk revocation
- Scheduled revocation
- Alert notifications

**Value:**
- ✅ Emergency response
- ✅ Security incident handling
- ✅ Bulk operations
- ✅ Centralized control

---

### Phase 3: Centralized Audit Viewer (High Value, 4-6 weeks)

**Goal:** Web UI to view, search, and analyze audit logs across repos

**Components:**

1. **Audit Query API (Platform)**
   - `POST /audit/query` endpoint
   - Search, filter, aggregate
   - Cross-repo queries

2. **Audit Aggregation (Platform)**
   - Collect audit logs from kernels
   - Centralized storage
   - Real-time streaming

3. **Audit Viewer UI**
   - Search interface
   - Filter by tenant, action, result, time range
   - Visualizations (charts, graphs)
   - Export functionality

**Implementation:**

**Platform Side:**
```typescript
// platform/src/audit/service.ts
export async function queryAuditLogs(query: AuditQuery): Promise<AuditResults> {
  // Query centralized audit log database
  // Support cross-repo queries
  // Return aggregated results
}
```

**Kernel Side:**
```typescript
// kernel/src/audit.ts (revised)
interface AuditAdapter {
  log(entry: AuditEntry): Promise<void>;
  // Optionally: stream to platform
}

// After logging locally, optionally stream to platform
if (controlPlaneAdapter) {
  await controlPlaneAdapter.streamAudit(entry);
}
```

**Key Features:**
- Cross-repo audit queries
- Real-time streaming
- Advanced filtering
- Analytics and visualizations

**Value:**
- ✅ Operational visibility
- ✅ Security monitoring
- ✅ Compliance reporting
- ✅ Centralized governance

---

### Phase 4: Centralized Identity Registry (Medium Priority, 6-8 weeks)

**Goal:** Manage identities across multiple repos from one place

**Components:**

1. **Identity Service (Platform)**
   - Central identity database
   - SSO integration (OAuth, SAML)
   - Identity mapping (one identity → multiple repos)

2. **Identity Sync (Platform → Kernels)**
   - Sync identities to repos
   - Automatic API key provisioning
   - Role mapping

3. **Identity Pack (Platform)**
   - `identity.sync` action
   - `identity.map` action
   - `identity.revoke` action (cross-repo)

**Implementation:**

**Platform Side:**
```typescript
// platform/src/identity/service.ts
export async function syncIdentity(identityId: string, kernelId: string) {
  // 1. Get identity from registry
  const identity = await getIdentity(identityId);
  
  // 2. Provision API key in kernel
  await kernelAdapter.createApiKey(kernelId, {
    tenantId: identity.tenantId,
    scopes: identity.scopes,
    name: identity.name
  });
  
  // 3. Map identity → kernel API key
  await mapIdentity(identityId, kernelId, apiKeyId);
}
```

**Kernel Side:**
```typescript
// Kernel already has IAM pack
// Platform uses kernel's iam.keys.create action
// No kernel changes needed
```

**Key Features:**
- Single sign-on across repos
- Centralized user management
- Automatic provisioning
- Cross-repo access control

**Value:**
- ✅ Simplified onboarding
- ✅ Centralized management
- ✅ SSO integration
- ✅ Enterprise features

---

## Key Architectural Changes

### 1. Control Plane Adapter Interface

```typescript
// kernel/src/types.ts
interface ControlPlaneAdapter {
  /**
   * Request authorization from platform
   * Platform is authoritative decision-maker
   */
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
  
  /**
   * Stream audit log to platform (optional)
   */
  streamAudit(entry: AuditEntry): Promise<void>;
  
  /**
   * Check if platform is available
   */
  isAvailable(): Promise<boolean>;
}

interface AuthorizationRequest {
  kernelId: string;
  tenantId: string;
  actor: {
    type: 'api_key' | 'user' | 'service';
    id: string;
  };
  action: string;
  params: Record<string, any>;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    requestId: string;
  };
}

interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  policy?: {
    id: string;
    name: string;
    version: string;
  };
  expiresAt?: string; // Cache TTL
}
```

### 2. Router Integration

```typescript
// kernel/src/router.ts (revised)
export function createManageRouter(config: KernelConfig & { 
  packs: Pack[];
  controlPlaneAdapter?: ControlPlaneAdapter; // Optional
}) {
  return async (req: ManageRequest, meta: RequestMeta) => {
    // ... existing validation ...
    
    // NEW: Authoritative authorization check
    if (config.controlPlaneAdapter) {
      const decision = await config.controlPlaneAdapter.authorize({
        kernelId: config.bindings.kernelId,
        tenantId: authResult.tenantId!,
        actor: {
          type: 'api_key',
          id: authResult.apiKeyId!
        },
        action: req.action,
        params: req.params,
        metadata: {
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          requestId
        }
      });
      
      if (!decision.allowed) {
        await logAudit(auditAdapter, {
          // ... audit entry ...
          result: 'denied',
          errorMessage: decision.reason || 'Policy denied'
        });
        
        return {
          ok: false,
          request_id: requestId,
          error: decision.reason || 'Policy denied',
          code: 'POLICY_DENIED',
          policy: decision.policy
        };
      }
    }
    
    // ... continue with existing flow ...
  };
}
```

### 3. Bindings Extension

```json
{
  "kernel": {
    "id": "ciq-automations-v1",
    "version": "1.0.0"
  },
  "control_plane": {
    "enabled": true,
    "url": "https://platform.example.com",
    "api_key": "${CONTROL_PLANE_API_KEY}",
    "fail_mode": "closed" // or "open"
  },
  // ... existing bindings ...
}
```

## Benefits of Authoritative Model

### 1. **Cannot Be Bypassed**
- Kernel must consult platform
- No local policy drift
- Centralized authority

### 2. **Real-Time Updates**
- Policy changes take effect immediately
- No sync delays
- Instant revocation

### 3. **Enterprise Trust**
- Centralized governance
- Audit trail of all decisions
- Compliance-ready

### 4. **Commercial Viability**
- Hosted platform = recurring revenue
- Strong lock-in (authoritative)
- Strategic infrastructure position

### 5. **Scalability**
- Platform can scale independently
- Kernels remain lightweight
- Distributed enforcement, centralized control

## Conclusion

**The strategic refinement is critical:**

**Without centralized authority:**
- Distributed middleware system
- Useful dev tool
- Advisory policies

**With centralized authority:**
- Control plane infrastructure
- Category-defining platform
- Authoritative governance

**The architecture becomes:**
- **Kernel** = Execution agent (embeddable, portable)
- **Platform** = Decision authority (centralized, authoritative)

**This creates:**
- True control plane infrastructure
- Enterprise-grade governance
- Commercial viability
- Strategic infrastructure position

**Bottom line:** Making the platform authoritative (not just advisory) is the difference between a useful tool and category-defining infrastructure.

---

*Last Updated: January 2025*
*Status: Strategic Refinement - Authoritative Model*
*Version: 2.0*
