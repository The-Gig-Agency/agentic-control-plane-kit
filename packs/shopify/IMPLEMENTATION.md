# Shopify Pack Implementation

## Summary

The Shopify Pack has been implemented in Repo A (`agentic-control-plane-kit`) with the following features:

1. **ShopifyExecutorAdapter** - Calls CIQ Automations (CIA) endpoints, not Shopify directly
2. **Authorization Integration** - Calls Governance Hub `/authorize` before write actions
3. **Audit Event Emission** - Emits audit events to Governance Hub with `integration="shopify"`, `pack="shopify"`
4. **10 Actions** - Products and Orders CRUD operations

## Files Created

### Core Adapters
- `kernel/src/control-plane-adapter.ts` - Interface and HTTP implementation for calling Governance Hub `/authorize`
- `kernel/src/executor-adapter.ts` - Interface and HTTP implementation for calling CIA executor endpoints

### Shopify Pack
- `packs/shopify/actions.ts` - 10 action definitions (products and orders)
- `packs/shopify/handlers.ts` - Handler implementations with authorization and audit
- `packs/shopify/index.ts` - Pack export
- `packs/shopify/README.md` - Documentation
- `packs/shopify/IMPLEMENTATION.md` - This file

### Router Updates
- `kernel/src/router.ts` - Updated to inject `executor` and `controlPlane` adapters into ActionContext

## Architecture Flow

```
Agent Request
  ↓
Kernel Router
  ↓
Shopify Pack Handler
  ↓
[Write Action?] → Yes → Governance Hub /authorize
  ↓                              ↓
  │                        {decision: 'allow'|'deny'}
  │                              ↓
  └──────────────────────────────┘
  ↓
CIA Executor (HttpExecutorAdapter)
  ↓
POST /api/tenants/{tenantId}/shopify/products.create
  ↓
CIA loads token from Vault → Shopify Admin GraphQL
  ↓
CIA returns sanitized results + resource IDs
  ↓
Shopify Pack Handler
  ↓
Emit Audit Event to Governance Hub
  (integration="shopify", pack="shopify", result_meta)
```

## Authorization Flow

For **write actions** (create, update, delete, cancel):

1. Handler calls `authorizeWriteAction()`
2. Creates `request_hash` from sanitized, canonical JSON of params
3. Extracts `params_summary` (small subset for policy evaluation)
4. Calls Governance Hub `/authorize` with:
   ```typescript
   {
     kernelId: bindings.kernelId,
     tenantId: ctx.tenantId,
     actor: { type: 'api_key', id: ctx.apiKeyId },
     action: 'shopify.products.create',
     request_hash: 'abc123...',
     params_summary: { title: 'Product Name', vendor: 'Vendor' },
     params_summary_schema_id: 'shopify-v1'
   }
   ```
5. If `decision === 'deny'` → Emit audit event with `status: 'denied'` and throw error
6. If `decision === 'allow'` → Proceed to executor
7. After execution → Emit audit event with `policy_decision_id` linking to authorization

## Audit Event Format

All actions emit audit events with:

```typescript
{
  event_id: UUID,
  integration: bindings.integration,  // e.g., "ciq-automations"
  pack: "shopify",
  action: "shopify.products.create",
  status: "success" | "error" | "denied",
  policy_decision_id: "decision-uuid",  // Links to GH authorization
  result_meta: {
    resource_type: "shopify_product",
    resource_id: "product_123",
    count: 1,
    ids_created: ["product_123"]
  },
  request_hash: "sha256-hash-of-sanitized-params",
  // ... other fields
}
```

## Usage Example

```typescript
import { createManageRouter } from './kernel/src/router';
import { shopifyPack } from './packs/shopify';
import { HttpExecutorAdapter } from './kernel/src/executor-adapter';
import { HttpControlPlaneAdapter } from './kernel/src/control-plane-adapter';

const executor = new HttpExecutorAdapter({
  executorUrl: process.env.CIA_EXECUTOR_URL,
  apiKey: process.env.CIA_API_KEY,
});

const controlPlane = new HttpControlPlaneAdapter({
  platformUrl: process.env.GOVERNANCE_HUB_URL,
  kernelApiKey: process.env.ACP_KERNEL_KEY,
});

const router = createManageRouter({
  dbAdapter,
  auditAdapter,
  idempotencyAdapter,
  rateLimitAdapter,
  ceilingsAdapter,
  bindings: {
    integration: 'ciq-automations',
    kernelId: 'ciq-automations-kernel',
    // ... other bindings
  },
  packs: [iamPack, webhooksPack, settingsPack, shopifyPack],
  executor,  // Inject executor adapter
  controlPlane,  // Inject control plane adapter
});
```

## Next Steps for CIQ Automations Repo

1. **Add Shopify Endpoints** - Implement the 10 endpoints expected by the pack:
   - `POST /api/tenants/{tenantId}/shopify/products.list`
   - `POST /api/tenants/{tenantId}/shopify/products.get`
   - `POST /api/tenants/{tenantId}/shopify/products.create`
   - `POST /api/tenants/{tenantId}/shopify/products.update`
   - `POST /api/tenants/{tenantId}/shopify/products.delete`
   - `POST /api/tenants/{tenantId}/shopify/orders.list`
   - `POST /api/tenants/{tenantId}/shopify/orders.get`
   - `POST /api/tenants/{tenantId}/shopify/orders.create`
   - `POST /api/tenants/{tenantId}/shopify/orders.cancel`

2. **Vault Integration** - Load Shopify tokens from Supabase Vault using pointer in `brands` table

3. **Shopify GraphQL** - Call Shopify Admin GraphQL API with the token

4. **Sanitization** - Return only sanitized results + resource IDs (never tokens)

5. **Response Format** - Return responses in format expected by `ExecutorResponse`:
   ```typescript
   {
     data: { ... },
     resource_ids: ["product_123"],
     resource_type: "shopify_product",
     count: 1
   }
   ```

## Testing

To test the pack:

1. Set up Governance Hub with test policies
2. Set up CIA executor with test endpoints
3. Configure router with both adapters
4. Make agent requests to `shopify.products.create`
5. Verify:
   - Authorization call to Governance Hub
   - Executor call to CIA
   - Audit event emission to Governance Hub
