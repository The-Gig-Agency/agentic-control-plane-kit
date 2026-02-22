# MCP Gateway: Multi-Tenant Onboarding Flow

**For:** 100 consumers (agents) wanting to use MCP Gateway  
**Current State:** Phase 1 (single tenant per instance)  
**Required for Scale:** Phase 2/3 (multi-tenant with API key handshake)

---

## Current State: Phase 1 (Single Tenant Per Instance)

### How It Works Now

**One Gateway Instance = One Tenant**

Each consumer needs their own gateway instance:
- Consumer 1 → Gateway Instance 1 (with `ACP_TENANT_ID=tenant-1`)
- Consumer 2 → Gateway Instance 2 (with `ACP_TENANT_ID=tenant-2`)
- ... (not scalable for 100 consumers)

**Limitations:**
- ❌ Requires 100 gateway instances (one per consumer)
- ❌ Each instance needs separate deployment
- ❌ High operational overhead
- ❌ Not cost-effective

---

## Required: Phase 2/3 Multi-Tenant Architecture

### How It Should Work

**One Gateway Instance = Multiple Tenants**

All 100 consumers use the same gateway instance:
- Consumer 1-100 → Single Gateway Instance
- Gateway identifies tenant via API key
- Repo B provides tenant mapping

**Benefits:**
- ✅ Single gateway instance serves all consumers
- ✅ Cost-effective
- ✅ Easier to manage
- ✅ Better resource utilization

---

## Complete Sign-Up Flow for 100 Consumers

### Step 1: Agent Discovers Gateway

**Agent connects to gateway and calls discovery:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "meta.discover"
}
```

**Gateway Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "gateway": {
      "name": "Echelon MCP Gateway",
      "registration_required": true,
      "registration_url": "https://governance-hub.supabase.co/onboard/mcp-gateway"
    }
  }
}
```

---

### Step 2: Agent Requests Registration

**Agent calls registration endpoint:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "mcp.register",
  "params": {
    "agent_id": "consumer-001",
    "agent_name": "Consumer Agent",
    "email": "consumer@example.com",
    "organization_name": "Consumer Corp"
  }
}
```

**Current (Phase 1) Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "registered": false,
    "registration_url": "https://governance-hub.supabase.co/onboard/mcp-gateway?agent_id=consumer-001&email=consumer@example.com",
    "message": "Visit registration URL to complete onboarding"
  }
}
```

**Future (Phase 2) Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "registered": true,
    "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
    "api_key": "mcp_abc123...",
    "api_key_prefix": "mcp_",
    "message": "Registration successful"
  }
}
```

---

### Step 3: Create Tenant in Repo B (Governance Hub)

**Gateway (or onboarding service) calls Repo B:**

```http
POST https://governance-hub.supabase.co/functions/v1/tenants/create
Authorization: Bearer {ACP_KERNEL_KEY}
Content-Type: application/json

{
  "agent_id": "consumer-001",
  "email": "consumer@example.com",
  "organization_name": "Consumer Corp",
  "integration": "mcp-gateway"
}
```

**Repo B Response:**
```json
{
  "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "tier": "free",
  "created_at": "2026-02-19T12:00:00Z"
}
```

**What Repo B Does:**
1. Creates tenant record in `tenants` table
2. Assigns tenant UUID
3. Sets initial tier (e.g., "free")
4. Returns tenant UUID

---

### Step 4: Generate API Key for Consumer

**Gateway (or onboarding service) generates API key:**

**Option A: Gateway generates (if it has API key generation capability)**
```typescript
const apiKey = generateApiKey('mcp_', 32);
// Store in Repo B or local database
// Format: mcp_abc123def456...
```

**Option B: Repo B generates (preferred)**
```http
POST https://governance-hub.supabase.co/functions/v1/api-keys/create
Authorization: Bearer {ACP_KERNEL_KEY}
Content-Type: application/json

{
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "prefix": "mcp_",
  "scopes": ["mcp.tools", "mcp.resources", "mcp.prompts", "mcp.sampling"]
}
```

**Repo B Response:**
```json
{
  "api_key": "mcp_abc123def456...",
  "api_key_id": "key_123",
  "prefix": "mcp_",
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "created_at": "2026-02-19T12:00:00Z"
}
```

**What Gets Stored:**
- API key hash (in Repo B `api_keys` table)
- Tenant mapping (api_key_id → tenant_id)
- Scopes/permissions

---

### Step 5: Consumer Receives Credentials

**Consumer gets:**
1. **Tenant UUID:** `be1b7614-60ad-4e77-8661-cb4fcba9b314`
2. **API Key:** `mcp_abc123def456...`
3. **Gateway URL:** `stdio://gateway` (or HTTP endpoint)

