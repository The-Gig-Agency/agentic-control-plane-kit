# MCP Gateway Implementation Checklist

**Date:** February 2026  
**Status:** Phase 1 Complete, Phase 2 (Hosted) In Progress

---

## ✅ Completed

### Gateway Implementation
- [x] Core gateway modules (server, proxy, policy, audit, cache, etc.)
- [x] MCP protocol handling (JSON-RPC 2.0)
- [x] Authorization integration with Repo B
- [x] Audit event emission
- [x] Kernel heartbeat/registration
- [x] Comprehensive error handling
- [x] Agent discovery protocol
- [x] Full MCP protocol coverage (tools, resources, prompts, sampling)
- [x] Test suite (unit, integration, E2E)
- [x] HTTP server implementation (`http-server.ts`)

### Documentation
- [x] Gateway README
- [x] Agent Discovery Guide
- [x] Discovery Protocol spec
- [x] QA Report
- [x] Test coverage documentation
- [x] Multi-tenant onboarding flow
- [x] Hosted gateway architecture
- [x] Three-repo architecture explanation

---

## ⚠️ Needs Implementation

### Repo B (Governance Hub)

#### 1. API Keys Table Migration ✅ Created

**File:** `supabase/migrations/20260219000000_add_api_keys_table.sql`

**Status:** ✅ Migration file created

**To Deploy:**
```bash
cd governance-hub
supabase migration up
# or
supabase db push
```

---

#### 2. API Key Create Endpoint ✅ Created

**File:** `supabase/functions/api-keys-create/index.ts`

**Status:** ✅ Implemented

**Endpoint:** `POST /functions/v1/api-keys/create`

**Request:**
```json
{
  "tenant_id": "be1b7614-...",
  "prefix": "mcp_",
  "scopes": ["mcp.tools", "mcp.resources"],
  "name": "Consumer Corp - Primary Key"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "api_key": "mcp_abc123...",
    "api_key_id": "key_123",
    "tenant_id": "be1b7614-...",
    "prefix": "mcp_",
    "scopes": ["mcp.tools"],
    "created_at": "2026-02-19T12:00:00Z"
  }
}
```

**To Deploy:**
```bash
cd governance-hub
supabase functions deploy api-keys-create
```

---

#### 3. API Key Lookup Endpoint ✅ Created

**File:** `supabase/functions/api-keys-lookup/index.ts`

**Status:** ✅ Implemented

**Endpoint:** `POST /functions/v1/api-keys/lookup`

**Request:**
```json
{
  "api_key": "mcp_abc123..."
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "tenant_id": "be1b7614-...",
    "api_key_id": "key_123",
    "scopes": ["mcp.tools"],
    "status": "active",
    "name": "Consumer Corp - Primary Key",
    "created_at": "2026-02-19T12:00:00Z"
  }
}
```

**To Deploy:**
```bash
cd governance-hub
supabase functions deploy api-keys-lookup
```

---

#### 4. Tenants Create Endpoint ✅ Exists

**File:** `supabase/functions/tenants-create/index.ts`

**Status:** ✅ Already implemented

**Endpoint:** `POST /functions/v1/tenants/create`

**No changes needed.**

---

### Gateway (Repo A)

#### 1. HTTP Server ✅ Created

**File:** `gateway/http-server.ts`

**Status:** ✅ Implemented

**Features:**
- HTTP endpoint: `POST /mcp`
- API key extraction from headers
- Tenant lookup integration
- CORS support
- Health check endpoint
- Discovery endpoint

**To Test:**
```bash
deno run --allow-net --allow-run --allow-read --allow-env gateway/http-server.ts
```

**Needs:**
- Repo B `api-keys/lookup` endpoint (✅ created)
- Gateway initialization refactoring (to support HTTP mode)

---

#### 2. Multi-Tenant Auth ✅ Implemented

**File:** `gateway/auth.ts`

**Status:** ✅ `extractTenantFromApiKey()` implemented

**Features:**
- API key format validation
- Tenant lookup from Repo B
- Error handling

**Needs:**
- Repo B `api-keys/lookup` endpoint (✅ created)
- Tenant lookup cache (optional optimization)

---

#### 3. Gateway Initialization Refactoring ⚠️ Partial

**File:** `gateway/server.ts`

**Status:** ⚠️ Needs refactoring

**Current:**
- Initialization tied to stdio mode
- `tenantId` required from env var

**Needs:**
- Separate initialization from stdio handling
- Make `tenantId` optional (for multi-tenant mode)
- Support both stdio and HTTP modes

---

## Deployment Checklist

### Repo B (Governance Hub)

1. **Deploy Migration:**
   ```bash
   cd governance-hub
   supabase migration up
   ```

2. **Deploy Functions:**
   ```bash
   supabase functions deploy api-keys-create
   supabase functions deploy api-keys-lookup
   ```

3. **Verify:**
   - Test `POST /functions/v1/api-keys/create`
   - Test `POST /functions/v1/api-keys/lookup`
   - Verify database table exists

---

### Gateway (Hosted)

1. **Refactor Initialization:**
   - Separate init from stdio
   - Make tenant ID optional
   - Support HTTP mode

2. **Deploy HTTP Server:**
   - Deploy to Deno Deploy / Fly.io / Railway
   - Configure domain: `gateway.echelon.com`
   - Set environment variables

3. **Test:**
   - Test API key lookup
   - Test authorization flow
   - Test MCP operations

---

## Testing Checklist

### Repo B Endpoints

- [ ] Test `api-keys/create` with valid tenant
- [ ] Test `api-keys/create` with invalid tenant
- [ ] Test `api-keys/lookup` with valid key
- [ ] Test `api-keys/lookup` with invalid key
- [ ] Test `api-keys/lookup` with revoked key
- [ ] Test `api-keys/lookup` with expired key

### Gateway HTTP Server

- [ ] Test health check endpoint
- [ ] Test discovery endpoint
- [ ] Test MCP endpoint with valid API key
- [ ] Test MCP endpoint with invalid API key
- [ ] Test MCP endpoint without API key
- [ ] Test authorization flow
- [ ] Test audit emission

---

## Next Steps

### Immediate (Before Production)

1. **Deploy Repo B endpoints:**
   - Run migration
   - Deploy `api-keys-create`
   - Deploy `api-keys-lookup`

2. **Test Gateway HTTP server:**
   - Test locally with Repo B
   - Verify tenant lookup works
   - Test full MCP flow

3. **Refactor Gateway initialization:**
   - Support both stdio and HTTP modes
   - Make tenant ID optional

### Short-term (Production Ready)

4. **Deploy Gateway:**
   - Deploy to hosting platform
   - Configure domain
   - Set up monitoring

5. **Build Signup Flow:**
   - Signup page/service
   - Tenant creation integration
   - API key generation integration
   - Email delivery

---

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Gateway Core** | ✅ Complete | All modules implemented |
| **HTTP Server** | ✅ Created | Needs testing |
| **Multi-Tenant Auth** | ✅ Implemented | Needs Repo B endpoint |
| **Repo B Migration** | ✅ Created | Needs deployment |
| **Repo B: api-keys/create** | ✅ Created | Needs deployment |
| **Repo B: api-keys/lookup** | ✅ Created | Needs deployment |
| **Repo B: tenants/create** | ✅ Exists | No changes needed |
| **Gateway Init Refactor** | ⚠️ Partial | Needs completion |
| **Signup Flow** | ❌ Not Started | Future work |

---

**Ready for:** Repo B deployment and gateway testing  
**Blocked on:** Repo B endpoint deployment
