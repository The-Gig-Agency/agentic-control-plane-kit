# Installation Guide

## Quick Start (Recommended)

**Use the automated installer:**

```bash
npx echelon install
```

The installer will:
- Auto-detect your framework (Django, Express, Supabase)
- Copy kernel into your project
- Generate adapters, endpoint, bindings, and migrations
- Optionally register with Governance Hub (Repo B)

See [installer/README.md](./installer/README.md) for details.

---

## Manual Installation (Advanced)

If you prefer manual installation or need custom setup, follow the steps below.

### Prerequisites

- Node.js 18+ and pnpm/npm/yarn
- TypeScript (for TypeScript projects)
- Your existing database client (Supabase, Prisma, etc.)

### 1. Copy Kit into Repo

```bash
# Option A: Copy folder
cp -r /path/to/agentic-control-plane-kit ./control-plane

# Option B: Git subtree
git subtree add --prefix=control-plane \
  https://github.com/The-Gig-Agency/agentic-control-plane-kit.git main --squash

# Option C: npm package (when published)
npm install @your-org/agentic-control-plane-kit
```

### 2. Create Bindings File

Create `controlplane.bindings.json` in your repo root:

```json
{
  "$schema": "./control-plane/config/bindings.schema.json",
  "tenant": {
    "table": "your_tenants_table",
    "id_column": "id",
    "get_tenant_fn": "get_tenant_id",
    "is_admin_fn": "is_platform_admin"
  },
  "auth": {
    "keys_table": "api_keys",
    "key_prefix": "your_prefix_",
    "prefix_length": 12,
    "key_hash_column": "key_hash",
    "key_prefix_column": "prefix",
    "scopes_column": "scopes"
  },
  "database": {
    "adapter": "supabase",
    "connection_env": "SUPABASE_SERVICE_ROLE_KEY"
  },
  "packs": {
    "enabled": ["iam", "webhooks", "settings", "domain"]
  },
  "domain": {
    "namespace": "domain"
  }
}
```

**This is the only per-repo "truth" an agent needs.** Everything else is inferable.

### 3. Create `/manage` Endpoint Wrapper

Create your framework-specific wrapper:

**Express/Next.js:**
```typescript
// api/manage.ts or pages/api/manage.ts
import { createManageRouter } from './control-plane/kernel';
import { iamPack, webhooksPack, settingsPack } from './control-plane/packs';
import { createAdapters } from './adapters';
import bindings from '../controlplane.bindings.json';

const router = createManageRouter({
  ...createAdapters(),
  bindings,
  packs: [iamPack, webhooksPack, settingsPack, yourDomainPack]
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const response = await router(await req.json(), { request: req });
  res.status(response.status || 200).json(JSON.parse(response.body));
}
```

**Supabase Edge Function:**
```typescript
// supabase/functions/manage/index.ts
import { createManageRouter } from '../control-plane/kernel';
// ... similar setup
```

### 4. Run Tests & Generate OpenAPI

```bash
cd control-plane

# Install dependencies
pnpm install  # or npm/yarn

# Run tests
pnpm test

# Generate OpenAPI spec
pnpm generate:openapi
# Outputs: public/api/openapi.json
```

### 5. Verify Installation

```bash
# Run verify script (ensures invariants)
pnpm verify
```

This checks:
- ✅ All tests pass
- ✅ `meta.actions` includes all enabled packs
- ✅ All actions declare a scope
- ✅ Dry-run actions return impact shape

## What Gets Generated/Inferred

From `controlplane.bindings.json`, the system infers:
- Database adapter implementation
- Tenant resolution logic
- API key validation
- Scope mappings
- Action namespaces

**You only configure bindings. Everything else is automatic.**

## Next Steps

1. Implement adapters (see `INTEGRATION-GUIDE.md`)
2. Create domain pack (see `packs/domain-template/`)
3. Deploy `/manage` endpoint
4. Test with `meta.actions` discovery

## Troubleshooting

**Tests fail?**
- Check bindings file matches your schema
- Verify adapters implement all required interfaces

**OpenAPI generation fails?**
- Ensure all packs are properly exported
- Check action definitions have valid schemas

**Verify script fails?**
- Run `pnpm test` to see specific failures
- Check that all enabled packs are installed
- Verify domain pack follows template structure
