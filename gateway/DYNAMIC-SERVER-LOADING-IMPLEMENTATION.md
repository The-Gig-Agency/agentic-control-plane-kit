# Dynamic Server Loading Implementation

**Date:** February 23, 2026  
**Status:** ✅ Complete  
**Purpose:** Enable agents to register MCP servers and use them immediately without gateway restarts

---

## Summary

The gateway now supports **dynamic server loading** from Repo B, allowing agents to:
- ✅ Register MCP servers via Repo B API
- ✅ Use registered servers immediately (no gateway restart)
- ✅ Support both **hosted mode** (pre-approved connectors) and **self_hosted mode** (custom commands)
- ✅ Automatic server spawning on-demand
- ✅ Per-tenant server isolation

---

## What Was Implemented

### 1. Server Registry Module (`gateway/server-registry.ts`)

**Purpose:** Fetches and caches MCP server configurations per tenant from Repo B.

**Features:**
- ✅ Fetches servers from `GET /functions/v1/mcp-servers/list`
- ✅ Caches server configs per tenant (1 minute TTL)
- ✅ Resolves **hosted mode** connectors to command/args
- ✅ Supports **self_hosted mode** with direct command/args
- ✅ Connector caching (1 hour TTL)

**Key Methods:**
- `getServers(tenantId)` - Get all servers for a tenant (with caching)
- `getServer(tenantId, serverId)` - Get specific server
- `invalidateCache(tenantId)` - Clear cache when servers are updated

### 2. Updated Proxy (`gateway/proxy.ts`)

**Changes:**
- ✅ Added `ServerRegistry` instance to proxy
- ✅ `aggregateTools()` now accepts `tenantId` and loads servers dynamically
- ✅ `handleToolCall()` uses dynamic server registry (falls back to static config)
- ✅ `ensureServerSpawned()` spawns servers on-demand
- ✅ On-demand server spawning when tools are called

**Flow:**
1. Agent calls `tools/call` with tool name
2. Proxy loads servers from registry (or uses static config)
3. Finds server for tool (by tool_prefix)
4. Spawns server if not already running
5. Forwards request to server

### 3. Updated Server Initialization (`gateway/server.ts`)

**Changes:**
- ✅ Static servers are now **optional** (gateway can run without them)
- ✅ Gateway runs in "dynamic mode" when no static servers configured
- ✅ Static servers spawn at startup (for backward compatibility)
- ✅ Dynamic servers spawn on-demand

### 4. Updated Repo B List Endpoint

**File:** `governance-hub/supabase/functions/mcp-servers-list/index.ts`

**Changes:**
- ✅ Returns all fields including `mode`, `connector_id`, `connector_version`, `connector_config`

---

## How It Works

### Hosted Mode (Pre-approved Connectors)

1. **Agent registers server:**
   ```json
   {
     "server_id": "my-shopify-server",
     "name": "My Shopify Server",
     "mode": "hosted",
     "connector_id": "shopify",
     "tool_prefix": "shopify."
   }
   ```

2. **Gateway resolves connector:**
   - Fetches connector details from Repo B (`/functions/v1/connectors/list`)
   - Maps `connector_id` to command/args (e.g., `npx @modelcontextprotocol/server-shopify`)
   - Creates `ServerConfig` with resolved command/args

3. **Gateway spawns server on-demand:**
   - When agent calls `shopify.orders.list`
   - Gateway finds server by tool_prefix
   - Spawns server if not running
   - Forwards request

### Self-Hosted Mode (Custom Commands)

1. **Agent registers server:**
   ```json
   {
     "server_id": "my-custom-server",
     "name": "My Custom Server",
     "mode": "self_hosted",
     "command": "node",
     "args": ["./my-mcp-server.js"],
     "tool_prefix": "custom."
   }
   ```

2. **Gateway uses command/args directly:**
   - No connector resolution needed
   - Uses provided command/args as-is

3. **Gateway spawns server on-demand:**
   - Same on-demand spawning as hosted mode

---

## Caching Strategy

### Server Config Cache
- **TTL:** 1 minute (60,000ms)
- **Key:** `tenantId`
- **Invalidation:** Manual via `invalidateCache()` or automatic on TTL expiry

### Connector Cache
- **TTL:** 1 hour (3,600,000ms)
- **Key:** `connector_id`
- **Invalidation:** Automatic on TTL expiry

---

## Backward Compatibility

✅ **Static servers still work:**
- Gateway can still use `config.json` for static servers
- Static servers spawn at startup (as before)
- Dynamic servers are loaded on-demand

✅ **Hybrid mode:**
- Gateway can use both static and dynamic servers
- Static servers for shared infrastructure
- Dynamic servers for per-tenant customization

---

## API Changes

### Repo B: `GET /functions/v1/mcp-servers/list`

**Updated Response:**
```json
{
  "ok": true,
  "data": {
    "servers": [
      {
        "id": "uuid",
        "server_id": "my-shopify-server",
        "name": "My Shopify Server",
        "command": null,  // null for hosted mode
        "args": null,     // null for hosted mode
        "tool_prefix": "shopify.",
        "enabled": true,
        "mode": "hosted",
        "connector_id": "shopify",
        "connector_version": "1.0.0",
        "connector_config": { "store_url": "mystore.myshopify.com" },
        "created_at": "2026-02-23T...",
        "updated_at": "2026-02-23T..."
      }
    ],
    "count": 1
  }
}
```

---

## Testing

### Test Dynamic Server Loading

1. **Register a server:**
   ```bash
   curl -X POST https://your-governance-hub.supabase.co/functions/v1/mcp-servers/register \
     -H "X-API-Key: mcp_xxxxx" \
     -H "Content-Type: application/json" \
     -d '{
       "server_id": "test-server",
       "name": "Test Server",
       "mode": "self_hosted",
       "command": "node",
       "args": ["test.js"],
       "tool_prefix": "test."
     }'
   ```

2. **Call a tool:**
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "test.my_tool",
       "arguments": {}
     }
   }
   ```

3. **Verify:**
   - Gateway loads server from Repo B
   - Server spawns on-demand
   - Tool call succeeds

---

## Future Enhancements

### Phase 2: Connector Registry
- [ ] Store command/args in `connectors` table
- [ ] Remove hardcoded connector mappings
- [ ] Support connector versioning

### Phase 3: Server Health Monitoring
- [ ] Monitor dynamically spawned servers
- [ ] Auto-restart failed servers
- [ ] Circuit breaker for unhealthy servers

### Phase 4: Server Lifecycle Management
- [ ] Graceful server shutdown
- [ ] Server resource limits
- [ ] Server usage metrics

---

## Files Changed

### New Files
- ✅ `gateway/server-registry.ts` - Server registry module

### Updated Files
- ✅ `gateway/proxy.ts` - Added dynamic server loading
- ✅ `gateway/server.ts` - Made static servers optional
- ✅ `governance-hub/supabase/functions/mcp-servers-list/index.ts` - Return all fields

### No Changes Needed
- ✅ `gateway/process-manager.ts` - Already supports on-demand spawning
- ✅ `gateway/namespace.ts` - Works with both static and dynamic configs

---

## Summary

**Before:**
- ❌ Servers only from static `config.json`
- ❌ Gateway restart required to add servers
- ❌ All tenants shared same servers

**After:**
- ✅ Servers loaded dynamically from Repo B
- ✅ No gateway restart needed
- ✅ Per-tenant server isolation
- ✅ On-demand server spawning
- ✅ Support for hosted and self_hosted modes

**Result:** Agents can now register MCP servers and use them immediately! 🎉

---

**Document Version:** 1.0  
**Last Updated:** February 23, 2026
