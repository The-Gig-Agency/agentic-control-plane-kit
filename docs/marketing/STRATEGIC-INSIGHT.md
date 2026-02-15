# Strategic Insight: Authority vs Advisory

## The Single Most Important Architectural Decision

**Make the platform authoritative, not just advisory.**

## The Distinction

### Advisory Model (Insufficient)
```
Platform → distributes policy → kernels enforce locally
```

**Problems:**
- Policy can drift
- Policy can be bypassed
- Policy becomes advisory
- Distributed middleware system

### Authoritative Model (Required)
```
Kernel → asks platform → platform decides → kernel executes
```

**Benefits:**
- Policy is authoritative
- Policy is enforceable
- Policy cannot be bypassed
- True control plane infrastructure

## Real-World Examples

Every successful control plane uses the authoritative model:

- **Kubernetes**: kubelet (kernel) asks API server (platform) for authorization
- **AWS**: SDKs (kernel) ask AWS control plane (platform) for permissions
- **Stripe**: Client libraries (kernel) ask Stripe platform (control plane) for authorization
- **Terraform**: Providers (kernel) ask Terraform Cloud (platform) for policy decisions

## Implementation

### Kernel Side
```typescript
// Kernel asks platform for authorization
const decision = await controlPlaneAdapter.authorize({
  kernelId: 'ciq-automations-v1',
  tenantId: ctx.tenantId,
  actor: { type: 'api_key', id: ctx.apiKeyId },
  action: req.action,
  params: req.params
});

// Kernel executes only if platform authorizes
if (!decision.allowed) {
  return { ok: false, code: 'POLICY_DENIED', reason: decision.reason };
}
```

### Platform Side
```typescript
// Platform is authoritative decision-maker
export async function authorize(request: AuthorizationRequest) {
  const policies = await loadPolicies(request.kernelId, request.tenantId);
  const decision = evaluatePolicies(policies, request);
  await logAuthorizationDecision(request, decision);
  return decision; // Authoritative decision
}
```

## Why This Matters

**Without centralized authority:**
- Distributed middleware system
- Useful dev tool
- Advisory policies

**With centralized authority:**
- Control plane infrastructure
- Category-defining platform
- Authoritative governance

## Commercial Model

**Free / Open Layer:**
- Kernel (embeddable, framework-agnostic)

**Paid / Enterprise Layer:**
- Control plane platform (hosted)
- Authoritative governance
- Centralized management

**Proven Model:**
- Kubernetes / GKE
- Terraform / Terraform Cloud
- Supabase (open core + hosted)

## Bottom Line

**Making the platform authoritative (not just advisory) is the difference between:**
- A useful dev tool
- Category-defining infrastructure

---

*This is the strategic refinement that transforms the architecture.*
