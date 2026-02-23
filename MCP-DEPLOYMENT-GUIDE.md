# MCP Registration & Credential Storage: Deployment Guide

**Date:** February 23, 2026  
**Repositories:** governance-hub (Repo B), key-vault-executor (Repo C)

---

## Pre-Deployment Checklist

### Repo B (Governance Hub)

- [x] Migration: `20260223000000_add_tenant_mcp_servers_table.sql`
- [x] Migration: `20260223000001_add_connector_mode_support.sql`
- [x] Migration: `20260223000002_add_credential_deletions_audit.sql`
- [x] Function: `mcp-servers-register` (updated with connector mode)
- [x] Function: `mcp-servers-list`
- [x] Function: `mcp-servers-update`
- [x] Function: `mcp-servers-delete`

### Repo C (Key Vault Executor)

- [x] Migration: `20260223000000_add_tenant_credentials_table.sql`
- [x] Migration: `20260223000001_fix_tenant_id_type_and_add_abuse_controls.sql`
- [x] Function: `credentials-store` (updated with AAD binding)
- [x] Function: `credentials-list`
- [x] Function: `credentials-delete` (updated with audit tombstone)
- [x] Function: `credentials-use` (NEW - replaces retrieve)
- [x] Function: `credentials-retrieve` (DELETED)

---

## Repo B Deployment

### Step 1: Deploy Migrations

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

# Deploy all migrations
supabase db push

# Or deploy individually:
supabase migration up
```

**Migrations to deploy:**
1. `20260223000000_add_tenant_mcp_servers_table.sql`
2. `20260223000001_add_connector_mode_support.sql`
3. `20260223000002_add_credential_deletions_audit.sql`

### Step 2: Deploy Edge Functions

```bash
# Deploy all four functions
supabase functions deploy mcp-servers-register
supabase functions deploy mcp-servers-list
supabase functions deploy mcp-servers-update
supabase functions deploy mcp-servers-delete
```

### Step 3: Verify Deployment

```bash
# Test register endpoint
curl -X POST https://your-governance-hub.supabase.co/functions/v1/mcp-servers/register \
  -H "X-API-Key: your_test_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "server_id": "test-server",
    "name": "Test Server",
    "mode": "hosted",
    "connector_id": "amazon",
    "connector_version": "1.0.0",
    "tool_prefix": "amazon."
  }'
```

---

## Repo C Deployment

### Step 1: Set Environment Variables

**In Supabase Dashboard → Edge Functions → Secrets:**

```bash
REPO_B_URL=https://your-governance-hub.supabase.co
REPO_B_ANON_KEY=your_repo_b_anon_key
REPO_B_SERVICE_KEY=your_repo_b_service_role_key
CREDENTIAL_ENCRYPTION_KEY=your-32-byte-encryption-key-here
EXECUTOR_SECRET=your-executor-secret-here
```

**Generate Encryption Key:**
```bash
# Generate 32-byte (256-bit) key
openssl rand -hex 32
```

**Generate Executor Secret:**
```bash
# Generate secure random secret
openssl rand -hex 32
```

### Step 2: Deploy Migrations

```bash
cd /Users/rastakit/tga-workspace/repos/key-vault-executor

# Deploy all migrations
supabase db push

# Or deploy individually:
supabase migration up
```

**Migrations to deploy:**
1. `20260223000000_add_tenant_credentials_table.sql`
2. `20260223000001_fix_tenant_id_type_and_add_abuse_controls.sql`

**⚠️ Important:** The `fix_tenant_id_type` migration changes `tenant_id` from TEXT to UUID. Ensure all existing data (if any) has valid UUIDs.

### Step 3: Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy credentials-store
supabase functions deploy credentials-list
supabase functions deploy credentials-delete
supabase functions deploy credentials-use
```

