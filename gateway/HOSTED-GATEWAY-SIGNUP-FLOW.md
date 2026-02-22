# Hosted Gateway: Sign-Up Flow for 100 Consumers

**Architecture:** Hosted Gateway (Option A)  
**Scale:** 100 consumers on single gateway instance

---

## Complete Sign-Up Flow

### Step 1: Consumer Discovers Gateway

**Consumer visits or agent discovers:**
```
GET https://gateway.echelon.com/meta.discover
```

**Response:**
```json
{
  "gateway": {
    "name": "Echelon MCP Gateway",
    "url": "https://gateway.echelon.com",
    "registration_required": true,
    "registration_url": "https://echelon.com/signup"
  }
}
```

---

### Step 2: Consumer Signs Up

**Option A: Web Signup (Recommended)**
```
Consumer → https://echelon.com/signup
  - Enters email
  - Enters organization name
  - Clicks "Sign Up"
```

**Option B: Programmatic Signup**
```http
POST https://echelon.com/api/signup
Content-Type: application/json

{
  "email": "consumer@example.com",
  "organization_name": "Consumer Corp",
  "agent_id": "consumer-001"
}
```

---

### Step 3: Create Tenant in Repo B

**Signup service (or gateway) calls Repo B:**

```http
POST https://governance-hub.supabase.co/functions/v1/tenants/create
Authorization: Bearer {SIGNUP_SERVICE_KEY}
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

**What Happens:**
- Tenant record created in Repo B
- Tenant UUID assigned
- Initial tier set (e.g., "free")
- Ready for API key generation

---

### Step 4: Generate API Key

**Signup service calls Repo B:**

```http
POST https://governance-hub.supabase.co/functions/v1/api-keys/create
Authorization: Bearer {SIGNUP_SERVICE_KEY}
Content-Type: application/json

{
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "prefix": "mcp_",
  "scopes": ["mcp.tools", "mcp.resources", "mcp.prompts", "mcp.sampling"],
  "name": "Consumer Corp - Primary Key"
}
```

**Repo B Response:**
```json
{
  "api_key": "mcp_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
  "api_key_id": "key_123",
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "prefix": "mcp_",
  "created_at": "2026-02-19T12:00:00Z"
}
```

**What Gets Stored in Repo B:**
- API key hash (SHA-256)
- API key prefix (`mcp_`)
- Tenant mapping (api_key_id → tenant_id)
- Scopes/permissions
- Creation timestamp

---

### Step 5: Consumer Receives Credentials

**Consumer gets:**
1. **API Key:** `mcp_abc123def456...`
2. **Gateway URL:** `https://gateway.echelon.com`
3. **Quick Start Guide:** How to configure MCP client

**Delivery Methods:**
- **Email:** Credentials sent to consumer's email
- **Dashboard:** Consumer can view/copy from dashboard
- **API Response:** If programmatic signup

**Email Template:**
```
Subject: Welcome to Echelon MCP Gateway

Your API Key: mcp_abc123def456...
Gateway URL: https://gateway.echelon.com

Configure your MCP client:
{
  "mcpServers": {
    "echelon": {
      "url": "https://gateway.echelon.com",
      "headers": {
        "X-API-Key": "mcp_abc123def456..."
      }
    }
  }
}
```

---

### Step 6: Consumer Configures MCP Client

**Simple configuration (no install needed!):**

```json
{
  "mcpServers": {
    "echelon": {
      "url": "https://gateway.echelon.com",
      "headers": {
        "X-API-Key": "mcp_abc123def456..."
      }
    }
  }
}
```

**That's it!** No:
- ❌ Local installation
- ❌ Environment variables
- ❌ Dependency management
- ❌ Command configuration
- ❌ Updates to manage

---

### Step 7: Consumer Uses Gateway

**Consumer makes MCP request:**

```http
POST https://gateway.echelon.com/mcp
Content-Type: application/json
X-API-Key: mcp_abc123def456...

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fs.read_file",
    "arguments": { "path": "/tmp/test.txt" }
  }
}
```

**Gateway Flow:**
1. Extract API key from `X-API-Key` header
2. Lookup tenant from Repo B: `POST /api-keys/lookup`
3. Cache tenant mapping (API key → tenant_id)
4. Authorize action: `POST /authorize { tenant_id, action: "tool:fs.read_file" }`
5. If allowed, forward to MCP server
6. Return result to consumer
7. Emit audit event: `POST /audit-ingest`

---

## Flow for All 100 Consumers

### Consumer 1

```
1. Discovers gateway → https://gateway.echelon.com/meta.discover
2. Signs up → https://echelon.com/signup
3. Gets API key → mcp_key_001
4. Configures MCP client with mcp_key_001
5. Uses gateway → Identified as tenant-1
```

### Consumer 2

