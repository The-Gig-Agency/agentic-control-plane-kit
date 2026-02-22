# Hosted MCP Gateway Architecture

**Date:** February 2026  
**Approach:** Option A - Hosted Gateway (SaaS)  
**Status:** Recommended Architecture

---

## Executive Summary

Instead of consumers running the gateway locally, **we host it as a SaaS service**. Consumers connect via URL with their API key in headers.

**Benefits:**
- ✅ No local install required
- ✅ No environment variable config
- ✅ No dependency management
- ✅ Natural HTTP/WebSocket pattern
- ✅ Centralized scaling
- ✅ Easier monetization
- ✅ Multi-tenant by default

---

## Architecture Comparison

### Option A: Hosted Gateway (Recommended)

**Consumer Config:**
```json
{
  "mcpServers": {
    "echelon": {
      "url": "https://gateway.echelon.com",
      "headers": {
        "X-API-Key": "mcp_abc123..."
      }
    }
  }
}
```

**Flow:**
```
Consumer → HTTP/WebSocket → Hosted Gateway → Repo B → MCP Servers
```

**Benefits:**
- ✅ Zero setup for consumer
- ✅ Centralized management
- ✅ Automatic scaling
- ✅ SaaS monetization model

---

### Option B: Local Gateway (Current)

**Consumer Config:**
```json
{
  "mcpServers": {
    "echelon": {
      "command": "deno",
      "args": ["run", "gateway/server.ts"],
      "env": {
        "ACP_BASE_URL": "...",
        "ACP_KERNEL_KEY": "...",
        "ACP_TENANT_ID": "..."
      }
    }
  }
}
```

**Flow:**
```
Consumer → stdio → Local Gateway Process → Repo B → MCP Servers
```

**Drawbacks:**
- ❌ Requires Deno installation
- ❌ Requires environment variables
- ❌ Requires dependency management
- ❌ Per-consumer deployment
- ❌ Harder to monetize

---

## Hosted Gateway Architecture

### Infrastructure

**Single Hosted Gateway Service:**
- URL: `https://gateway.echelon.com`
- Protocol: HTTP/WebSocket (MCP over HTTP)
- Multi-tenant: All consumers use same instance
- Scaling: Horizontal scaling behind load balancer

**Components:**
```
┌─────────────────────────────────────┐
│   Load Balancer / CDN                │
│   gateway.echelon.com                │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│   Gateway Instances (Auto-scaling)    │
│   - Extract API key from headers      │
│   - Lookup tenant from Repo B        │
│   - Authorize with Repo B            │
│   - Forward to MCP servers            │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│   Governance Hub (Repo B)            │
│   - API key lookup                   │
│   - Authorization                    │
│   - Audit ingestion                  │
└──────────────────────────────────────┘
```

---

## Consumer Onboarding Flow (Hosted)

### Step 1: Consumer Discovers Gateway

**Consumer calls discovery endpoint:**

```http
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

**Consumer visits signup page:**
```
https://echelon.com/signup
```

**Or programmatic signup:**
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

**Signup service calls Repo B:**

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
  "scopes": ["mcp.tools", "mcp.resources", "mcp.prompts", "mcp.sampling"]
}
```

**Repo B Response:**
```json
{
  "api_key": "mcp_abc123def456...",
  "api_key_id": "key_123",
  "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "created_at": "2026-02-19T12:00:00Z"
}
```

---

### Step 5: Consumer Receives Credentials

**Consumer gets:**
- **API Key:** `mcp_abc123def456...`
- **Gateway URL:** `https://gateway.echelon.com`
- **Documentation:** How to configure MCP client

**Delivery:**
- Email with credentials
- Dashboard with copy-paste config
- API response (if programmatic)

---

### Step 6: Consumer Configures MCP Client

**Simple configuration:**

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
2. Lookup tenant from Repo B (cached)
3. Authorize action: `tool:fs.read_file`
4. Forward to MCP server
5. Return result
6. Emit audit event

---

## Gateway Implementation Changes

### Current: stdio-based (Local)

