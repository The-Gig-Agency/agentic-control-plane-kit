# Repo C: CIA Key Vault + Executor

A standalone service that provides secure API execution for multiple SaaS applications. This service stores API keys securely and executes actions on external services (Shopify, CIQ, LeadScore) on behalf of client applications.

## Architecture

```
┌─────────────────────────────────────┐
│  CIQ Automations (SaaS)            │
│  - Repo A: /manage                 │
│  - Calls Repo C for execution      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Repo C: CIA (This Service)        │
│  - Key Vault + Executor             │
│  - Serves ALL Repo A instances     │
└─────────────────────────────────────┘
              ↑
┌─────────────────────────────────────┐
│  Leadscore (SaaS)                   │
│  - Repo A: /manage                  │
│  - Calls Repo C for execution      │
└─────────────────────────────────────┘
```

## Setup Instructions

### 1. Database Migration

Run the migration in Supabase SQL Editor:

```bash
# File: supabase/migrations/001_initial_schema.sql
# Copy from REPO-C-SETUP-FILES/001_initial_schema.sql
```

### 2. Environment Variables

Set in Supabase Edge Functions → Secrets:

```bash
CIA_SERVICE_KEY_PEPPER=your-secret-pepper-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Deploy Edge Function

```bash
supabase functions deploy execute
```

### 4. Generate Service Keys

For each Repo A instance (CIQ Automations, Leadscore, etc.):

1. Generate service key (use script in `REPO-C-MIGRATION-SCRIPT.md`)
2. Compute HMAC hash
3. Insert into `cia_service_keys` table
4. Give service key to Repo A instance

### 5. Migrate Tenant Integrations

For each tenant that needs integrations:

1. Extract from client systems (CIQ Automations, etc.)
2. Insert into `tenant_integrations` table
3. Store secrets in Supabase Vault

## API Endpoint

**POST** `/functions/v1/execute`

See `supabase/functions/execute/README.md` for full documentation.

## File Structure

```
supabase/
  migrations/
    001_initial_schema.sql
  functions/
    execute/
      index.ts
      lib/
        auth.ts
        integration-handlers.ts
        secret-resolver.ts
      README.md
src/  # React frontend (optional)
README.md
```

## Next Steps

1. Copy executor code from CIQ Automations
2. Update secret resolver to use `tenant_integrations`
3. Test end-to-end flow
4. Generate service keys for clients
5. Migrate tenant integrations
