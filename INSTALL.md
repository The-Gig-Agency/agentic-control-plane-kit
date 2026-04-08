# Installation Guide

**Config migration:** If you use `controlplane.bindings.json` today, see [docs/MIGRATION-CONTROLPLANE-BINDINGS-TO-ECHELON-CONFIG.md](./docs/MIGRATION-CONTROLPLANE-BINDINGS-TO-ECHELON-CONFIG.md) for the path to `echelon.config.ts`.

## Quick start (recommended)

**Preferred path: use the Echelon CLI installer** (requires **Node 20+** on the machine running `npx`; see [`package.json`](./package.json) `engines`).

```bash
npx --package agentic-control-plane-kit echelon install
```

The installer will:
- Auto-detect your framework (Django, Express, Supabase)
- Copy kernel into your project
- Generate adapters, endpoint, bindings, and migrations
- Optionally register with hosted governance / registration (when configured)

See [installer/README.md](./installer/README.md) for details.
For installer ownership boundaries and readiness gates, see [installer/INSTALLER-V2-CONTRACT.md](./installer/INSTALLER-V2-CONTRACT.md).

**Hybrid Netlify + Supabase (SDR-like):** copy or study [examples/golden-hybrid-sdr-like](./examples/golden-hybrid-sdr-like/) and [docs/GOLDEN-HYBRID-REFERENCE.md](./docs/GOLDEN-HYBRID-REFERENCE.md).

---

## Manual Installation (Advanced)

> **Preferred path:** use `npx echelon init` (or legacy `echelon install`) so the kit scaffolds adapters, endpoints, and migrations. The sections below are for **custom embedding** when you are not using the installer.

If you prefer manual installation or need custom setup, follow the steps below.

### Prerequisites

- **Node.js 20.x** (matches `package.json` `engines.node`; do not use Node 18 — installs and CI are validated on 20+)
- npm 10+ (or pnpm/yarn, if you align versions yourself)
- TypeScript (for TypeScript projects)
- Your existing database client (Prisma, Drizzle, Supabase, etc.) **where you implement adapters**

**Peer dependency `@supabase/supabase-js`:** the package lists it as an **optional** peer. Install it in your app when you:
- call Supabase from your **own** adapter code, or
- follow examples that use `createClient` from `@supabase/supabase-js`, or
- use installer output that imports it (Express / hybrid templates often add it to your `package.json`).

You do **not** need it for Django-only or generic SQL adapter flows that never import Supabase.

### 1. Copy Kit into Repo

```bash
# Option A: Copy folder
cp -r /path/to/agentic-control-plane-kit ./control-plane

# Option B: Git subtree
git subtree add --prefix=control-plane \
  https://github.com/The-Gig-Agency/agentic-control-plane-kit.git main --squash

# Option C: npm package install (advanced)
npm install agentic-control-plane-kit
```

The published CLI binary is exposed as `echelon`, but the package name remains
`agentic-control-plane-kit`. For one-off CLI use without a global install, prefer:

```bash
npx --package agentic-control-plane-kit echelon install
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

**Bindings are the primary static config** an agent or operator edits (table/column names, pack list, adapter *kind*). They do **not** replace code: you still wire **DbAdapter**, **AuditAdapter**, and related interfaces (or use installer-generated scaffolding and then customize).

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

## What bindings drive vs what you still implement

From `controlplane.bindings.json` (and the public `echelon.config.ts` bridge), the kernel **reads**:

- Which **packs** are enabled and how **scopes** map to actions  
- **Schema-level hints**: table/column names for tenants, API keys, and the declared DB adapter *type* (e.g. `supabase`)

The host application **still provides**:

- **Adapter implementations** (queries, transactions, audit persistence, idempotency, rate limits, ceilings) — unless you rely on **installer-generated** files and then replace bootstrap/in-memory pieces for production  
- **HTTP wiring** for `/manage` (unless the installer emitted it)  
- **Operational env** (DB URLs, service keys, governance URLs) as required by your stack

**Installer scaffolds** default adapters and migrations for supported frameworks; **manual** flows assume you create adapters yourself. Neither path removes the need to align adapters with your real persistence and security model.

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