**Server:**
```typescript
// gateway/server.ts
// Reads from stdin, writes to stdout
for await (const chunk of Deno.stdin.readable) {
  // Process MCP request
  const response = await handleMCPRequest(request);
  await Deno.stdout.write(encoder.encode(JSON.stringify(response)));
}
```

---

### Required: HTTP-based (Hosted)

**Server:**
```typescript
// gateway/http-server.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

serve(async (req: Request) => {
  // Extract API key from headers
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'X-API-Key header required'
    }), { status: 401 });
  }

  // Lookup tenant
  const tenantId = await getTenantFromApiKey(apiKey);
  if (!tenantId) {
    return new Response(JSON.stringify({
      error: 'Invalid API key'
    }), { status: 401 });
  }

  // Parse MCP request
  const mcpRequest = await req.json();

  // Handle MCP request
  const response = await handleMCPRequest(mcpRequest, tenantId);

  // Return MCP response
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}, { port: 8000 });
```

---

## MCP Protocol over HTTP

### Request Format

**HTTP POST:**
```http
POST https://gateway.echelon.com/mcp
Content-Type: application/json
X-API-Key: mcp_abc123...

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { ... }
}
```

### Response Format

**HTTP 200:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

### Error Format

**HTTP 4xx/5xx:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Authorization denied"
  }
}
```

---

## WebSocket Support (Optional)

**For real-time/bidirectional communication:**

```typescript
// gateway/websocket-server.ts
Deno.serve({
  handler: (req) => {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      
      socket.onopen = () => {
        // Extract API key from query params or initial message
        const apiKey = new URL(req.url).searchParams.get('api_key');
        // Lookup tenant, store in connection
      };

      socket.onmessage = async (e) => {
        const mcpRequest = JSON.parse(e.data);
        const response = await handleMCPRequest(mcpRequest, tenantId);
        socket.send(JSON.stringify(response));
      };

      return response;
    }
  },
});
```

**Consumer Config:**
```json
{
  "mcpServers": {
    "echelon": {
      "url": "wss://gateway.echelon.com?api_key=mcp_abc123..."
    }
  }
}
```

---

## Multi-Tenant Architecture

### Single Gateway Instance

**All 100 consumers use same gateway:**
```
Consumer 1 → https://gateway.echelon.com (X-API-Key: mcp_key_001)
Consumer 2 → https://gateway.echelon.com (X-API-Key: mcp_key_002)
...
Consumer 100 → https://gateway.echelon.com (X-API-Key: mcp_key_100)
```

**Gateway identifies tenant:**
```typescript
// Extract API key from header
const apiKey = req.headers.get('X-API-Key');

// Lookup tenant (cached)
const tenantId = await tenantCache.get(apiKey) || 
  await lookupTenantFromRepoB(apiKey);

// Use tenant_id for authorization
await authorizeAction(action, params, tenantId, ...);
```

---

## Scaling Architecture

### Horizontal Scaling

**Load Balancer:**
```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │ gateway.echelon │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌──────▼──────┐
│ Gateway       │   │ Gateway         │   │ Gateway     │
│ Instance 1    │   │ Instance 2      │   │ Instance N  │
└───────┬───────┘   └────────┬────────┘   └──────┬──────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Repo B         │
                    │  (Governance)   │
                    └─────────────────┘
