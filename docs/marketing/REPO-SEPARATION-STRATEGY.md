# Repository Separation Strategy

## The Two-Repo Model

Following proven patterns from:
- **Linux**: Kernel vs. Distros
- **Terraform**: Terraform vs. Terraform Cloud
- **Kubernetes**: kubelet vs. Control Plane

### Repo A: `agentic-control-plane-kit` (Kernel)
**Purpose:** Embeddable execution kernel + spec + conformance

### Repo B: `agentic-control-plane-platform` (Platform)
**Purpose:** Governance services + UI + multi-repo management

## Why Separate?

### Different Release Cycles
- **Kernel**: Stability, minimal deps, boring releases, wide compatibility
- **Platform**: Fast iteration, UI churn, integrations, opinionated hosting

### Different Buyers
- **Kernel**: Developers embedding in repos (free/open)
- **Platform**: Organizations managing multiple repos (paid/enterprise)

### Different Risk Profiles
- **Kernel**: Must be stable, portable, framework-agnostic
- **Platform**: Can iterate fast, add features, integrate with services

**Mixing them guarantees pain.**

## What Stays in Kernel Repo

### Core Components

1. **Spec + Envelope Definitions**
   - Request/response envelope
   - Error codes
   - Impact shapes
   - Action definitions

2. **Conformance Tests**
   - Cross-repo compatibility tests
   - Spec validation
   - Invariant tests

3. **Kernel Implementations**
   - TypeScript kernel
   - Python kernel (future)
   - Other language kernels (future)

4. **Adapter Interfaces**
   - `DbAdapter` interface
   - `AuditAdapter` interface
   - `IdempotencyAdapter` interface
   - `RateLimitAdapter` interface
   - `CeilingsAdapter` interface
   - **`ControlPlaneAdapter` interface** (NEW - for platform communication)

5. **Core Packs**
   - `iam/` - API key management
   - `webhooks/` - Webhook management
   - `settings/` - Settings management
   - `domain-template/` - Template for domain packs

6. **Platform Client Adapter (Thin)**
   - HTTP callout to platform
   - `ControlPlaneAdapter` implementation
   - Caching layer
   - Fail-safe modes
   - **Think: "plugin point," not "host the platform here"**

### Kernel Repo Structure

```
agentic-control-plane-kit/
├── kernel/
│   ├── src/
│   │   ├── router.ts          # Main router
│   │   ├── auth.ts            # API key validation
│   │   ├── audit.ts           # Audit hooks
│   │   ├── idempotency.ts    # Idempotency
│   │   ├── rate_limit.ts     # Rate limiting
│   │   ├── ceilings.ts       # Ceilings
│   │   ├── validate.ts       # Schema validation
│   │   ├── openapi.ts        # OpenAPI generation
│   │   ├── pack.ts           # Pack contract
│   │   ├── meta-pack.ts      # Meta pack
│   │   ├── types.ts          # All interfaces
│   │   └── control-plane-adapter.ts  # NEW: Platform client
│   └── index.ts
├── packs/
│   ├── iam/                  # Core pack
│   ├── webhooks/             # Core pack
│   ├── settings/             # Core pack
│   └── domain-template/      # Template
├── config/
│   ├── bindings.schema.json  # Spec
│   └── example.bindings.json
├── tests/
│   ├── invariants.spec.ts    # Conformance tests
│   └── kernel.spec.ts
├── docs/
│   └── spec/                 # Specification docs
└── README.md
```

## What Goes in Platform Repo

### Governance Services

1. **Authoritative Policy Service**
   - Decision API (`POST /authorize`)
   - Policy evaluation engine
   - Policy storage
   - Policy versioning

2. **Policy Authoring UI**
   - Visual policy editor
   - Policy templates
   - Policy testing
   - Policy version management

3. **Audit Lake + Query API**
   - Centralized audit log storage
   - Query API (`POST /audit/query`)
   - Aggregation service
   - Real-time streaming

4. **Audit Dashboards**
   - Search interface
   - Filtering
   - Visualizations
   - Export functionality

5. **Identity Registry**
   - Central identity database
   - SSO integration (OAuth, SAML)
   - Identity mapping
   - Cross-repo identity sync

6. **Revocation System**
   - Emergency revocation API
   - Bulk revocation
   - Scheduled revocation
   - Revocation alerts

7. **Multi-Kernel Inventory**
   - Kernel registration
   - Version tracking
   - Health monitoring
   - "Which repos are running which kernel version?"

8. **Connectors & Integrations**
   - Slack integration
   - Microsoft Teams integration
   - SIEM connectors (Splunk, Datadog, etc.)
   - PagerDuty integration
   - Webhook sinks
   - Email notifications

### Platform Repo Structure

