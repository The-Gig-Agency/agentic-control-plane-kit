# Shopify Pack

The Shopify Pack provides agentic actions for managing Shopify products and orders through CIQ Automations (CIA) endpoints.

## Architecture

```
Agent → Kernel → Governance Hub /authorize → Kernel → CIA Executor → Shopify
                ↑                                    ↓
                └──────── Audit Events ──────────────┘
```

## Features

- **Authorization**: All write actions call Governance Hub `/authorize` before execution
- **Audit Logging**: All actions emit audit events to Governance Hub with `integration="shopify"`, `pack="shopify"`
- **Executor Pattern**: Calls CIA endpoints (not Shopify directly)
- **Sanitization**: Request payloads are sanitized before hashing/logging

## Actions

### Products
- `shopify.products.list` - List products (read)
- `shopify.products.get` - Get product by ID (read)
- `shopify.products.create` - Create product (write, requires authorization)
- `shopify.products.update` - Update product (write, requires authorization)
- `shopify.products.delete` - Delete product (write, requires authorization)

### Orders
- `shopify.orders.list` - List orders (read)
- `shopify.orders.get` - Get order by ID (read)
- `shopify.orders.create` - Create order (write, requires authorization)
- `shopify.orders.cancel` - Cancel order (write, requires authorization)

## Setup

### 1. Add to Router Config

```typescript
import { shopifyPack } from './packs/shopify';
import { HttpExecutorAdapter } from './kernel/src/executor-adapter';
import { HttpControlPlaneAdapter } from './kernel/src/control-plane-adapter';

const executor = new HttpExecutorAdapter({
  executorUrl: process.env.CIA_EXECUTOR_URL || 'https://ciq-automations.example.com',
  apiKey: process.env.CIA_API_KEY,
});

const controlPlane = new HttpControlPlaneAdapter({
  platformUrl: process.env.GOVERNANCE_HUB_URL || 'https://governance-hub.example.com',
  kernelApiKey: process.env.ACP_KERNEL_KEY,
});

const router = createManageRouter({
  // ... other config
  packs: [iamPack, webhooksPack, settingsPack, shopifyPack],
  // Inject adapters into context
  meta: {
    executor,
    controlPlane,
  },
});
```

### 2. Environment Variables

```bash
# CIQ Automations Executor
CIA_EXECUTOR_URL=https://ciq-automations.example.com
CIA_API_KEY=your_cia_api_key

# Governance Hub
GOVERNANCE_HUB_URL=https://governance-hub.example.com
ACP_KERNEL_KEY=acp_kernel_xxxxx
```

### 3. Update Bindings

Add `kernelId` to your `controlplane.bindings.json`:

```json
{
  "kernelId": "ciq-automations-kernel",
  "integration": "ciq-automations",
  // ... other bindings
}
```

## CIA Endpoints Required

The pack expects CIA to provide these endpoints:

- `POST /api/tenants/{tenantId}/shopify/products.list`
- `POST /api/tenants/{tenantId}/shopify/products.get`
- `POST /api/tenants/{tenantId}/shopify/products.create`
- `POST /api/tenants/{tenantId}/shopify/products.update`
- `POST /api/tenants/{tenantId}/shopify/products.delete`
- `POST /api/tenants/{tenantId}/shopify/orders.list`
- `POST /api/tenants/{tenantId}/shopify/orders.get`
- `POST /api/tenants/{tenantId}/shopify/orders.create`
- `POST /api/tenants/{tenantId}/shopify/orders.cancel`

CIA should:
- Load Shopify token from Vault (pointer in brands table)
- Call Shopify Admin GraphQL API
- Return sanitized results + resource IDs
- Never return tokens or sensitive data

## Authorization Flow

1. Agent requests `shopify.products.create`
2. Kernel calls Governance Hub `/authorize` with:
   - `kernelId`, `tenantId`, `actor`, `action`
   - `request_hash` (SHA-256 of sanitized params)
   - `params_summary` (small subset for policy evaluation)
3. Governance Hub evaluates policies and returns:
   - `decision: 'allow' | 'deny' | 'require_approval'`
   - `decision_id`, `policy_id`, `reason`
4. If allowed, kernel calls CIA executor
5. Kernel emits audit event to Governance Hub with:
   - `integration="shopify"`, `pack="shopify"`
   - `result_meta` from CIA response
   - `policy_decision_id` linking to authorization

## Audit Events

All actions emit audit events with:
- `integration`: From bindings (e.g., "ciq-automations")
- `pack`: "shopify"
- `action`: Full action name (e.g., "shopify.products.create")
- `status`: "success" | "error" | "denied"
- `policy_decision_id`: Links to Governance Hub authorization decision
- `result_meta`: Resource type, IDs, counts from CIA response