**⚠️ Important:** Do NOT deploy `credentials-retrieve` (it's been deleted for security).

### Step 4: Verify Deployment

```bash
# Test store endpoint
curl -X POST https://your-key-vault.supabase.co/functions/v1/credentials/store \
  -H "X-API-Key: your_test_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "amazon",
    "credentials": {
      "api_key": "test_key",
      "secret_key": "test_secret"
    }
  }'

# Test list endpoint
curl -X GET "https://your-key-vault.supabase.co/functions/v1/credentials/list" \
  -H "X-API-Key: your_test_api_key"
```

---

## Post-Deployment Verification

### Test 1: MCP Server Registration (Hosted Mode)

```bash
POST https://your-governance-hub.supabase.co/functions/v1/mcp-servers/register
X-API-Key: mcp_xxxxx

{
  "server_id": "my-amazon-server",
  "name": "My Amazon Server",
  "mode": "hosted",
  "connector_id": "amazon",
  "connector_version": "1.2.3",
  "tool_prefix": "amazon."
}
```

**Expected:** ✅ Success (connector_id required for hosted mode)

**Test Denial:**
```json
{
  "mode": "hosted",
  "command": "node",  // ← Should be rejected
  "args": ["./server.js"]
}
```

**Expected:** ❌ Error: "command and args are not allowed in hosted mode"

### Test 2: Credential Storage

```bash
POST https://your-key-vault.supabase.co/functions/v1/credentials/store
X-API-Key: mcp_xxxxx

{
  "service": "amazon",
  "credentials": {
    "api_key": "AKIAIOSFODNN7EXAMPLE",
    "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }
}
```

**Expected:** ✅ Success, returns credential_id

### Test 3: Credential Use (Executor Secret)

```bash
POST https://your-key-vault.supabase.co/functions/v1/credentials/use
Authorization: Bearer {EXECUTOR_SECRET}
X-Tenant-Id: {tenant_id}

{
  "service": "amazon",
  "action": "order",
  "params": { ... }
}
```

**Expected:** ✅ Success, returns execution result (no secrets)

**Test Denial (Agent API Key):**
```bash
POST https://your-key-vault.supabase.co/functions/v1/credentials/use
X-API-Key: mcp_xxxxx  // ← Should be rejected
```

**Expected:** ❌ Error: "Invalid executor secret"

### Test 4: Credential Retrieve (Should Not Exist)

```bash
POST https://your-key-vault.supabase.co/functions/v1/credentials/retrieve
X-API-Key: mcp_xxxxx
```

**Expected:** ❌ 404 Not Found (endpoint deleted)

---

## Rollback Plan

### If Issues Occur

**Repo B:**
```bash
# Rollback migrations (if needed)
supabase migration down

# Redeploy previous function versions
supabase functions deploy mcp-servers-register --version previous
```

**Repo C:**
```bash
# Rollback migrations (if needed)
supabase migration down

# Redeploy previous function versions
supabase functions deploy credentials-store --version previous
```

**Note:** Rolling back the `tenant_id` type change (TEXT → UUID) requires data migration if data exists.

---

## Monitoring

### What to Monitor

**Repo B:**
- MCP server registration rate
- Tool prefix collisions
- Connector mode distribution (hosted vs self_hosted)

**Repo C:**
- Credential storage rate
- Credential use rate
- Encryption/decryption errors
- Audit tombstone creation

### Key Metrics

- Registration success rate
- Credential storage success rate
- Credential use success rate
- Error rates by endpoint
- Rate limit violations

---

## Troubleshooting

### Issue: "connector_id is required for hosted mode"

**Cause:** Migration not deployed or function not updated

**Fix:**
```bash
supabase db push
supabase functions deploy mcp-servers-register
```

### Issue: "Invalid executor secret"

**Cause:** `EXECUTOR_SECRET` not set or mismatch

**Fix:**
1. Set `EXECUTOR_SECRET` in Supabase Edge Function secrets
2. Ensure Gateway uses same secret
3. Redeploy `credentials-use` function

### Issue: "tenant_id type mismatch"

**Cause:** Migration changing tenant_id to UUID not applied

**Fix:**
```bash
supabase db push
# Verify existing data has valid UUIDs
```

### Issue: "AAD binding failed"

**Cause:** Encryption/decryption using different AAD

**Fix:**
- Ensure `credentials-store` and `credentials-use` both use AAD
- Re-encrypt existing credentials with AAD binding

---

## Summary

**Deployment Steps:**
1. ✅ Deploy Repo B migrations (3 files)
2. ✅ Deploy Repo B functions (4 functions)
3. ✅ Set Repo C environment variables (5 secrets)
4. ✅ Deploy Repo C migrations (2 files)
5. ✅ Deploy Repo C functions (4 functions)
6. ✅ Verify endpoints work
7. ✅ Test security boundaries

**Ready to Deploy:** ✅ Yes

**Critical Security Fixes:** ✅ All implemented

**Strategic Alignment:** ✅ Confirmed

---

**Document Version:** 1.0  
**Last Updated:** February 23, 2026
