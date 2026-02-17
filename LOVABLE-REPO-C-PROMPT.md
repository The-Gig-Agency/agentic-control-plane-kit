# Lovable Prompt: Repo C - CIA Key Vault + Executor

## Copy/Paste This Prompt into Lovable

---

**Project Name:** `cia-executor` or `key-vault-executor`

**Project Type:** React + Supabase

**Description:** 
Create a Key Vault + Executor service that provides secure API execution for multiple SaaS applications. This service stores API keys securely and executes actions on external services (Shopify, CIQ, LeadScore) on behalf of client applications.

---

## Core Requirements

### 1. Database Schema

Create these tables in Supabase:

**`cia_service_keys`** - Stores service credentials for client authentication
- `id` (UUID, primary key)
- `name` (TEXT, not null) - e.g., "ciq-automations-service-key"
- `key_hash` (TEXT, not null) - HMAC-SHA-256 hash of the service key
- `organization_id` (UUID, nullable) - Optional organization boundary
- `allowed_tenant_ids` (UUID[], nullable) - Optional tenant restrictions
- `status` (TEXT, default 'active') - 'active' | 'revoked' | 'expired'
- `created_at`, `expires_at`, `revoked_at`, `last_used_at` (TIMESTAMPTZ)

**`action_allowlist`** - Whitelist of allowed actions per integration
- `id` (UUID, primary key)
- `integration` (TEXT, not null) - 'shopify' | 'ciq' | 'leadscore'
- `action` (TEXT, not null) - e.g., 'shopify.products.create'
- `action_version` (TEXT, default 'v1')
- `enabled` (BOOLEAN, default true)
- `created_at`, `updated_at` (TIMESTAMPTZ)
- Unique constraint on (integration, action)

**`tenant_integrations`** - Maps tenants to their integration secrets
- `id` (UUID, primary key)
- `tenant_id` (TEXT, not null) - UUID or string from calling service
- `integration` (TEXT, not null) - 'shopify' | 'ciq' | 'leadscore'
- `secret_name` (TEXT, not null) - Name of secret in Supabase Vault
- `metadata` (JSONB, nullable) - Additional config (e.g., shopify_store_url)
- `created_at`, `updated_at` (TIMESTAMPTZ)
- Unique constraint on (tenant_id, integration)

### 2. Supabase Edge Function: `/api/execute`

**Endpoint:** `POST /functions/v1/execute`

**Authentication:**
- Requires `Authorization: Bearer <CIA_SERVICE_KEY>` header
- Validates key using HMAC-SHA-256 with `CIA_SERVICE_KEY_PEPPER` (env var)
- Checks `cia_service_keys` table for matching hash

**Request Body:**
```typescript
{
  tenant_id: string;  // UUID or string
  integration: 'shopify' | 'ciq' | 'leadscore';
  action: string;  // e.g., 'shopify.products.create'
  params: Record<string, any>;  // Action parameters
  idempotency_key?: string;
  request_hash: string;  // SHA-256 hash from client
  trace?: {
    kernel_id?: string;
    policy_decision_id?: string;
    actor_id?: string;
  }
}
```

**Response Body:**
```typescript
{
  ok: boolean;
  status: 'success' | 'error';
  result_meta?: {
    resource_type?: string;
    resource_id?: string;
    count?: number;
    ids_created?: string[];
  };
  data?: any;  // Sanitized result
  error_code?: string;
  error_message_redacted?: string;
  upstream?: {
    http_status: number;
    request_id?: string;
  };
}
```

**Security Constraints:**
- Reject requests with `params` > 64KB (return 413)
- Never log `params` (only log metadata: tenant_id, integration, action, request_hash)
- Check `action_allowlist` before execution
- Verify tenant access (if `allowed_tenant_ids` is set, enforce it)

**Flow:**
1. Authenticate service key (HMAC validation)
2. Validate params size (64KB limit)
3. Check action allowlist
4. Verify tenant access
5. Resolve secret from `tenant_integrations` table
6. Load token from Supabase Vault (environment variable)
7. Route to integration handler
8. Call external API
9. Return sanitized results

### 3. Integration Handlers

