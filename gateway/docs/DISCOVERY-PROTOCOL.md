# MCP Gateway Discovery Protocol

**Purpose:** Technical specification for agent discovery of the Echelon MCP Gateway

**Last Updated:** February 2026

---

## Protocol Overview

The MCP Gateway implements a discovery protocol that allows agents to:
1. Discover gateway capabilities
2. Learn about available MCP servers
3. Register for access
4. Check registration status

All discovery endpoints are **public** (no authentication required) to enable organic agent discovery.

---

## Discovery Endpoints

### 1. `meta.discover`

**Purpose:** Discover gateway capabilities and available servers

**Request:**
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
        "description": "MCP server: filesystem (5 tools available)",
        "tool_prefix": "fs.",
        "available_tools": 5,
        "status": "available"
      }
    ],
    "total_tools": 17
  }
}
```

### 2. `meta.info`

**Purpose:** Get basic gateway metadata

**Request:**
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
    "description": "Universal governance layer for Model Context Protocol (MCP) operations...",
    "version": "1.0.0",
    "registration_url": "echelon://register",
    "registration_required": true
  }
}
```

### 3. `mcp.register`

**Purpose:** Register agent for gateway access

**Request:**
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

**Response (Phase 1 - Manual):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "registered": false,
    "registration_url": "https://governance-hub.supabase.co/onboard/mcp-gateway?agent_id=openclaw-001&email=agent@example.com",
    "message": "Registration required. Visit [URL] to complete onboarding..."
  }
}
```

**Response (Phase 2 - Automatic):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "registered": true,
    "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
    "api_key": "mcp_abc123...",
    "api_key_prefix": "mcp_",
    "message": "Registration successful. Use the provided API key to access the gateway."
  }
}
```

### 4. `mcp.status`

**Purpose:** Check registration status

**Request:**
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

## Registration URL Protocol

### `echelon://register`

**Format:**
```
echelon://register?agent_id={agent_id}&email={email}&servers={server1,server2}
```

**Example:**
```
echelon://register?agent_id=openclaw-001&email=agent@example.com&servers=filesystem,amazon
```

**Implementation:**
- Agents can use this URL to trigger registration
- Can be opened in browser or handled programmatically
- Redirects to Governance Hub onboarding page

---

## Agent Discovery Workflow

### Step 1: Initial Discovery

Agent connects to gateway and calls `meta.discover`:

```typescript
const discovery = await mcpClient.call('meta.discover');
console.log(`Found gateway: ${discovery.gateway.name}`);
console.log(`Available servers: ${discovery.servers.length}`);
console.log(`Total tools: ${discovery.total_tools}`);
```

### Step 2: Capability Review

Agent reviews capabilities:

```typescript
if (discovery.gateway.capabilities.tools) {
  console.log('✅ Tools governance available');
}
if (discovery.gateway.capabilities.resources) {
  console.log('✅ Resources governance available');
}
```

### Step 3: User Suggestion

Agent suggests gateway to user:

```typescript
const suggestion = `
I recommend installing Echelon MCP Gateway to:
- Enforce spending limits on MCP operations
- Provide audit logging for compliance  
- Enable policy-based governance

Available servers: ${discovery.servers.map(s => s.name).join(', ')}
Total tools: ${discovery.total_tools}

Would you like me to register for access?
`;
```

### Step 4: Registration

If user approves:

```typescript
const registration = await mcpClient.call('mcp.register', {
  agent_id: 'my-agent-id',
  email: 'agent@example.com',
  requested_servers: ['filesystem', 'amazon'],
});

if (registration.registered) {
  // Store API key
  await storeApiKey(registration.api_key);
  console.log('✅ Registered successfully');
} else {
  // Manual registration required
  console.log(`Visit: ${registration.registration_url}`);
}
```

### Step 5: Status Check

```typescript
const status = await mcpClient.call('mcp.status', {
  agent_id: 'my-agent-id',
});

if (status.registered && status.status === 'active') {
  console.log('✅ Gateway access active');
}
```

---

## Error Handling

### Discovery Errors

**Server Unavailable:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32003,
    "message": "Service unavailable",
    "data": {
      "message": "Server 'amazon' is not available",
      "retryable": true
    }
  }
}
```

**Registration Failed:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "message": "agent_id is required",
      "field": "agent_id"
    }
  }
}
```

---

## Integration Examples

### Claude Desktop

**Configuration:**
```json
{
  "mcpServers": {
    "echelon": {
      "command": "deno",
      "args": ["run", "gateway/server.ts"],
      "env": {
        "ACP_BASE_URL": "https://governance-hub.supabase.co",
        "ACP_KERNEL_KEY": "...",
        "ACP_TENANT_ID": "..."
      }
    }
  }
}
```

**Discovery:**
```typescript
// Agent automatically discovers on connection
const tools = await echelonClient.call('tools/list');
// Tools are prefixed: fs.read_file, amazon.order, etc.
```

### Cursor / Other MCP Clients

Same protocol - agents can discover and register programmatically.

---

## Future Enhancements

### Phase 2: Automatic Registration
- Direct tenant creation
- Automatic API key generation
- No manual approval needed

### Phase 3: Discovery Registry
- Publish to MCP server registry
- Agents discover via `@echelon/mcp-gateway`
- Automatic capability advertisement

### Phase 4: Smart Suggestions
- Usage pattern analysis
- Proactive governance recommendations
- Automatic registration triggers

---

## See Also

- [Agent Discovery Guide](./AGENT-DISCOVERY-GUIDE.md) - User-facing guide
- [MCP Gateway Plan](../MCP-GATEWAY-PLAN.md) - Implementation plan
- [Gateway README](../README.md) - Gateway documentation
