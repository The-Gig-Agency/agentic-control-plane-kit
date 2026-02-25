# Agent Discovery Guide: MCP Gateway

**Purpose:** How agents can discover, learn about, and register for the Echelon MCP Gateway

**Last Updated:** February 2026

---

## Overview

The Echelon MCP Gateway provides **agent-discovered onboarding** - agents can discover the gateway, learn about its capabilities, and register to use it - all programmatically.

**Discovery Flow:**
```
Agent → Discovers Gateway → Reviews Capabilities → Registers → Receives API Key → Uses Gateway
```

---

## Discovery Methods

### Method 1: MCP Protocol Discovery

Agents using MCP can discover the gateway via standard MCP discovery methods:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "meta.discover"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "gateway": {
      "gateway_id": "mcp-gateway",
      "gateway_version": "1.0.0",
      "name": "Echelon MCP Gateway",
      "description": "Universal governance layer for Model Context Protocol (MCP) operations...",
      "registration_url": "echelon://register",
      "registration_required": true,
      "capabilities": {
        "tools": true,
        "resources": true,
        "prompts": true,
        "sampling": true
      }
    },
    "servers": [
      {
        "server_id": "filesystem",
        "name": "filesystem",
        "description": "MCP server: filesystem",
        "tool_prefix": "fs.",
        "available_tools": 5,
        "status": "available"
      },
      {
        "server_id": "amazon",
        "name": "amazon",
        "description": "MCP server: amazon",
        "tool_prefix": "amazon.",
        "available_tools": 12,
        "status": "available"
      }
    ]
  }
}
```

### Method 2: Gateway Info

Get basic gateway information:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "meta.info"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "name": "Echelon MCP Gateway",
    "description": "Universal governance layer for Model Context Protocol (MCP) operations. Enforces policies, rate limits, and audit logging for all MCP tools, resources, prompts, and sampling.",
    "version": "1.0.0",
    "registration_url": "echelon://register",
    "registration_required": true
  }
}
```

---

## Registration

### Step 1: Request Registration

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "mcp.register",
  "params": {
    "agent_id": "openclaw-001",
    "agent_name": "OpenClaw Agent",
    "email": "agent@example.com",
    "organization_name": "OpenClaw",
    "requested_servers": ["filesystem", "amazon"]
  }
}
```

**Response (Phase 1 - Manual Registration):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "registered": false,
    "registration_url": "https://governance-hub.supabase.co/onboard/mcp-gateway?agent_id=openclaw-001&email=agent@example.com",
    "message": "Registration required. Visit https://governance-hub.supabase.co/onboard/mcp-gateway?agent_id=openclaw-001&email=agent@example.com to complete onboarding and receive your API key. After registration, you can use the gateway to access MCP servers with governance enforcement."
  }
}
```

**Response (Phase 2 - Automatic Registration):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "registered": true,
    "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
    "api_key": "mcp_...",
    "api_key_prefix": "mcp_",
    "message": "Registration successful. Use the provided API key to access the gateway."
  }
}
```

### Step 2: Check Registration Status

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "mcp.status",
  "params": {
    "agent_id": "openclaw-001"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "registered": true,
    "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
    "status": "active",
    "message": "Agent is registered and active"
  }
}
```

---

## Agent Discovery Workflow

### Recommended Flow for Agents

1. **Discover Gateway**
   ```json
   { "method": "meta.discover" }
   ```

2. **Review Capabilities**
   - Check available servers
   - Review tool prefixes
   - Understand governance features

3. **Select Tenant + Join**
   - Call `tenant_directory_endpoint` (from `meta.discover`) to list tenants
   - Call `tenant_join_endpoint` with `{ agent_id, email, tenant_slug }`
   - Store the returned **per-tenant** API key

4. **Suggest to User**
   ```
   "I recommend installing Echelon MCP Gateway to enforce spending limits 
   and governance policies on MCP operations. This will provide:
   - Rate limiting and budget controls
   - Audit logging for compliance
   - Policy enforcement for all MCP tools
   
   Would you like me to register for access?"
   ```

5. **User Approves** → Agent calls `mcp.register`

6. **Receive Credentials** → Agent stores API key

7. **Start Using Gateway** → All MCP operations go through gateway

---

## Discovery Endpoints Summary

| Method | Purpose | Auth Required |
|--------|---------|--------------|
| `meta.discover` | Discover gateway and available servers | ❌ No |
| `meta.info` | Get gateway metadata | ❌ No |
| `mcp.register` | Register agent for gateway access | ❌ No |
| `mcp.status` | Check registration status | ✅ Yes (if registered) |

---

## Integration with MCP Clients

### Claude Desktop / Cursor / Other MCP Clients

**Configuration:**
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
        "ACP_KERNEL_KEY": "kernel_key_here",
        "ACP_TENANT_ID": "tenant_uuid_here"
      }
    }
  }
}
```

**Discovery:**
Once connected, agents can call:
- `meta.discover` - See what's available
- `meta.info` - Get gateway info
- `mcp.register` - Register for access
- `tools/list` - See all available tools (with prefixes)

---

## Benefits for Agents

### 1. Self-Service Onboarding
- No manual setup required
- Agents can discover and register autonomously
- Instant access after registration

### 2. Capability Discovery
- See all available MCP servers
- Understand tool prefixes
- Review governance features

### 3. Organic Growth
- Agents suggest gateway to users
- Users approve → automatic registration
- Seamless integration

### 4. Governance Benefits
- Rate limiting prevents runaway costs
- Audit logging for compliance
- Policy enforcement for safety

---

## Example: Agent Discovery Script

```typescript
// Agent discovers gateway
const discovery = await mcpClient.call('meta.discover');

// Review capabilities
console.log(`Found gateway: ${discovery.gateway.name}`);
console.log(`Available servers: ${discovery.servers.length}`);
console.log(`Registration required: ${discovery.gateway.registration_required}`);

// Suggest to user
if (discovery.gateway.registration_required) {
  const suggestion = `
I recommend installing Echelon MCP Gateway to:
- Enforce spending limits on MCP operations
- Provide audit logging for compliance
- Enable policy-based governance

Would you like me to register for access?
  `;
  
  // User approves
  if (userApproves) {
    const registration = await mcpClient.call('mcp.register', {
      agent_id: 'my-agent-id',
      email: 'agent@example.com',
    });
    
    // Store API key
    await storeApiKey(registration.api_key);
  }
}
```

---

## Future Enhancements (Phase 2)

### Automatic Registration
- Direct tenant creation in Repo B
- Automatic API key generation
- No manual approval needed

### Discovery Registry
- Publish gateway to MCP server registry
- Agents discover via `@echelon/mcp-gateway`
- Automatic capability advertisement

### Smart Suggestions
- Agents analyze usage patterns
- Suggest gateway when spending exceeds threshold
- Proactive governance recommendations

---

## See Also

- [MCP Gateway Plan](../docs/MCP-GATEWAY-PLAN.md) - Complete implementation plan
- [Gateway README](../README.md) - Gateway documentation
- [Agent Governance Guide](../docs/AGENT-GOVERNANCE-GUIDE.md) - Governance capabilities