**Shopify Handler:**
- Load token from Vault using `secret_name` from `tenant_integrations`
- Get `shopify_store_url` from `metadata` field
- Call Shopify Admin GraphQL API (2024-01)
- Support actions: products.list, products.get, products.create, products.update, products.delete, orders.list, orders.get, orders.create, orders.cancel
- Return sanitized results (never return tokens)

**CIQ Handler:**
- Load token from Vault
- Call Creator IQ API via existing client pattern
- Support actions: publishers.*, campaigns.*, lists.*, workflows.*, messaging.*
- Return sanitized results

**LeadScore Handler:**
- Placeholder for now (returns "not yet implemented")
- Will be implemented later

### 4. Environment Variables

**Required in Supabase Edge Functions → Secrets:**
- `CIA_SERVICE_KEY_PEPPER` - Secret pepper for HMAC-SHA-256 validation
- `SUPABASE_SERVICE_ROLE_KEY` - For database queries

### 5. Frontend (React)

**Minimal UI needed:**
- Dashboard showing:
  - Service keys (masked)
  - Action allowlist
  - Tenant integrations
  - Recent executions (from audit logs)
- Forms to:
  - Create service keys
  - Add tenant integrations
  - Manage action allowlist

**Note:** Frontend is optional for MVP - the service works via API only.

---

## Initial Data Seeding

**Seed `action_allowlist` with:**
- Shopify: products.list, products.get, products.create, products.update, products.delete, orders.list, orders.get, orders.create, orders.cancel
- CIQ: publishers.list, publishers.get, publishers.search, publishers.getContact, campaigns.list, campaigns.get, campaigns.create, campaigns.update, campaigns.delete, lists.list, lists.get, lists.create, lists.update, lists.delete, workflows.list, workflows.get, workflows.run, messaging.send
- LeadScore: leads.list, leads.get, leads.create, leads.update

---

## Key Design Principles

1. **Tenant-Agnostic:** Repo C doesn't know about "brands" or specific SaaS models. It receives `tenant_id` as a string and looks up integrations.

2. **Security First:**
   - HMAC-SHA-256 for service key validation (not plain SHA-256)
   - Never log sensitive data (params, tokens)
   - Action allowlist prevents arbitrary execution
   - Tenant isolation via `allowed_tenant_ids`

3. **Stateless Execution:** Each request is independent. No session state.

4. **Sanitized Responses:** Never return API keys or tokens in responses.

5. **Error Handling:** Return clear error codes, but never expose internal details.

---

## File Structure

```
supabase/
  migrations/
    001_initial_schema.sql  # Database schema
  functions/
    execute/
      index.ts  # Main endpoint
      lib/
        auth.ts  # Service key authentication
        integration-handlers.ts  # Shopify, CIQ, LeadScore handlers
        secret-resolver.ts  # Resolve secrets from tenant_integrations
      README.md  # API documentation
src/  # React frontend (optional for MVP)
  components/
    Dashboard.tsx
    ServiceKeys.tsx
    TenantIntegrations.tsx
    ActionAllowlist.tsx
README.md  # Project documentation
```

---

## Success Criteria

✅ Service key authentication works (HMAC validation)
✅ Action allowlist enforcement works
✅ Tenant integration lookup works
✅ Secret resolution from Vault works
✅ Shopify handler executes successfully
✅ CIQ handler executes successfully
✅ Never logs sensitive data
✅ Returns sanitized responses
✅ Handles errors gracefully

---

## Integration with Existing System

This service will be called by:
- **CIQ Automations** (Supabase Edge Function) - Has Repo A deployed at `/manage`
- **Leadscore** (Django on Railway) - Has Repo A deployed at `/api/manage`

Both will call this service's `/api/execute` endpoint with their service keys.

---

## Next Steps After Creation

1. Set `CIA_SERVICE_KEY_PEPPER` in Supabase Edge Functions secrets
2. Generate service keys for each client (CIQ Automations, Leadscore)
3. Insert service keys into `cia_service_keys` table
4. Migrate tenant integrations from client systems
5. Test end-to-end flow

---

**Start with the database schema and Edge Function. Frontend can be added later if needed.**