**Delivery Method:**
- Email with credentials
- API response (if automatic registration)
- Dashboard/UI (if manual approval)

---

### Step 6: Consumer Configures MCP Client

**Consumer adds gateway to their MCP client config:**

```json
{
  "mcpServers": {
    "echelon": {
      "command": "deno",
      "args": [
        "run",
        "--allow-net",
        "--allow-run",
        "--allow-read",
        "--allow-env",
        "gateway/server.ts"
      ],
      "env": {
        "ACP_BASE_URL": "https://governance-hub.supabase.co",
        "ACP_KERNEL_KEY": "{gateway_kernel_key}",
        "ACP_TENANT_ID": "be1b7614-60ad-4e77-8661-cb4fcba9b314"
      },
      "headers": {
        "X-API-Key": "mcp_abc123def456..."
      }
    }
  }
}
```

**For Multi-Tenant (Phase 2):**
```json
{
  "mcpServers": {
    "echelon": {
      "command": "deno",
      "args": ["run", "gateway/server.ts"],
      "env": {
        "ACP_BASE_URL": "https://governance-hub.supabase.co",
        "ACP_KERNEL_KEY": "{gateway_kernel_key}"
      },
      "headers": {
        "X-API-Key": "mcp_abc123def456..."  // Consumer's API key
      }
    }
  }
}
```

**Key Difference:**
- **Phase 1:** `ACP_TENANT_ID` in env (one tenant per instance)
- **Phase 2:** API key in headers (multi-tenant, gateway looks up tenant)

---

### Step 7: Gateway Identifies Tenant (Phase 2)

**When consumer connects with API key:**

```typescript
// gateway/auth.ts (Phase 2)
export async function extractTenantFromApiKey(apiKey: string): Promise<string> {
  // 1. Check local cache first
  const cached = await tenantCache.get(apiKey);
  if (cached) {
    return cached.tenantId;
  }

  // 2. Query Repo B for tenant mapping
  const response = await fetch(`${platformUrl}/functions/v1/api-keys/lookup`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kernelApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey }),
  });

  const { tenant_id } = await response.json();

  // 3. Cache result
  await tenantCache.set(apiKey, tenant_id, 3600000); // 1 hour TTL

  return tenant_id;
}
```

**Repo B Endpoint (needs to be created):**
```http
POST /functions/v1/api-keys/lookup
Authorization: Bearer {ACP_KERNEL_KEY}
Content-Type: application/json

{
  "api_key": "mcp_abc123..."
}
```

**Response:**
```json
{
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "api_key_id": "key_123",
  "scopes": ["mcp.tools", "mcp.resources"],
  "status": "active"
}
```

---

### Step 8: Consumer Uses Gateway

**Consumer makes MCP request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "fs.read_file",
    "arguments": { "path": "/tmp/test.txt" }
  }
}
```

**Gateway Flow:**
1. Extract API key from headers
2. Lookup tenant ID from API key (cache or Repo B)
3. Authorize action with Repo B: `tool:fs.read_file`
4. If allowed, forward to MCP server
5. Return result to consumer
6. Emit audit event to Repo B

---

## Complete Flow Diagram

```
┌─────────────┐
│  Consumer 1 │
│  Consumer 2 │
│  Consumer 3 │
│     ...     │
│ Consumer 100│
└──────┬──────┘
       │ 1. Discover gateway (meta.discover)
       │ 2. Register (mcp.register)
       │ 3. Receive API key
       │ 4. Configure MCP client
       │ 5. Connect with API key
       ▼
┌─────────────────────────────────────┐
│     MCP Gateway (Single Instance)   │
│  - Receives API key in headers       │
│  - Looks up tenant from Repo B       │
│  - Caches tenant mapping             │
└──────┬───────────────────────────────┘
       │ 6. Lookup tenant (if not cached)
       ▼
┌─────────────────────────────────────┐
│   Governance Hub (Repo B)            │
│  - /tenants/create (onboarding)      │
│  - /api-keys/create (generate key)    │
│  - /api-keys/lookup (tenant mapping) │
│  - /authorize (every operation)      │
│  - /audit-ingest (all events)        │
└──────────────────────────────────────┘
```

---

## What Needs to Be Built

### Phase 1 → Phase 2 Migration

**1. Repo B: API Key Management**

**New Endpoints Needed:**
- `POST /functions/v1/api-keys/create` - Generate API key for tenant
- `POST /functions/v1/api-keys/lookup` - Get tenant from API key
- `GET /functions/v1/api-keys/{id}` - Get API key details
- `DELETE /functions/v1/api-keys/{id}` - Revoke API key

**Database Schema:**
```sql
-- Already exists in Repo B
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP
);

