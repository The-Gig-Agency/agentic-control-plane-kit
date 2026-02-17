# Repo C Migration Scripts

## Script 1: Generate Service Key & Compute HMAC

**Purpose:** Generate a new CIA service key and compute its HMAC hash for Repo C.

**File:** `scripts/generate-cia-service-key.ts`

```typescript
/**
 * Generate CIA Service Key and Compute HMAC Hash
 * 
 * Usage:
 *   deno run --allow-env scripts/generate-cia-service-key.ts
 * 
 * Or set pepper manually:
 *   CIA_SERVICE_KEY_PEPPER=your-pepper deno run --allow-env scripts/generate-cia-service-key.ts
 */

const pepper = Deno.env.get('CIA_SERVICE_KEY_PEPPER') || prompt('Enter CIA_SERVICE_KEY_PEPPER: ');

if (!pepper) {
  console.error('CIA_SERVICE_KEY_PEPPER is required');
  Deno.exit(1);
}

// Generate random service key
const randomBytes = crypto.getRandomValues(new Uint8Array(32));
const keySuffix = Array.from(randomBytes)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
const serviceKey = `cia_service_${keySuffix}`;

// Compute HMAC-SHA-256
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

console.log('\n✅ Generated CIA Service Key\n');
console.log('Service Key (use this in Repo A env):');
console.log(serviceKey);
console.log('\nHMAC Hash (insert into Repo C database):');
console.log(key_hash);
console.log('\nSQL to insert:');
console.log(`
INSERT INTO cia_service_keys (
  name,
  key_hash,
  organization_id,
  allowed_tenant_ids,
  status
) VALUES (
  'ciq-automations-service-key',  -- Change name as needed
  '${key_hash}',
  NULL,  -- Or specific org UUID
  ARRAY[]::UUID[],  -- Empty = all tenants
  'active'
);
`);
```

---

## Script 2: Migrate Tenant Integrations

**Purpose:** Extract tenant integration data from CIQ Automations and generate SQL for Repo C.

**File:** `scripts/migrate-tenant-integrations.ts`

```typescript
/**
 * Migrate Tenant Integrations from CIQ Automations to Repo C
 * 
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run --allow-env --allow-net scripts/migrate-tenant-integrations.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || prompt('CIQ Automations Supabase URL: ');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || prompt('CIQ Automations Service Role Key: ');

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get all brands with integration secrets
const { data: brands, error } = await supabase
  .from('brands')
  .select('id, name, shopify_api_token_secret_name, shopify_store_url, ciq_api_token_secret_name, leadscore_service_token_secret_name');

if (error) {
  console.error('Error fetching brands:', error);
  Deno.exit(1);
}

console.log(`\nFound ${brands.length} brands\n`);

// Generate SQL inserts
const inserts: string[] = [];

for (const brand of brands) {
  if (brand.shopify_api_token_secret_name) {
    const metadata = brand.shopify_store_url ? JSON.stringify({ store_url: brand.shopify_store_url }) : 'NULL';
    inserts.push(
      `  ('${brand.id}', 'shopify', '${brand.shopify_api_token_secret_name}', ${metadata}::jsonb)`
    );
  }
  
  if (brand.ciq_api_token_secret_name) {
    inserts.push(
      `  ('${brand.id}', 'ciq', '${brand.ciq_api_token_secret_name}', NULL)`
    );
  }
  
  if (brand.leadscore_service_token_secret_name) {
    inserts.push(
      `  ('${brand.id}', 'leadscore', '${brand.leadscore_service_token_secret_name}', NULL)`
    );
  }
}

if (inserts.length === 0) {
  console.log('No tenant integrations found');
  Deno.exit(0);
}

console.log('SQL to insert into Repo C tenant_integrations:\n');
console.log(`
INSERT INTO tenant_integrations (tenant_id, integration, secret_name, metadata) VALUES
${inserts.join(',\n')}
ON CONFLICT (tenant_id, integration) DO UPDATE
SET secret_name = EXCLUDED.secret_name,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
`);
```

---

## Script 3: Verify Migration

**Purpose:** Verify that Repo C is set up correctly and can resolve secrets.

**File:** `scripts/verify-repo-c-setup.ts`

