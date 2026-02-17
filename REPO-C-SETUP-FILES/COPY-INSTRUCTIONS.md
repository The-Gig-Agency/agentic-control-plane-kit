# Copy Instructions: Setting Up Repo C

## Step 1: Clone Repo C

```bash
cd /Users/rastakit/tga-workspace/repos
git clone https://github.com/The-Gig-Agency/key-vault-executor.git
cd key-vault-executor
```

## Step 2: Copy Database Migration

**From:** `REPO-C-SETUP-FILES/001_initial_schema.sql`  
**To:** `supabase/migrations/001_initial_schema.sql`

```bash
# Create migrations directory if it doesn't exist
mkdir -p supabase/migrations

# Copy migration file
cp /path/to/REPO-C-SETUP-FILES/001_initial_schema.sql supabase/migrations/001_initial_schema.sql
```

## Step 3: Copy Executor Code from CIQ Automations

**From:** `ciq-automations/supabase/functions/execute/`  
**To:** `supabase/functions/execute/`

### Files to Copy:

1. **Main endpoint:**
   ```bash
   cp ciq-automations/supabase/functions/execute/index.ts supabase/functions/execute/index.ts
   ```

2. **Auth module:**
   ```bash
   cp ciq-automations/supabase/functions/execute/lib/auth.ts supabase/functions/execute/lib/auth.ts
   ```

3. **Integration handlers:**
   ```bash
   cp ciq-automations/supabase/functions/execute/lib/integration-handlers.ts supabase/functions/execute/lib/integration-handlers.ts
   ```

4. **Secret resolver (UPDATED):**
   ```bash
   # Use the updated version from REPO-C-SETUP-FILES
   cp REPO-C-SETUP-FILES/secret-resolver.ts supabase/functions/execute/lib/secret-resolver.ts
   ```

5. **README:**
   ```bash
   cp ciq-automations/supabase/functions/execute/README.md supabase/functions/execute/README.md
   ```

## Step 4: Update Integration Handlers

**File:** `supabase/functions/execute/lib/integration-handlers.ts`

**Changes needed:**

1. **Update `handleShopify` to use `tenant_integrations`:**
   - Replace `brands` table query with `tenant_integrations`
   - Get `shopify_store_url` from `metadata` field instead of `brands.shopify_store_url`

2. **Update `handleCiq` to use `tenant_integrations`:**
   - Replace brands table dependency
   - Use `tenant_integrations` for secret lookup

3. **Update `handleLeadScore` to use `tenant_integrations`:**
   - Same pattern as above

## Step 5: Update Secret Resolver Import

**File:** `supabase/functions/execute/lib/integration-handlers.ts`

The secret resolver now returns `{ secretName, metadata }` instead of just `string`.

Update all calls to `resolveSecretName()`:

```typescript
// OLD:
const secretName = await resolveSecretName(supabase, tenantId, 'shopify');

// NEW:
const result = await resolveSecretName(supabase, tenantId, 'shopify');
if (!result) {
  throw new Error('Integration not configured');
}
const secretName = result.secretName;
const metadata = result.metadata;  // Use for shopify_store_url, etc.
```

## Step 6: Run Database Migration

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run

Or via CLI:
```bash
supabase db push
```

## Step 7: Set Environment Variables

In Supabase Dashboard → Edge Functions → Secrets:

```bash
CIA_SERVICE_KEY_PEPPER=your-secret-pepper-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Step 8: Deploy Edge Function

```bash
supabase functions deploy execute
```

## Step 9: Test

```bash
# Test the endpoint (will fail without service key, but should return 401, not 500)
curl -X POST https://your-project.supabase.co/functions/v1/execute \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

## Next Steps

1. Generate service keys (see `REPO-C-MIGRATION-SCRIPT.md`)
2. Migrate tenant integrations
3. Update CIQ Automations to call Repo C
4. Update Leadscore to call Repo C
