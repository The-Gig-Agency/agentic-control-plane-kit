# Repo C Extraction Guide: CIA Key Vault + Executor

## Overview

This guide walks through extracting the CIA (Key Vault + Executor) functionality from CIQ Automations into a **clean, standalone Repo C** project.

## Architecture Goal

```
┌─────────────────────────────────────┐
│  CIQ Automations (SaaS Example)    │
│  - Repo A deployed: /manage         │
│  - Calls Repo C for execution       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Repo C: CIA (New Clean Project)   │
│  - Key Vault + Executor             │
│  - Serves ALL Repo A instances      │
└─────────────────────────────────────┘
              ↑
┌─────────────────────────────────────┐
│  Leadscore (SaaS Example)           │
│  - Repo A deployed: /manage         │
│  - Calls Repo C for execution       │
└─────────────────────────────────────┘
```

---

## Part 1: Create New Repo C Project in Lovable

### Step 1.1: Create Lovable Project

1. Go to Lovable
2. Create new project
3. **Project Type**: React + Supabase
4. **Name**: `cia-executor` or `key-vault-executor`
5. **Description**: "Key Vault + Executor service for Agent Starter Kit"

### Step 1.2: Connect Supabase

1. In Lovable, connect to Supabase
2. Create new Supabase project (or use existing)
3. Note your Supabase URL and keys

---

## Part 2: What to Extract from CIQ Automations

### Files to Move to Repo C

#### 2.1 Database Migration
**From:** `ciq-automations/supabase/migrations/20260217000000_add_cia_executor_tables.sql`
**To:** `repo-c/supabase/migrations/001_initial_schema.sql`

**What it contains:**
- `cia_service_keys` table
- `action_allowlist` table
- Integration secret name columns (if needed in Repo C)

**Note:** Repo C doesn't need `brands` table - it's tenant-agnostic. We'll pass `tenant_id` from Repo A.

#### 2.2 Executor Endpoint
**From:** `ciq-automations/supabase/functions/execute/`
**To:** `repo-c/supabase/functions/execute/`

**Files to move:**
- `index.ts` - Main endpoint
- `lib/auth.ts` - Service key authentication
- `lib/integration-handlers.ts` - Integration handlers
- `lib/secret-resolver.ts` - Secret name resolver
- `README.md` - Documentation

#### 2.3 Documentation
**From:** `ciq-automations/CIA-EXECUTOR-PLAN.md`
**To:** `repo-c/README.md` (consolidate into main README)

**From:** `ciq-automations/INTEGRATION-CHECKLIST.md`
**To:** `repo-c/INTEGRATION-GUIDE.md` (update for new architecture)

---

## Part 3: What to Keep in CIQ Automations

### Keep (CIQ Automations Specific)

1. **`/manage` endpoint** (`supabase/functions/manage/`)
   - This is Repo A deployed in CIQ Automations
   - Should call Repo C for execution

2. **CIQ Domain Pack** (`supabase/functions/manage/ciq-*.ts`)
   - CIQ-specific actions
   - Part of Repo A deployment

3. **Brands table and CIQ-specific tables**
   - These are CIQ Automations domain data
   - Not part of Repo C

4. **CIQ-specific Edge Functions**
   - All existing CIQ functions stay
   - Repo C only handles executor calls

### Remove from CIQ Automations

1. **`/api/execute` endpoint** → Move to Repo C
2. **`cia_service_keys` table** → Move to Repo C
3. **`action_allowlist` table** → Move to Repo C
4. **Executor-related documentation** → Move to Repo C

---

## Part 4: Repo C Database Schema

### New Schema (Repo C)

