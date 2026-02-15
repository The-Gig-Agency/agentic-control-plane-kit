# Kernel Architecture Confirmation

## ✅ Confirmed: True Kernel Approach

The repository follows a **pure kernel architecture** with clear separation of concerns.

## Three-Layer Architecture

### 1. Kernel (Invariant, Framework-Agnostic) ✅

**Location:** `kernel/`

**Characteristics:**
- ✅ **Framework-agnostic**: Uses interfaces, not concrete implementations
- ✅ **No hardcoded dependencies**: No Supabase, Prisma, or framework-specific code
- ✅ **Pure functions**: `createManageRouter()` is a pure function
- ✅ **Interface-based**: All adapters are interfaces (`DbAdapter`, `AuditAdapter`, etc.)

**Core Components:**
- `router.ts` - Main `/manage` router (pure function)
- `auth.ts` - API key validation (delegates to adapter)
- `audit.ts` - Audit logging (delegates to adapter)
- `idempotency.ts` - Idempotency cache (delegates to adapter)
- `rate_limit.ts` - Rate limiting (delegates to adapter)
- `ceilings.ts` - Hard ceilings (delegates to adapter)
- `validate.ts` - Schema validation (pure)
- `openapi.ts` - OpenAPI generation (pure)
- `pack.ts` - Pack contract and merging
- `meta-pack.ts` - Built-in meta pack
- `types.ts` - All interfaces and types

**Key Interfaces:**
```typescript
interface DbAdapter {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: any[]): Promise<T | null>;
  // ... framework-agnostic methods
}

interface AuditAdapter {
  log(entry: AuditEntry): Promise<void>;
}

interface IdempotencyAdapter {
  getReplay(...): Promise<any | null>;
  storeReplay(...): Promise<void>;
}
// ... etc
```

**No Framework Dependencies:**
- ❌ No `@supabase/supabase-js` imports in kernel
- ❌ No `@prisma/client` imports in kernel
- ❌ No framework-specific code in kernel
- ✅ Only TypeScript interfaces and pure logic

### 2. Packs (Swappable Modules) ✅

**Location:** `packs/`

**Characteristics:**
- ✅ **Swappable**: Install/uninstall packs independently
- ✅ **Self-contained**: Each pack exports `actions` and `handlers`
- ✅ **Generic**: Handlers use adapter interfaces, not direct DB calls
- ✅ **Validated**: Pack contract ensures no duplicates

**Universal Packs:**
- `iam/` - API keys, teams (almost universal)
- `webhooks/` - Webhook management (almost universal)
- `settings/` - Configuration (common)
- `domain-template/` - Template for repo-specific packs

**Pack Contract:**
```typescript
interface Pack {
  name: string;
  actions: ActionDef[];
  handlers: Record<string, ActionHandler>;
}
```

**Handler Pattern:**
```typescript
// Handlers receive context with adapters, not direct DB access
async function handleAction(params, ctx: ActionContext) {
  // Use ctx.db (adapter interface), not direct DB client
  const keys = await ctx.db.listApiKeys(ctx.tenantId);
  // ...
}
```

### 3. Bindings (Repo-Specific Configuration) ✅

**Location:** `controlplane.bindings.json` (per-repo)

**Characteristics:**
- ✅ **Single source of truth**: One JSON file per repo
- ✅ **Deterministic**: Everything else is inferable
- ✅ **Minimal**: Only repo-specific mappings

**Required Fields:**
- Tenant model (table, id_column, admin check)
- API key model (table, hash_col, prefix_len, scopes_col)
- Database adapter type + connection env vars
- Packs enabled (iam, webhooks, settings, domain)
- Domain namespace

**Example:**
```json
{
  "tenant": { "table": "brands", "id_column": "id", ... },
  "auth": { "keys_table": "api_keys", "key_prefix": "ock_", ... },
  "database": { "adapter": "supabase", "connection_env": "SUPABASE_SERVICE_ROLE_KEY" },
  "packs": { "enabled": ["iam", "webhooks", "settings", "domain"] },
  "domain": { "namespace": "domain" }
}
```

## Framework-Agnostic Design ✅

### Adapter Pattern

The kernel defines **interfaces**, not implementations:

```typescript
// Kernel defines interface
interface DbAdapter {
  listApiKeys(tenantId: string): Promise<ApiKey[]>;
  createApiKey(tenantId: string, data: CreateApiKeyData): Promise<ApiKey>;
  // ... all pack-specific methods
}

// Repo implements adapter
class SupabaseDbAdapter implements DbAdapter {
  async listApiKeys(tenantId: string) {
    // Supabase-specific implementation
  }
}

class PrismaDbAdapter implements DbAdapter {
  async listApiKeys(tenantId: string) {
    // Prisma-specific implementation
  }
}
```

### No Framework Dependencies in Kernel

**Kernel dependencies:**
- ✅ TypeScript types
- ✅ Pure utility functions
- ❌ No database clients
- ❌ No framework libraries
- ❌ No ORMs

**Host repo provides:**
- Adapter implementations
- Database client
- Framework-specific HTTP handler

## Verification ✅

### Kernel Purity Check

```bash
# Check kernel has no framework imports
grep -r "@supabase\|@prisma\|drizzle" kernel/
# Should return nothing (or only in comments/docs)
```

### Pack Swappability Check

```bash
# Packs can be installed/uninstalled independently
# See: controlplane.bindings.json -> packs.enabled
```

### Bindings Determinism Check

```bash
# Single source of truth
ls controlplane.bindings.json
# Everything else is inferable from this file
```

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│  Kernel (invariant, framework-agnostic) │
│  - router.ts (pure function)            │
│  - auth.ts (interface-based)           │
│  - audit.ts (interface-based)          │
│  - types.ts (interfaces only)           │
│  - No framework dependencies            │
├─────────────────────────────────────────┤
│  Packs (swappable modules)              │
│  - iam/ (uses ctx.db adapter)          │
│  - webhooks/ (uses ctx.db adapter)     │
│  - settings/ (uses ctx.db adapter)      │
│  - domain-template/ (repo-specific)     │
├─────────────────────────────────────────┤
│  Bindings (repo-specific config)         │
│  - controlplane.bindings.json           │
│  - Single source of truth               │
│  - Everything else inferable            │
└─────────────────────────────────────────┘
```

## Confirmation Checklist

- [x] Kernel is framework-agnostic (interfaces only)
- [x] Kernel has no hardcoded framework dependencies
- [x] Packs are swappable (install/uninstall independently)
- [x] Packs use adapter interfaces, not direct DB
- [x] Bindings are minimal and deterministic
- [x] Single source of truth (controlplane.bindings.json)
- [x] Pure functions in kernel (createManageRouter)
- [x] Clear separation of concerns (Kernel/Packs/Bindings)

## ✅ Confirmed: True Kernel Architecture

The repository follows a **pure kernel approach** where:
1. **Kernel** = Invariant, framework-agnostic core
2. **Packs** = Swappable domain modules
3. **Bindings** = Repo-specific configuration

This architecture ensures:
- ✅ Portability across frameworks (Supabase, Prisma, Django, etc.)
- ✅ Reusability of packs across repos
- ✅ Deterministic installs (one bindings file)
- ✅ Agent-friendly (clear contracts, self-discovery)