```
1. Discovers gateway → Same URL
2. Signs up → Same signup flow
3. Gets API key → mcp_key_002
4. Configures MCP client with mcp_key_002
5. Uses gateway → Identified as tenant-2
```

### ...Consumer 100

```
Same flow, all use same gateway URL
Each identified by unique API key
All requests go to: https://gateway.echelon.com
```

---

## What Needs to Be Built

### 1. Repo B: API Key Management

**New Endpoints:**
- `POST /functions/v1/api-keys/create` - Generate API key
- `POST /functions/v1/api-keys/lookup` - Get tenant from API key
- `GET /functions/v1/api-keys/{id}` - Get API key details
- `DELETE /functions/v1/api-keys/{id}` - Revoke API key

**Database (may already exist):**
```sql
-- api_keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT[],
  name TEXT,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
```

---

### 2. Gateway: HTTP Server

**New File:** `gateway/http-server.ts`

**Features:**
- HTTP endpoint: `POST /mcp`
- Extract API key from headers
- Lookup tenant from Repo B
- Handle MCP requests
- Return MCP responses

**Status:** ✅ Created (needs testing)

---

### 3. Gateway: Multi-Tenant Auth

**Update:** `gateway/auth.ts`

**New Function:** `extractTenantFromApiKey()`
- Validates API key format
- Looks up tenant from Repo B
- Caches results
- Handles errors

**Status:** ✅ Implemented (needs Repo B endpoint)

---

### 4. Signup Service (Optional)

**Could be:**
- Part of Repo B (onboarding endpoint)
- Separate service
- Gateway itself (if automatic registration)

**Features:**
- Web signup form
- Programmatic signup API
- Email delivery
- Dashboard access

---

## Complete Architecture

```
┌─────────────────────────────────────┐
│  100 Consumers (Agents)             │
│  - Consumer 1 (mcp_key_001)         │
│  - Consumer 2 (mcp_key_002)         │
│  - ...                               │
│  - Consumer 100 (mcp_key_100)        │
└──────────────┬───────────────────────┘
               │ HTTP/WebSocket
               │ X-API-Key header
               ▼
┌─────────────────────────────────────┐
│  Hosted Gateway                      │
│  https://gateway.echelon.com         │
│  - Extract API key                   │
│  - Lookup tenant (cached)            │
│  - Authorize with Repo B             │
│  - Forward to MCP servers            │
└──────────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌──────────────┐  ┌──────────────┐
│  Repo B       │  │  MCP Servers │
│  - API key    │  │  - Filesystem│
│    lookup     │  │  - Amazon    │
│  - Authorize  │  │  - Stripe    │
│  - Audit      │  │  - ...       │
└──────────────┘  └──────────────┘
```

---

## Benefits of Hosted Architecture

### For Consumers

**Zero Setup:**
- ✅ No installation
- ✅ No dependencies
- ✅ No configuration files
- ✅ Just a URL and API key

**Always Available:**
- ✅ Gateway always running
- ✅ No maintenance
- ✅ Automatic updates
- ✅ High availability

**Simple Integration:**
```json
{
  "url": "https://gateway.echelon.com",
  "headers": { "X-API-Key": "mcp_..." }
}
```

---

### For You

**Centralized Control:**
- ✅ Single gateway instance
- ✅ Easy to monitor
- ✅ Easy to update
- ✅ Centralized scaling

**Monetization:**
- ✅ SaaS pricing model
- ✅ Usage-based billing
- ✅ Tier management
- ✅ Easy to track revenue

**Scalability:**
- ✅ Horizontal scaling
- ✅ Load balancing
- ✅ Auto-scaling
- ✅ Cost-effective

---

## Implementation Status

### ✅ Completed

- HTTP server implementation (`gateway/http-server.ts`)
- API key extraction from headers
- Tenant lookup function (needs Repo B endpoint)
- Multi-tenant request handling
- CORS support
- Health check endpoint
- Discovery endpoint

### ⚠️ Needs Repo B

- `POST /functions/v1/api-keys/create` - Generate API key
- `POST /functions/v1/api-keys/lookup` - Get tenant from API key
- API key storage (may already exist)

### ⚠️ Needs Deployment

- Host gateway on Deno Deploy / Fly.io / Railway
- Configure domain: `gateway.echelon.com`
- Set up load balancer
- Configure auto-scaling

### ⚠️ Needs Signup Flow

- Signup page/service
- Tenant creation integration
- API key generation integration
- Email delivery

---

## Next Steps

1. **Build Repo B endpoints** (API key management)
2. **Test HTTP server** (local testing)
3. **Deploy gateway** (hosting infrastructure)
4. **Build signup flow** (onboarding service)
5. **Test with real consumers** (pilot program)

---

**Status:** Architecture designed, HTTP server implemented  
**Ready for:** Repo B integration and deployment