```typescript
/**
 * Verify Repo C Setup
 * 
 * Usage:
 *   REPO_C_URL=... REPO_C_SERVICE_KEY=... deno run --allow-env --allow-net scripts/verify-repo-c-setup.ts
 */

const repoCUrl = Deno.env.get('REPO_C_URL') || prompt('Repo C URL: ');
const serviceKey = Deno.env.get('REPO_C_SERVICE_KEY') || prompt('Repo C Service Key: ');
const testTenantId = Deno.env.get('TEST_TENANT_ID') || prompt('Test Tenant ID: ');

if (!repoCUrl || !serviceKey || !testTenantId) {
  console.error('REPO_C_URL, REPO_C_SERVICE_KEY, and TEST_TENANT_ID are required');
  Deno.exit(1);
}

console.log('\n🔍 Verifying Repo C Setup...\n');

// Test 1: Service key authentication
console.log('1. Testing service key authentication...');
const testResponse = await fetch(`${repoCUrl}/functions/v1/execute`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tenant_id: testTenantId,
    integration: 'shopify',
    action: 'shopify.products.list',
    params: {},
    request_hash: 'test-hash-' + Date.now(),
  }),
});

if (testResponse.ok) {
  console.log('   ✅ Service key authentication works');
  const result = await testResponse.json();
  console.log('   Response:', JSON.stringify(result, null, 2));
} else {
  console.log('   ❌ Service key authentication failed');
  const error = await testResponse.text();
  console.log('   Error:', error);
}

// Test 2: Action allowlist
console.log('\n2. Testing action allowlist...');
const allowlistResponse = await fetch(`${repoCUrl}/functions/v1/execute`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tenant_id: testTenantId,
    integration: 'shopify',
    action: 'shopify.invalid.action',  // Should fail
    params: {},
    request_hash: 'test-hash-2',
  }),
});

if (allowlistResponse.status === 403) {
  console.log('   ✅ Action allowlist is working (correctly rejected invalid action)');
} else {
  console.log('   ⚠️  Action allowlist may not be working correctly');
}

console.log('\n✅ Verification complete\n');
```

---

## Manual Steps

### Step 1: Generate Service Keys

For each Repo A instance (CIQ Automations, Leadscore, etc.):

```bash
# Set pepper
export CIA_SERVICE_KEY_PEPPER=your-pepper-here

# Run script
deno run --allow-env scripts/generate-cia-service-key.ts

# Copy the service key and HMAC hash
# Insert HMAC hash into Repo C database
# Use service key in Repo A environment variables
```

### Step 2: Migrate Tenant Integrations

```bash
# Set CIQ Automations credentials
export SUPABASE_URL=https://ciq-automations.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-key

# Run script
deno run --allow-env --allow-net scripts/migrate-tenant-integrations.ts

# Copy generated SQL
# Run in Repo C Supabase SQL Editor
```

### Step 3: Verify Setup

```bash
# Set Repo C credentials
export REPO_C_URL=https://repo-c.supabase.co
export REPO_C_SERVICE_KEY=cia_service_xxxxx
export TEST_TENANT_ID=your-test-tenant-id

# Run verification
deno run --allow-env --allow-net scripts/verify-repo-c-setup.ts
```

---

## Quick Reference

### Repo C Database Setup

```sql
-- 1. Run migration
-- File: supabase/migrations/001_initial_schema.sql

-- 2. Insert service keys (one per Repo A instance)
INSERT INTO cia_service_keys (name, key_hash, status) VALUES
  ('ciq-automations-service-key', 'hmac_hash_here', 'active'),
  ('leadscore-service-key', 'hmac_hash_here', 'active');

-- 3. Insert tenant integrations (from migration script)
-- (Use output from migrate-tenant-integrations.ts script)
```

### Repo C Environment Variables

```bash
# Supabase Edge Functions → Secrets
CIA_SERVICE_KEY_PEPPER=your-secret-pepper
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # For queries
```

### Repo A Environment Variables (CIQ Automations)

```bash
# Supabase Edge Functions → Secrets
CIA_URL=https://repo-c.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx  # From generate script
```

### Repo A Environment Variables (Leadscore)

```bash
# Railway → Variables
CIA_URL=https://repo-c.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx  # From generate script
KERNEL_ID=leadscore-kernel
```