```sql
-- File: repo-c/supabase/migrations/001_initial_schema.sql

-- 1. CIA Service Keys
-- Stores service credentials for Repo A instances to authenticate
CREATE TABLE cia_service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- HMAC-SHA-256(PEPPER, key)
  organization_id UUID,  -- Optional: for multi-org
  allowed_tenant_ids UUID[],  -- Optional: restrict to specific tenants
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_cia_service_keys_hash ON cia_service_keys(key_hash) WHERE status = 'active';
CREATE INDEX idx_cia_service_keys_org ON cia_service_keys(organization_id) WHERE status = 'active';
CREATE INDEX idx_cia_service_keys_tenant ON cia_service_keys USING GIN(allowed_tenant_ids) WHERE status = 'active';

-- 2. Action Allowlist
-- Whitelist of allowed actions per integration
CREATE TABLE action_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration TEXT NOT NULL,
  action TEXT NOT NULL,
  action_version TEXT DEFAULT 'v1',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration, action)
);

CREATE INDEX idx_action_allowlist_integration ON action_allowlist(integration) WHERE enabled = TRUE;
CREATE INDEX idx_action_allowlist_action ON action_allowlist(action) WHERE enabled = TRUE;

-- 3. Tenant Integrations (NEW - tracks which tenants have which integrations)
-- This replaces the brands table dependency
CREATE TABLE tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,  -- UUID or string from calling service
  integration TEXT NOT NULL,  -- 'shopify', 'ciq', 'leadscore'
  secret_name TEXT NOT NULL,  -- Name of secret in Supabase Vault
  metadata JSONB,  -- Additional config (e.g., shopify_store_url)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, integration)
);

CREATE INDEX idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX idx_tenant_integrations_integration ON tenant_integrations(integration);

-- Enable RLS
ALTER TABLE cia_service_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service role can access all)
CREATE POLICY "Service role can manage cia_service_keys"
  ON cia_service_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage action_allowlist"
  ON action_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tenant_integrations"
  ON tenant_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed initial allowlist
INSERT INTO action_allowlist (integration, action, action_version) VALUES
  -- Shopify
  ('shopify', 'products.list', 'v1'),
  ('shopify', 'products.get', 'v1'),
  ('shopify', 'products.create', 'v1'),
  ('shopify', 'products.update', 'v1'),
  ('shopify', 'products.delete', 'v1'),
  ('shopify', 'orders.list', 'v1'),
  ('shopify', 'orders.get', 'v1'),
  ('shopify', 'orders.create', 'v1'),
  ('shopify', 'orders.cancel', 'v1'),
  -- CIQ
  ('ciq', 'publishers.list', 'v1'),
  ('ciq', 'publishers.get', 'v1'),
  ('ciq', 'publishers.search', 'v1'),
  ('ciq', 'publishers.getContact', 'v1'),
  ('ciq', 'campaigns.list', 'v1'),
  ('ciq', 'campaigns.get', 'v1'),
  ('ciq', 'campaigns.create', 'v1'),
  ('ciq', 'campaigns.update', 'v1'),
  ('ciq', 'campaigns.delete', 'v1'),
  ('ciq', 'lists.list', 'v1'),
  ('ciq', 'lists.get', 'v1'),
  ('ciq', 'lists.create', 'v1'),
  ('ciq', 'lists.update', 'v1'),
  ('ciq', 'lists.delete', 'v1'),
  ('ciq', 'workflows.list', 'v1'),
  ('ciq', 'workflows.get', 'v1'),
  ('ciq', 'workflows.run', 'v1'),
  ('ciq', 'messaging.send', 'v1'),
  -- LeadScore
  ('leadscore', 'leads.list', 'v1'),
  ('leadscore', 'leads.get', 'v1'),
  ('leadscore', 'leads.create', 'v1'),
  ('leadscore', 'leads.update', 'v1')
ON CONFLICT (integration, action) DO NOTHING;
```

**Key Changes:**
- Removed `brands` table dependency
- Added `tenant_integrations` table to track tenant → integration → secret mappings
- Repo C is now tenant-agnostic (receives `tenant_id` from Repo A)

---

## Part 5: Update Executor Endpoint for Repo C

### Changes Needed

1. **Remove brands table dependency**
   - Use `tenant_integrations` table instead
   - Look up secret name by `tenant_id` + `integration`

2. **Update secret resolver**
   - Query `tenant_integrations` instead of `brands`
   - Get `secret_name` from that table

3. **Update integration handlers**
   - CIQ handler can still call CIQ Automations if needed
   - Or call external APIs directly

### Updated Secret Resolver

```typescript
// repo-c/supabase/functions/execute/lib/secret-resolver.ts

export async function resolveSecretName(
  supabase: any,
  tenantId: string,
  integration: string
): Promise<{ secretName: string; metadata?: any } | null> {
  const { data: tenantIntegration } = await supabase
    .from('tenant_integrations')
    .select('secret_name, metadata')
    .eq('tenant_id', tenantId)
    .eq('integration', integration)
    .single();

  if (!tenantIntegration) {
    return null;
  }

  return {
    secretName: tenantIntegration.secret_name,
    metadata: tenantIntegration.metadata,
  };
}
```

---

## Part 6: Key Regeneration & Migration

### Step 6.1: Generate New CIA Service Keys

**For each Repo A instance (CIQ Automations, Leadscore, etc.):**

1. **Generate new service key:**
   ```bash
   # Generate random key
   openssl rand -hex 32
   # Result: e.g., "cia_service_abc123xyz..."
   ```

