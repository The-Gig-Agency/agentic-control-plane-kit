# Signup Flow Fixes - Agent Feedback Response

**Date:** February 24, 2026  
**Issue:** Agent cannot self-serve signup due to authentication chicken-and-egg problem  
**Status:** ✅ Fixed

---

## Issues Identified

### 1. ❌ Signup Endpoints Require X-API-Key
**Problem:** Gateway endpoints `/api/signup` and `/api/consumer/signup` require `X-API-Key`, but agents don't have one yet.

**Root Cause:** Signup should be on the main website (`www.buyechelon.com`), not the gateway. Gateway should not handle signup.

**Fix:** ✅ Gateway does NOT have signup endpoints (correct). Main website needs to expose public signup API.

---

### 2. ❌ Missing Signup API Information in Discovery

**Problem:** `meta.discover` only returns `registration_url` (web page), not the actual signup API endpoint.

**Fix:** ✅ Updated `discovery.ts` to return:
- `signup_api_base` - Base URL for signup API (e.g., `https://www.buyechelon.com`)
- `signup_endpoint` - Exact signup endpoint path (e.g., `/api/consumer/signup`)
- `registry_api_base` - Base URL for MCP registry (e.g., `https://governance-hub.supabase.co`)
- `docs_url` - Public documentation URL

**New Discovery Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "result": {
    "gateway": {
      "name": "Echelon MCP Gateway",
      "registration_url": "https://www.buyechelon.com/consumer",
      "signup_api_base": "https://www.buyechelon.com",
      "signup_endpoint": "/api/consumer/signup",
      "registry_api_base": "https://governance-hub.supabase.co",
      "docs_url": "https://github.com/The-Gig-Agency/echelon-control"
    }
  }
}
```

---

### 3. ❌ No Public Documentation Endpoint

**Problem:** Even OpenAPI/docs endpoints require authentication, so agents can't learn the API structure.

**Fix:** ✅ Added public `/docs` and `/openapi.json` endpoints (no auth required):
- Returns OpenAPI 3.0 specification
- Documents public endpoints (`/meta.discover`, `/health`)
- Documents authenticated endpoints (`/mcp`)
- Shows required headers and example payloads

---

### 4. ❌ Missing HTTP MCP Server Support

**Problem:** Registry only supports stdio-based MCP servers (command/args), but some servers are HTTP-based (e.g., Supabase MCP at `https://mcp.supabase.com/mcp`).

**Fix:** ✅ Added HTTP MCP server support:
- **Database migration:** Added `server_type`, `url`, `http_headers` columns
- **ServerConfig type:** Updated to support both `stdio` and `http` types
- **HttpMCPClient:** New client for HTTP-based MCP servers
- **MCPClientManager:** Updated to handle both stdio and HTTP clients
- **ProcessManager:** Updated to skip process spawning for HTTP servers

**New Server Registration (HTTP):**
```json
{
  "server_id": "supabase-mcp",
  "name": "Supabase MCP",
  "mode": "self_hosted",
  "server_type": "http",
  "url": "https://mcp.supabase.com/mcp",
  "http_headers": {
    "Authorization": "Bearer ${SUPABASE_TOKEN}"
  },
  "tool_prefix": "supabase."
}
```

---

## Files Changed

### Repo A (agentic-control-plane-kit)

**New Files:**
- ✅ `gateway/http-mcp-client.ts` - HTTP MCP client implementation

**Updated Files:**
- ✅ `gateway/discovery.ts` - Added signup API information
- ✅ `gateway/http-server.ts` - Added public docs endpoint, updated discovery response
- ✅ `gateway/types.ts` - Added HTTP server support to ServerConfig
- ✅ `gateway/server-registry.ts` - Support for HTTP servers from Repo B
- ✅ `gateway/mcp-client.ts` - Updated MCPClientManager for HTTP clients
- ✅ `gateway/process-manager.ts` - Skip spawning for HTTP servers
- ✅ `gateway/proxy.ts` - Handle HTTP clients in forwardToServer

### Repo B (governance-hub)

**New Migrations:**
- ✅ `20260224000001_add_http_mcp_server_support.sql` - Add HTTP server support

**Updated Files:**
- ✅ `supabase/functions/mcp-servers-list/index.ts` - Return server_type, url, http_headers

---

## Required Main Website Changes

**The main website (`www.buyechelon.com`) needs to expose a public signup API:**

### Endpoint: `POST /api/consumer/signup`

**Requirements:**
- ✅ **NO authentication required** (public endpoint)
- ✅ **CORS enabled** (allow requests from gateway domain)
- ✅ **Returns API key in response** (for programmatic signup)

**Request:**
```json
{
  "email": "agent@example.com",
  "organization_name": "My Company",
  "agent_id": "my-agent-001"
}
```

**Response:**
```json
{
  "ok": true,
  "tenant_id": "uuid",
  "api_key": "mcp_abc123...",
  "api_key_id": "uuid",
  "gateway_url": "https://gateway.buyechelon.com",
  "message": "Signup successful! Save your API key - it will not be shown again."
}
```

**Implementation:** See `SIGNUP-IMPLEMENTATION-GUIDE.md` for example edge function code.

---

## Testing the Fixes

### 1. Test Discovery Endpoint

```bash
curl https://gateway.buyechelon.com/meta.discover
```

**Expected:** Should return `signup_api_base`, `signup_endpoint`, `registry_api_base`, `docs_url`

### 2. Test Public Docs Endpoint

```bash
curl https://gateway.buyechelon.com/docs
curl https://gateway.buyechelon.com/openapi.json
```

**Expected:** Should return OpenAPI spec (no auth required)

### 3. Test Signup (After Main Website Fix)

```bash
curl -X POST https://www.buyechelon.com/api/consumer/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "organization_name": "Test Org",
    "agent_id": "test-agent"
  }'
```

**Expected:** Should return API key (no auth required)

### 4. Test HTTP MCP Server Registration

```bash
POST https://governance-hub.supabase.co/functions/v1/mcp-servers/register
X-API-Key: mcp_xxxxx

{
  "server_id": "supabase-mcp",
  "name": "Supabase MCP",
  "mode": "self_hosted",
  "server_type": "http",
  "url": "https://mcp.supabase.com/mcp",
  "http_headers": {
    "Authorization": "Bearer token"
  },
  "tool_prefix": "supabase."
}
```

**Expected:** Should register HTTP-based MCP server

---

## Summary of Fixes

✅ **Discovery returns signup API info** - Agents can find the signup endpoint  
✅ **Public docs endpoint** - Agents can learn API structure  
✅ **HTTP MCP server support** - Can register HTTP-based servers (Supabase, etc.)  
✅ **Gateway doesn't handle signup** - Correct architecture (signup on main website)  

**Remaining:** Main website needs to expose public `/api/consumer/signup` endpoint (see `SIGNUP-IMPLEMENTATION-GUIDE.md`)

---

**Document Version:** 1.0  
**Last Updated:** February 24, 2026