```

**Benefits:**
- Auto-scaling based on load
- High availability
- Geographic distribution
- Cost-effective

---

## Monetization Model

### Pricing Tiers

**Free Tier:**
- 100 MCP operations/month
- Basic MCP servers (filesystem)
- Community support

**Pro Tier:**
- Unlimited operations
- All MCP servers
- Priority support
- Custom policies

**Enterprise Tier:**
- Unlimited operations
- All MCP servers
- Custom policies
- Dedicated support
- SLA guarantees

### Billing Integration

**Repo B tracks usage:**
- Audit logs count operations per tenant
- Monthly billing based on usage
- Stripe integration (via Repo C)

**Gateway enforces limits:**
- Check tier before authorization
- Rate limit based on tier
- Upgrade prompts

---

## Security Model

### API Key Security

**Storage:**
- API keys stored as hashes in Repo B
- Never transmitted in logs
- Prefix visible for identification

**Validation:**
- Gateway validates API key format
- Gateway looks up tenant from Repo B
- Repo B verifies key hash
- Keys can be revoked instantly

### Tenant Isolation

**Critical:**
- Each tenant's requests isolated
- Authorization scoped to tenant
- Audit logs scoped to tenant
- No cross-tenant data leakage
- Rate limits per tenant

---

## Deployment Architecture

### Gateway Service

**Infrastructure:**
- Deno Deploy / Fly.io / Railway
- Auto-scaling
- Health monitoring
- Zero-downtime deployments

**Environment Variables:**
```bash
# Gateway service
ACP_BASE_URL=https://governance-hub.supabase.co
ACP_KERNEL_KEY=gateway_kernel_key
GATEWAY_URL=https://gateway.echelon.com
```

**No per-consumer config needed!**

---

## Consumer Experience

### Before (Local Gateway)

**Consumer must:**
1. Install Deno
2. Clone/download gateway code
3. Set environment variables
4. Configure MCP client with command
5. Manage dependencies
6. Handle updates

**Friction:** High ❌

---

### After (Hosted Gateway)

**Consumer must:**
1. Sign up at echelon.com
2. Get API key
3. Add URL to MCP client config

**Friction:** Minimal ✅

---

## Implementation Plan

### Phase 1: HTTP Server

**Add HTTP server to gateway:**
- `gateway/http-server.ts` - HTTP endpoint
- Extract API key from headers
- Lookup tenant from Repo B
- Handle MCP requests over HTTP

### Phase 2: Multi-Tenant Support

**Update auth:**
- Remove `ACP_TENANT_ID` requirement
- Add API key → tenant lookup
- Add tenant cache

### Phase 3: Hosting Infrastructure

**Deploy gateway:**
- Set up hosting (Deno Deploy/Fly.io)
- Configure domain (gateway.echelon.com)
- Set up load balancer
- Configure auto-scaling

### Phase 4: Signup Flow

**Build onboarding:**
- Signup page/service
- Tenant creation in Repo B
- API key generation
- Email delivery

---

## API Endpoints

### Gateway Endpoints

**MCP Protocol:**
- `POST /mcp` - MCP JSON-RPC requests
- `GET /health` - Health check
- `GET /meta.discover` - Discovery (public)
- `POST /mcp.register` - Registration (public)

**Admin (Internal):**
- `GET /admin/stats` - Gateway statistics
- `GET /admin/tenants` - Active tenants

---

## Monitoring

### Key Metrics

**Per Tenant:**
- Requests per second
- Authorization latency
- Cache hit rate
- Error rate

**Gateway Overall:**
- Total requests/second
- Active tenants
- Average latency
- Uptime

**Repo B Integration:**
- Authorization request volume
- Audit event volume
- API key lookup latency

---

## Cost Model

### Infrastructure Costs

**Gateway Hosting:**
- Compute: ~$50-200/month (scales with usage)
- Bandwidth: ~$20-100/month
- Database (if needed): ~$25/month

**Per Consumer:**
- Minimal incremental cost
- Scales linearly with usage
- Profitable at scale

### Revenue Model

**Free Tier:** $0 (loss leader)
**Pro Tier:** $29/month
**Enterprise:** Custom pricing

**At 100 consumers:**
- 10% Pro = $290/month
- 5% Enterprise = $500+/month
- Revenue: $790+/month
- Costs: ~$200/month
- Profit: $590+/month

---

## Summary

### Hosted Gateway Benefits

**For Consumers:**
- ✅ Zero setup
- ✅ No dependencies
- ✅ Instant access
- ✅ Always up-to-date

**For You:**
- ✅ Centralized control
- ✅ Easier monetization
- ✅ Better scaling
- ✅ Simpler operations

**Architecture:**
- ✅ Clean HTTP/WebSocket
- ✅ Natural API key pattern
- ✅ Multi-tenant by default
- ✅ SaaS-ready

---

**Recommendation:** Implement hosted gateway architecture  
**Effort:** 3-5 days  
**Impact:** High (enables scale and monetization)