2. **Compute HMAC hash:**
   ```typescript
   // Use this script or the auth.ts function
   const pepper = 'YOUR_CIA_SERVICE_KEY_PEPPER';
   const serviceKey = 'cia_service_abc123xyz...';
   
   // HMAC-SHA-256
   const key = await crypto.subtle.importKey(
     'raw',
     new TextEncoder().encode(pepper),
     { name: 'HMAC', hash: 'SHA-256' },
     false,
     ['sign']
   );
   const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(serviceKey));
   const hmacArray = Array.from(new Uint8Array(signature));
   const key_hash = hmacArray.map(b => b.toString(16).padStart(2, '0')).join('');
   ```

3. **Insert into Repo C database:**
   ```sql
   INSERT INTO cia_service_keys (
     name,
     key_hash,
     organization_id,
     allowed_tenant_ids,
     status
   ) VALUES (
     'ciq-automations-service-key',
     'computed_hmac_hash_here',
     NULL,  -- Or specific org UUID
     ARRAY[]::UUID[],  -- Empty = all tenants
     'active'
   );
   ```

### Step 6.2: Migrate Tenant Integrations

**For each tenant that needs integrations:**

1. **Get existing secret names from CIQ Automations:**
   ```sql
   -- In CIQ Automations Supabase
   SELECT id, shopify_api_token_secret_name, ciq_api_token_secret_name, leadscore_service_token_secret_name
   FROM brands
   WHERE shopify_api_token_secret_name IS NOT NULL
      OR ciq_api_token_secret_name IS NOT NULL
      OR leadscore_service_token_secret_name IS NOT NULL;
   ```

2. **Insert into Repo C `tenant_integrations`:**
   ```sql
   -- In Repo C Supabase
   INSERT INTO tenant_integrations (tenant_id, integration, secret_name, metadata) VALUES
     ('brand-uuid-1', 'shopify', 'SHOPIFY_TOKEN_BRAND_1', '{"store_url": "https://store1.myshopify.com"}'),
     ('brand-uuid-1', 'ciq', 'CIQ_API_KEY_BRAND_1', NULL),
     ('brand-uuid-2', 'shopify', 'SHOPIFY_TOKEN_BRAND_2', '{"store_url": "https://store2.myshopify.com"}')
   ON CONFLICT (tenant_id, integration) DO UPDATE
   SET secret_name = EXCLUDED.secret_name,
       metadata = EXCLUDED.metadata;
   ```

