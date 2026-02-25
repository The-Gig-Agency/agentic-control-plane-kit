# Echelon MCP Gateway

A registered Echelon kernel that provides universal governance for the Model Context Protocol (MCP) ecosystem.

## Overview

The MCP Gateway is **not middleware** — it is a **registered kernel** in the Echelon ecosystem that:

- ✅ Enforces governance policies on all MCP operations (tools, resources, prompts, sampling)
- ✅ Registers with Repo B (Governance Hub) as `kernelId: "mcp-gateway"`
- ✅ Emits audit events to Repo B
- ✅ Caches authorization decisions for performance
- ✅ Manages downstream MCP server lifecycle
- ✅ Provides fail-closed security model

**Flow:**
```
Agent → MCP Gateway (Kernel) → [authorize] Repo B → MCP Gateway → Executor MCP (Repo C) → External APIs
```

## Quick Start

### 1. Configuration

Copy `config.json.example` to `config.json`:

```bash
cp config.json.example config.json
```

Edit `config.json` to define your downstream MCP servers:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/tmp"],
      "tool_prefix": "fs."
    }
  },
  "kernel": {
    "kernelId": "mcp-gateway",
    "version": "1.0.0"
  }
}
```

**Critical:** Every server **must** have a `tool_prefix` ending with `.` to prevent tool name collisions.

### 2. Environment Variables

Set required environment variables:

```bash
export ACP_BASE_URL="https://your-governance-hub.supabase.co"
export ACP_KERNEL_KEY="your_kernel_api_key"
export ACP_TENANT_ID="your_tenant_uuid"
```

### 3. Run Gateway

```bash
deno run --allow-net --allow-run --allow-read --allow-env gateway/server.ts
```

## Architecture

### Modules

- **`server.ts`** - Main entry point, initializes all components
- **`proxy.ts`** - MCP protocol handling and routing
- **`process-manager.ts`** - Spawns and manages downstream MCP servers
- **`health.ts`** - Monitors server health, circuit breaker pattern
- **`auth.ts`** - Tenant extraction and actor identification
- **`cache.ts`** - Authorization decision caching
- **`namespace.ts`** - Tool name resolution and routing
- **`policy.ts`** - Authorization enforcement
- **`audit.ts`** - Audit event emission to Repo B
- **`config.ts`** - Configuration loading and validation
- **`types.ts`** - TypeScript type definitions

### Integration with Three-Repo Architecture

- **Repo A (agentic-control-plane-kit)**: Gateway uses `ControlPlaneAdapter` from kernel
- **Repo B (governance-hub)**: Gateway registers as kernel, calls `/authorize`, emits audit events
- **Repo C (key-vault-executor)**: Gateway does NOT store credentials; Executor MCP handles external API execution

## MCP Protocol Coverage

The gateway governs **all** MCP protocol features:

| MCP Type | Governance Action |
|----------|------------------|
| **Tool** | `authorize({ action: "tool:amazon.order" })` |
| **Resource** | `authorize({ action: "resource:filesystem.read" })` |
| **Prompt** | `authorize({ action: "prompt:template.get" })` |
| **Sampling** | `authorize({ action: "sampling:model.call" })` |

## Security Model

### Credential Separation

**Critical:** The gateway does **not** store external service credentials.

**Execution Chain:**
```
Agent
  ↓
MCP Gateway (Kernel) ← Governance enforcement
  ↓
Executor MCP (Repo C) ← Credential storage + execution
  ↓
External API (Amazon, Stripe, Shopify, etc.)
```

### Fail-Closed Behavior

- Authorization failures → deny
- Downstream server crashes → deny
- Network timeouts → deny

Security > availability.

## Performance

### Decision Caching

Authorization decisions are cached using `decision_ttl_ms` from `AuthorizationResponse`:

- Cache key: `tenantId + action + request_hash`
- Only caches `allow` decisions
- Prevents authorization latency from blocking throughput

### Connection Pooling

- Reuses connections to downstream MCP servers
- Connection limits per server
- Timeout handling

## Consumer Configuration

### Agent MCP Client Config

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

## Development

### Testing

```bash
# Unit tests (TODO)
deno test gateway/

# Integration tests (TODO)
deno test gateway/integration/
```

### Debugging

Set `LOG_LEVEL=debug` for verbose logging:

```bash
LOG_LEVEL=debug deno run --allow-net --allow-run --allow-read --allow-env gateway/server.ts
```

## Implementation Status

### Phase 1: MVP (Current)

- ✅ Core modules implemented
- ✅ Configuration loading
- ✅ Authorization integration
- ✅ Process management
- ✅ Health monitoring
- ⚠️ MCP protocol communication (placeholder)
- ⚠️ Audit emission (logging only)

### Phase 2: Full MCP Protocol

- [x] Complete MCP protocol implementation
- [x] Resource governance (read & write)
- [x] Prompt governance
- [x] Sampling governance

### Phase 3: Multi-Tenant

- [ ] API key handshake
- [ ] Tenant mapping from Repo B
- [ ] Enhanced security

## Agent Discovery

Agents can discover the gateway and register for access programmatically:

```json
// Discover gateway capabilities
{ "method": "meta.discover" }

// Register for access
{ "method": "mcp.register", "params": { "agent_id": "my-agent" } }

// Check status
{ "method": "mcp.status", "params": { "agent_id": "my-agent" } }
```

Discovery response now includes:
- `tenant_directory_endpoint` (GET discoverable tenants)
- `tenant_join_endpoint` (POST join + receive per-tenant API key)

See [Agent Discovery Guide](./docs/AGENT-DISCOVERY-GUIDE.md) for complete documentation.

## See Also

- [Agent Discovery Guide](./docs/AGENT-DISCOVERY-GUIDE.md) - How agents discover and register
- [MCP Gateway Plan](../docs/MCP-GATEWAY-PLAN.md) - Complete implementation plan
- [ACP Spec](../spec/ACP-SPEC.md) - Universal contract
- [Three-Repo Architecture](../docs/THREE-REPO-ARCHITECTURE-ANALYSIS.md) - Architecture overview

## License

MIT