```
agentic-control-plane-platform/
├── services/
│   ├── authorization/        # Policy service
│   ├── audit/                # Audit lake
│   ├── identity/             # Identity registry
│   ├── revocation/           # Revocation system
│   └── inventory/            # Kernel inventory
├── ui/
│   ├── policy-editor/        # Policy authoring UI
│   ├── audit-viewer/          # Audit dashboards
│   ├── identity-manager/      # Identity management UI
│   └── dashboard/            # Main dashboard
├── connectors/
│   ├── slack/
│   ├── teams/
│   ├── siem/
│   └── webhooks/
├── api/
│   ├── authorize.ts          # Authorization endpoint
│   ├── audit-query.ts        # Audit query endpoint
│   └── ...
├── adapters/
│   └── kernel-client.ts      # Client to communicate with kernels
└── README.md
```

## The Thin Platform Client in Kernel

### ControlPlaneAdapter Interface

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
```

### HTTP Implementation

```typescript
// kernel/src/adapters/control-plane-http.ts
export class HttpControlPlaneAdapter implements ControlPlaneAdapter {
  constructor(
    private platformUrl: string,
    private apiKey: string,
    private cache?: Cache
  ) {}
  
  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    // Check cache first
    const cacheKey = this.getCacheKey(request);
    const cached = await this.cache?.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.decision;
    }
    
    // Call platform
    const response = await fetch(`${this.platformUrl}/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(request)
    });
    
    const decision = await response.json();
    
    // Cache decision
    if (decision.expiresAt) {
      await this.cache?.set(cacheKey, decision, decision.expiresAt);
    }
    
    return decision;
  }
  
  async streamAudit(entry: AuditEntry): Promise<void> {
    // Fire-and-forget streaming to platform
    fetch(`${this.platformUrl}/audit/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(entry)
    }).catch(err => {
      // Log error but don't fail request
      console.error('Failed to stream audit to platform:', err);
    });
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.platformUrl}/health`, {
        method: 'GET',
        timeout: 1000
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**Key Points:**
- Thin HTTP client only
- No platform logic in kernel
- Caching for performance
- Fail-safe modes
- Fire-and-forget audit streaming

## Dependency Relationship

```
┌─────────────────────────────────────────┐
│  agentic-control-plane-platform         │
│  (Platform Repo)                        │
│                                          │
│  - Uses kernel types/interfaces          │
│  - Implements platform services         │
│  - Provides UI and integrations          │
└──────────────────┬──────────────────────┘
                   │
                   │ Implements interfaces from
                   │
                   ▼
┌─────────────────────────────────────────┐
│  agentic-control-plane-kit              │
│  (Kernel Repo)                          │
│                                          │
│  - Defines interfaces                   │
│  - Provides kernel implementation       │
│  - Includes thin platform client        │
│  - No platform dependencies             │
└─────────────────────────────────────────┘
```

**Platform depends on kernel** (for types/interfaces)
**Kernel is independent** (can work without platform)

## Release Cycles

### Kernel Releases
- **Frequency**: Quarterly or as needed
- **Focus**: Stability, compatibility, bug fixes
- **Breaking changes**: Rare, well-documented
- **Versioning**: Semantic (major.minor.patch)

### Platform Releases
- **Frequency**: Weekly or bi-weekly
- **Focus**: Features, UI improvements, integrations
- **Breaking changes**: More frequent, but isolated to platform
- **Versioning**: Can be more flexible

## Commercial Model

### Kernel Repo
- **License**: MIT (open source)
- **Distribution**: npm, GitHub
- **Buyers**: Developers embedding in repos
- **Revenue**: None (free)

### Platform Repo
- **License**: Proprietary (or open core)
- **Distribution**: Hosted SaaS or self-hosted
- **Buyers**: Organizations managing multiple repos
- **Revenue**: Subscription-based

## Migration Path

### Phase 1: Kernel Repo (Current)
- ✅ Kernel implementation
- ✅ Core packs
- ✅ Adapter interfaces
- ⏳ Add `ControlPlaneAdapter` interface
- ⏳ Add thin HTTP client implementation

### Phase 2: Platform Repo (New)
- Create new repo: `agentic-control-plane-platform`
- Implement authorization service
- Build policy authoring UI
- Create audit lake
- Add identity registry
- Build connectors

### Phase 3: Integration
- Kernels connect to platform via HTTP
- Platform uses kernel types/interfaces
- Both repos evolve independently

## Benefits of Separation

1. **Independent Evolution**
   - Kernel can remain stable
   - Platform can iterate fast
   - No forced coupling

2. **Clear Ownership**
   - Kernel = execution layer
   - Platform = governance layer
   - Clear boundaries

3. **Different Audiences**
   - Kernel = developers
   - Platform = operations/security teams

4. **Commercial Flexibility**
   - Kernel = free/open
   - Platform = paid/enterprise

5. **Risk Isolation**
   - Platform changes don't affect kernel
   - Kernel stability doesn't block platform features

## Conclusion

**Separate repos = correct architecture**

- **Kernel repo**: Stable, embeddable, framework-agnostic
- **Platform repo**: Fast iteration, UI, integrations, governance

This follows proven patterns from Kubernetes, Terraform, and Linux.

**Next Steps:**
1. Add `ControlPlaneAdapter` interface to kernel
2. Add thin HTTP client implementation
3. Create platform repo
4. Implement authoritative services
5. Build UI and integrations

---

*Last Updated: February 2026*
*Status: Architecture Decision*