**Note:** Secrets stay in Supabase Vault (they're referenced by name, not moved).

---

## Part 7: Update CIQ Automations to Call Repo C

### Step 7.1: Remove Executor Code

**Delete from CIQ Automations:**
- `supabase/functions/execute/` (entire directory)
- `supabase/migrations/20260217000000_add_cia_executor_tables.sql`
- `CIA-EXECUTOR-PLAN.md`
- `INTEGRATION-CHECKLIST.md` (or update it)

### Step 7.2: Update `/manage` Endpoint

**File:** `ciq-automations/supabase/functions/manage/index.ts`

```typescript
import { HttpExecutorAdapter } from '../_shared/control-plane/kernel/src/executor-adapter.ts';

// Add executor adapter
const executor = new HttpExecutorAdapter({
  ciaUrl: Deno.env.get('CIA_URL')!,  // Repo C URL
  ciaServiceKey: Deno.env.get('CIA_SERVICE_KEY')!,  // New service key
  kernelId: 'ciq-automations-kernel',
});

const manageRouter = createManageRouter({
  ...adapters,
  bindings,
  packs: [iamPack, webhooksPack, settingsPack, ciqDomainPack],
  executor,  // Add this
  // controlPlane,  // If using Governance Hub
});
```

### Step 7.3: Update Environment Variables

**In CIQ Automations Supabase Edge Functions → Secrets:**

```bash
# Remove (no longer needed):
# CIA_SERVICE_KEY_PEPPER

# Add/Update:
CIA_URL=https://repo-c-project.supabase.co  # Repo C URL
CIA_SERVICE_KEY=cia_service_xxxxx  # New service key from Repo C
```

---

## Part 8: Update Leadscore to Call Repo C

### Step 8.1: Update Django Router

**File:** `api/views/manage.py` (or wherever manage endpoint is)

```python
from control_plane.kernel.executor_adapter import HttpExecutorAdapter
import os

# In get_manage_router() function:
executor = HttpExecutorAdapter(
    cia_url=os.environ.get('CIA_URL'),
    cia_service_key=os.environ.get('CIA_SERVICE_KEY'),
    kernel_id=os.environ.get('KERNEL_ID', 'leadscore-kernel')
)

manage_router = createManageRouter({
    # ... existing adapters ...
    executor=executor,
})
```

### Step 8.2: Update Railway Environment Variables

**In Railway Dashboard → Variables:**

```bash
CIA_URL=https://repo-c-project.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx  # New service key from Repo C
KERNEL_ID=leadscore-kernel
```

---

## Part 9: Repo C Environment Variables

### Supabase Edge Functions → Secrets

```bash
# Required
CIA_SERVICE_KEY_PEPPER=your-secret-pepper-here

# Optional (if Repo C needs to call external APIs)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # For tenant_integrations queries
```

---

## Part 10: Testing Checklist

### Test Repo C Standalone

1. **Test service key authentication:**
   ```bash
   curl -X POST https://repo-c.supabase.co/functions/v1/execute \
     -H "Authorization: Bearer cia_service_xxxxx" \
     -H "Content-Type: application/json" \
     -d '{
       "tenant_id": "test-tenant",
       "integration": "shopify",
       "action": "shopify.products.list",
       "params": {},
       "request_hash": "test-hash"
     }'
   ```

2. **Verify tenant_integrations lookup works**
3. **Verify secret resolution from Vault works**

### Test CIQ Automations → Repo C

1. **Call CIQ Automations `/manage`:**
   ```bash
   curl -X POST https://ciq-automations.supabase.co/functions/v1/manage \
     -H "X-API-Key: ciq_xxxxx" \
     -H "Content-Type: application/json" \
     -d '{"action": "shopify.products.list", "params": {}}'
   ```

2. **Verify it calls Repo C**
3. **Verify execution succeeds**

### Test Leadscore → Repo C

1. **Call Leadscore `/api/manage`:**
   ```bash
   curl -X POST https://leadscore.railway.app/api/manage \
     -H "X-API-Key: lsk_xxxxx" \
     -H "Content-Type: application/json" \
     -d '{"action": "shopify.products.list", "params": {}}'
   ```

2. **Verify it calls Repo C**
3. **Verify execution succeeds**

---

## Part 11: Migration Timeline

### Phase 1: Setup Repo C (Day 1)
- [ ] Create Lovable project
- [ ] Run database migration
- [ ] Deploy executor endpoint
- [ ] Set environment variables

### Phase 2: Generate & Migrate Keys (Day 1-2)
- [ ] Generate new service keys for each Repo A instance
- [ ] Compute HMAC hashes
- [ ] Insert into Repo C `cia_service_keys`
- [ ] Migrate tenant integrations

### Phase 3: Update Repo A Instances (Day 2)
- [ ] Update CIQ Automations `/manage` endpoint
- [ ] Update Leadscore `/manage` endpoint
- [ ] Set new environment variables
- [ ] Remove old executor code from CIQ Automations

### Phase 4: Testing (Day 2-3)
- [ ] Test Repo C standalone
- [ ] Test CIQ Automations → Repo C
- [ ] Test Leadscore → Repo C
- [ ] Verify all integrations work

### Phase 5: Cleanup (Day 3)
- [ ] Remove old executor code from CIQ Automations
- [ ] Remove old migrations (or mark as deprecated)
- [ ] Update documentation
- [ ] Archive old keys (if needed)

---

## Part 12: Rollback Plan

If something goes wrong:

1. **Keep old executor in CIQ Automations** until Repo C is fully tested
2. **Use feature flags** to switch between old/new executor
3. **Keep old service keys** until migration is verified
4. **Test in staging** before production

---

## Summary

**What Repo C Contains:**
- ✅ `/api/execute` endpoint
- ✅ `cia_service_keys` table
- ✅ `action_allowlist` table
- ✅ `tenant_integrations` table
- ✅ Integration handlers (Shopify, CIQ, LeadScore)
- ✅ Secret resolver (uses `tenant_integrations`)

**What CIQ Automations Keeps:**
- ✅ `/manage` endpoint (Repo A)
- ✅ CIQ Domain Pack
- ✅ Brands table and CIQ-specific data
- ✅ All existing CIQ functions

**What Gets Removed from CIQ Automations:**
- ❌ `/api/execute` endpoint
- ❌ `cia_service_keys` table
- ❌ `action_allowlist` table
- ❌ Executor-related code

**Result:**
- Clean separation: SaaS vs. Infrastructure
- Repo C serves multiple SaaS projects
- CIQ Automations is a clean example of agentified SaaS