-- Index for lookups
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
```

**2. Gateway: Multi-Tenant Support**

**Changes Needed:**
- Update `auth.ts` to extract tenant from API key
- Add tenant lookup cache
- Remove `ACP_TENANT_ID` requirement (make optional)
- Add API key validation

**3. Onboarding Service (Optional)**

**Could be:**
- Part of Repo B (onboarding endpoint)
- Separate service
- Gateway itself (Phase 2 automatic registration)

---

## Onboarding Options

### Option A: Manual Onboarding (Current Phase 1)

**Flow:**
1. Consumer requests registration
2. Gateway returns registration URL
3. Consumer visits URL (human approval)
4. Repo B creates tenant + API key
5. Consumer receives credentials via email
6. Consumer configures MCP client

**Pros:**
- Human approval
- Better security
- Email verification

**Cons:**
- Manual step
- Slower onboarding
- Not fully automated

---

### Option B: Automatic Onboarding (Phase 2)

**Flow:**
1. Consumer requests registration
2. Gateway calls Repo B to create tenant
3. Repo B generates API key
4. Gateway returns credentials immediately
5. Consumer configures MCP client

**Pros:**
- Instant onboarding
- Fully automated
- Better UX

**Cons:**
- No human approval
- Potential abuse
- Need rate limiting

---

### Option C: Hybrid (Recommended)

**Flow:**
1. Consumer requests registration
2. Gateway creates tenant in Repo B (free tier)
3. Consumer gets API key immediately (limited access)
4. Consumer can use gateway with restrictions
5. Human approval required for full access

**Pros:**
- Instant start (free tier)
- Human approval for paid/unlimited
- Best of both worlds

**Cons:**
- More complex
- Need tier management

---

## Implementation Checklist

### For 100 Consumers

**Phase 1 (Current):**
- ❌ Not scalable (100 instances needed)
- ❌ High operational cost
- ❌ Manual deployment per consumer

**Phase 2 (Required):**
- ✅ Multi-tenant gateway
- ✅ API key handshake
- ✅ Tenant lookup from Repo B
- ✅ Automatic onboarding (or hybrid)
- ✅ Single gateway instance

**Repo B Changes Needed:**
- ✅ API key generation endpoint
- ✅ API key lookup endpoint
- ✅ Tenant creation endpoint (may already exist)
- ✅ API key → tenant mapping

**Gateway Changes Needed:**
- ✅ Extract tenant from API key
- ✅ Tenant lookup cache
- ✅ Remove single-tenant requirement
- ✅ API key validation

---

## Example: 100 Consumers Onboarding

### Day 1: Consumer 1-10

**Flow:**
1. Each consumer discovers gateway
2. Each calls `mcp.register`
3. Gateway/Repo B creates tenant + API key
4. Each receives credentials
5. Each configures MCP client
6. All use same gateway instance (Phase 2)

**Result:**
- 10 tenants in Repo B
- 10 API keys generated
- 1 gateway instance serving all 10

### Day 2-10: Consumers 11-100

**Same flow for each:**
- Discover → Register → Get API key → Configure → Use

**Result:**
- 100 tenants in Repo B
- 100 API keys generated
- 1 gateway instance serving all 100

---

## Security Considerations

### API Key Security

**Storage:**
- API keys stored as hashes in Repo B
- Never stored in plaintext
- Prefix visible (for identification)

**Validation:**
- Gateway validates API key format
- Gateway looks up tenant from Repo B
- Repo B verifies key hash

**Revocation:**
- API keys can be revoked in Repo B
- Gateway cache invalidated
- Immediate effect

### Tenant Isolation

**Critical:**
- Each tenant's requests are isolated
- Authorization scoped to tenant
- Audit logs scoped to tenant
- No cross-tenant data leakage

---

## Summary

### Current State (Phase 1)
- ❌ One gateway instance per consumer
- ❌ Not scalable for 100 consumers
- ❌ High operational overhead

### Required State (Phase 2)
- ✅ Single gateway instance for all consumers
- ✅ API key identifies tenant
- ✅ Repo B provides tenant mapping
- ✅ Automatic or hybrid onboarding
- ✅ Scalable to 100+ consumers

### What to Build
1. **Repo B:** API key management endpoints
2. **Gateway:** Multi-tenant support (API key → tenant lookup)
3. **Onboarding:** Automatic or hybrid flow

**Once built, 100 consumers can:**
1. Discover gateway
2. Register automatically
3. Get API key instantly
4. Configure MCP client
5. Start using gateway immediately

---

**Status:** Phase 1 complete, Phase 2 required for scale  
**Estimated Effort:** 2-3 days for Phase 2 implementation
