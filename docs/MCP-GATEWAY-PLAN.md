# Echelon MCP Gateway — Complete Implementation Plan

**Purpose:** Build a registered Echelon kernel that acts as a transparent MCP proxy, enforcing governance policies before forwarding tool calls, resource access, prompts, and sampling requests to downstream MCP servers.

**Status:** Planning Phase  
**Last Updated:** February 2026

---

## Executive Summary

The Echelon MCP Gateway is **not middleware** — it is a **registered kernel** in the Echelon ecosystem that provides universal governance for the entire MCP (Model Context Protocol) ecosystem.

**Strategic Outcome:**
- Universal MCP governance layer
- Execution firewall for all MCP operations
- Audit and compliance layer
- Credential enforcement (via Repo C executor pattern)

**Flow:**
```
Agent → MCP Gateway (Kernel) → [authorize] Repo B → MCP Gateway → Executor MCP (Repo C) → External APIs
```

---

## Architecture Decision: Gateway = Registered Kernel

### Critical Architectural Choice

**The MCP Gateway is a registered kernel in Repo B (Governance Hub).**

This means:
- ✅ Registers with `kernelId: "mcp-gateway"`
- ✅ Uses `ControlPlaneAdapter.authorize()` from `kernel/src/control-plane-adapter.ts`
- ✅ Emits audit events to Repo B
- ✅ Follows same patterns as other kernels (Leadscore, CIQ, etc.)
- ✅ Integrates with three-repo architecture (A, B, C)

**This is infrastructure, not middleware.**

---

## Directory Structure

```
gateway/
  server.ts              # Main MCP server implementation
  proxy.ts               # MCP protocol proxy layer
  process-manager.ts     # Spawn/manage downstream MCP servers
  health.ts              # Health monitoring for downstream servers
  auth.ts                # Tenant extraction, API key validation
  cache.ts               # Authorization decision caching
  namespace.ts           # Tool name resolution and routing
  policy.ts              # Policy enforcement logic
  audit.ts               # Audit event emission to Repo B
  config.ts              # Configuration loading
  types.ts               # TypeScript type definitions

config.json              # Gateway configuration (servers, prefixes)
README.md                # Gateway-specific documentation
```

---

## Configuration Format

### `config.json`

```json
{
  "servers": {
    "amazon": {
      "command": "node",
      "args": ["./amazon-mcp-server.js"],
      "tool_prefix": "amazon."
    },
    "stripe": {
      "command": "npx",
      "args": ["@stripe/mcp-server"],
      "tool_prefix": "stripe."
    },
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

**Critical Requirements:**
- `tool_prefix` is **REQUIRED** for all servers
- Gateway **refuses to start** if any server lacks `tool_prefix`
- Prevents tool name collisions
- Enables clear routing

---

## Kernel Integration

### Registration with Repo B

The gateway registers as a kernel using the standard pattern:

```typescript
import { HttpControlPlaneAdapter } from "../kernel/src/control-plane-adapter.ts";

const controlPlane = new HttpControlPlaneAdapter({
  platformUrl: process.env.ACP_BASE_URL,
  kernelApiKey: process.env.ACP_KERNEL_KEY
});

// Register on startup
await controlPlane.heartbeat({
  kernelId: "mcp-gateway",
  version: "1.0.0",
  packs: ["mcp-governance"],
  env: process.env.ENVIRONMENT || "production"
});
```

### Authorization Flow

```typescript
// Before forwarding any MCP operation:
const decision = await controlPlane.authorize({
  kernelId: "mcp-gateway",
  tenantId: extractTenantId(mcpRequest), // From auth.ts
  actor: {
    type: 'api_key',
    id: apiKeyId
  },
  action: toolName, // e.g., "amazon.order"
  request_hash: hashParams(arguments),
  params_summary: sanitizeParams(arguments),
  params_summary_schema_id: "mcp-v1"
});

if (decision.decision !== 'allow') {
  // Block and emit audit
  await emitAuditEvent({
    tenantId,
    action: toolName,
    decision: 'deny',
    reason: decision.reason
  });
  return mcpError("POLICY_DENIED", decision.reason);
}

// Cache decision if allowed (using decision_ttl_ms)
if (decision.decision_ttl_ms) {
  await cache.set(cacheKey, decision, decision.decision_ttl_ms);
}

// Forward to downstream MCP server
```

---

## Tenant Identification Strategy

### Phase 1: MVP (Single Tenant Per Instance)

**Simple approach for initial deployment:**

- One gateway instance = one tenant
- `ACP_TENANT_ID` via environment variable
- `ACP_KERNEL_KEY` for Repo B authentication
- `ACP_BASE_URL` for Governance Hub URL

**Implementation:**
```typescript
// gateway/auth.ts
export function extractTenantId(): string {
  const tenantId = Deno.env.get("ACP_TENANT_ID");
  if (!tenantId) {
    throw new Error("ACP_TENANT_ID environment variable required");
  }
  return tenantId;
}
```

### Phase 2: Multi-Tenant (Future)

**Enhanced approach for production:**

- API key handshake at MCP connection start
- `gateway/auth.ts` extracts tenant from API key
- Tenant mapping stored in Repo B
- Support multiple tenants per gateway instance

**Implementation (Phase 2):**
```typescript
// gateway/auth.ts (Phase 2)
export async function extractTenantFromConnection(
  connectionMetadata: MCPConnectionMetadata
): Promise<string> {
  const apiKey = connectionMetadata.apiKey;
  if (!apiKey) {
    throw new Error("API key required for multi-tenant gateway");
  }
  
  // Lookup tenant from Repo B or local cache
  const tenantMapping = await getTenantFromApiKey(apiKey);
  return tenantMapping.tenantId;
}
```

---

## MCP Protocol Coverage

The gateway must govern **all MCP protocol features**, not just tools.

### Governance Matrix

| MCP Type | Governance Action | Authorization Call |
|----------|------------------|-------------------|
| **Tool** | `tools/call` | `authorize({ action: "tool:amazon.order" })` |
| **Resource** | `resources/read`, `resources/write` | `authorize({ action: "resource:filesystem.read" })` |
| **Prompt** | `prompts/get` | `authorize({ action: "prompt:template.get" })` |
| **Sampling** | `sampling/create` | `authorize({ action: "sampling:model.call" })` |

### Implementation Pattern

```typescript
// gateway/proxy.ts
async function handleMCPRequest(
  method: string,
  params: any,
  tenantId: string,
  actor: Actor
): Promise<MCPResponse> {
  let actionName: string;
  
  switch (method) {
    case "tools/call":
      actionName = `tool:${params.name}`;
      break;
    case "resources/read":
      actionName = `resource:${params.uri}.read`;
      break;
    case "resources/write":
      actionName = `resource:${params.uri}.write`;
      break;
    case "prompts/get":
      actionName = `prompt:${params.name}.get`;
      break;
    case "sampling/create":
      actionName = `sampling:${params.model}.create`;
      break;
    default:
      return mcpError("METHOD_NOT_SUPPORTED");
  }
  
  // Authorize before forwarding
  const decision = await authorizeAction(actionName, params, tenantId, actor);
  if (decision.decision !== 'allow') {
    return mcpError("POLICY_DENIED", decision.reason);
  }
  
  // Forward to downstream server
  return forwardToDownstream(method, params);
}
```

---

## Module Specifications

### 1. `gateway/auth.ts`

**Responsibilities:**
- Extract tenant ID from connection or environment
- Validate API keys
- Provide `{ tenantId, actor }` context for authorization

**Exports:**
```typescript
export function extractTenantId(): string;
export function extractActor(connection: MCPConnection): Actor;
export function validateApiKey(apiKey: string): Promise<boolean>;
```

### 2. `gateway/cache.ts`

**Responsibilities:**
- Cache authorization decisions using `decision_ttl_ms`
- Cache key: `tenantId + action + request_hash`
- Only cache `allow` decisions
- Prevent authorization latency from blocking throughput

**Exports:**
```typescript
export class AuthorizationCache {
  async get(key: string): Promise<AuthorizationResponse | null>;
  async set(key: string, decision: AuthorizationResponse, ttlMs: number): Promise<void>;
  generateKey(tenantId: string, action: string, requestHash: string): string;
}
```

### 3. `gateway/health.ts`

**Responsibilities:**
- Monitor health of downstream MCP servers
- Circuit breaker pattern
- Auto-restart on crashes
- Fail-closed on authorization failures
- Fail-closed on downstream crashes (security > availability)

**Exports:**
```typescript
export class HealthMonitor {
  async checkServerHealth(serverId: string): Promise<boolean>;
  async restartUnhealthyServer(serverId: string): Promise<void>;
  async killMisbehavingProcess(serverId: string): Promise<void>;
  isCircuitOpen(serverId: string): boolean;
}
```

### 4. `gateway/namespace.ts`

**Responsibilities:**
- Resolve tool names to downstream servers
- Enforce `tool_prefix` requirements
- Route tool calls to correct server
- Prevent collisions

**Exports:**
```typescript
export function resolveToolNamespace(toolName: string, config: Config): string;
export function getServerForTool(toolName: string, config: Config): ServerConfig;
export function validateToolPrefixes(config: Config): void;
```

### 5. `gateway/process-manager.ts`

**Responsibilities:**
- Spawn child MCP servers from config
- Manage process lifecycle (start, stop, restart)
- Enforce timeouts
- Resource limits (memory, CPU)
- Process isolation

**Exports:**
```typescript
export class ProcessManager {
  async spawnServer(serverConfig: ServerConfig): Promise<MCPProcess>;
  async stopServer(serverId: string): Promise<void>;
  async restartServer(serverId: string): Promise<void>;
  getServerProcess(serverId: string): MCPProcess | null;
}
```

### 6. `gateway/proxy.ts`

**Responsibilities:**
- Implement MCP server protocol
- Route requests to downstream servers
- Aggregate tools across servers
- Handle MCP protocol messages (JSON-RPC)

**Exports:**
```typescript
export class MCPProxy {
  async handleRequest(method: string, params: any): Promise<MCPResponse>;
  async aggregateTools(): Promise<MCPTool[]>;
  async forwardToServer(serverId: string, method: string, params: any): Promise<MCPResponse>;
}
```

### 7. `gateway/policy.ts`

**Responsibilities:**
- Policy enforcement logic
- Integration with `ControlPlaneAdapter`
- Decision caching coordination
- Fail-closed behavior

**Exports:**
```typescript
export async function authorizeAction(
  action: string,
  params: any,
  tenantId: string,
  actor: Actor
): Promise<AuthorizationResponse>;
```

### 8. `gateway/audit.ts`

**Responsibilities:**
- Emit audit events to Repo B
- Log all execution attempts (allowed and denied)
- Include decision metadata

**Exports:**
```typescript
export async function emitAuditEvent(event: AuditEvent): Promise<void>;
export function createAuditEvent(
  tenantId: string,
  action: string,
  decision: 'allow' | 'deny',
  metadata: AuditMetadata
): AuditEvent;
```

### 9. `gateway/config.ts`

**Responsibilities:**
- Load configuration from `config.json`
- Validate configuration schema
- Provide typed config access

**Exports:**
```typescript
export interface GatewayConfig {
  servers: Record<string, ServerConfig>;
  kernel: KernelConfig;
}

export function loadConfig(path?: string): GatewayConfig;
export function validateConfig(config: GatewayConfig): void;
```

### 10. `gateway/types.ts`

**Responsibilities:**
- TypeScript type definitions
- MCP protocol types
- Gateway-specific types

**Exports:**
```typescript
export interface MCPRequest { ... }
export interface MCPResponse { ... }
export interface MCPTool { ... }
export interface ServerConfig { ... }
export interface Actor { ... }
```

### 11. `gateway/server.ts`

**Responsibilities:**
- Main MCP server implementation
- Initialize all modules
- Handle MCP protocol connection
- Coordinate authorization, forwarding, and audit

**Structure:**
```typescript
// Main entry point
export async function startMCPServer() {
  // 1. Load config
  const config = loadConfig();
  
  // 2. Initialize ControlPlaneAdapter
  const controlPlane = new HttpControlPlaneAdapter({ ... });
  
  // 3. Register kernel with Repo B
  await controlPlane.heartbeat({ ... });
  
  // 4. Spawn downstream servers
  const processManager = new ProcessManager();
  for (const [id, serverConfig] of Object.entries(config.servers)) {
    await processManager.spawnServer(serverConfig);
  }
  
  // 5. Start MCP server
  // Handle incoming connections
  // Route through proxy with authorization
}
```

---

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

**Responsibilities:**
- **Gateway:** Governance enforcement, authorization, audit
- **Repo C (Executor):** Credential storage, external API execution

This preserves the clean separation of concerns in the three-repo architecture.

---

## Error Handling Strategy

### Fail-Closed Behavior

**Authorization failures:**
- Deny by default
- Emit audit event
- Return MCP error to agent

**Downstream server failures:**
- Fail-closed (security > availability)
- Emit audit event
- Return MCP error to agent
- Health monitor attempts restart

**Network timeouts:**
- Fail-closed
- Emit audit event
- Return timeout error

### Error Response Format

```typescript
{
  "jsonrpc": "2.0",
  "id": requestId,
  "error": {
    "code": -32000,
    "message": "POLICY_DENIED",
    "data": {
      "reason": "Rate limit exceeded",
      "decision_id": "dec_123",
      "policy_id": "pol_456"
    }
  }
}
```

---

## Performance Optimizations

### 1. Decision Caching

**Critical for throughput:**

- Cache key: `tenantId + action + request_hash`
- Use `decision_ttl_ms` from `AuthorizationResponse`
- Only cache `allow` decisions
- Invalidate on policy updates (future)

**Implementation:**
```typescript
// Check cache first
const cacheKey = cache.generateKey(tenantId, action, requestHash);
const cached = await cache.get(cacheKey);
if (cached && cached.decision === 'allow') {
  return cached; // Skip authorization call
}

// Call authorization
const decision = await controlPlane.authorize({ ... });

// Cache if allowed
if (decision.decision === 'allow' && decision.decision_ttl_ms) {
  await cache.set(cacheKey, decision, decision.decision_ttl_ms);
}
```

### 2. Connection Pooling

- Reuse connections to downstream MCP servers
- Connection limits per server
- Timeout handling

### 3. Request Batching (Future)

- Batch authorization requests when possible
- Reduce round-trips to Repo B

---

## Testing Strategy

### Unit Tests

- Authorization logic
- Cache behavior
- Namespace resolution
- Config validation

### Integration Tests

- Mock MCP servers
- Mock Repo B authorization
- End-to-end tool call flow

### End-to-End Tests

- Real downstream MCP servers
- Real Repo B integration
- Full execution chain

### Load Tests

- Concurrent requests
- Authorization caching effectiveness
- Downstream server failure handling

---

## Deployment

### Runtime Command

```bash
deno run --allow-net --allow-run --allow-read --allow-env gateway/server.ts
```

### Environment Variables

**Required:**
- `ACP_BASE_URL` - Governance Hub URL
- `ACP_KERNEL_KEY` - Kernel API key for Repo B
- `ACP_TENANT_ID` - Tenant ID (Phase 1)

**Optional:**
- `ENVIRONMENT` - `production` | `staging` | `development`
- `LOG_LEVEL` - `debug` | `info` | `warn` | `error`

### Consumer MCP Client Configuration

**Agent configuration:**
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

Gateway internally loads downstream servers from `config.json`.

---

## Implementation Phases

### Phase 1: MVP (Single Tenant, Tools Only)

**Scope:**
- Single tenant per instance
- Tool governance only
- Basic authorization
- Simple process management

**Deliverables:**
- Core modules (server, proxy, auth, policy, cache)
- Tool call authorization
- Basic health monitoring
- Audit logging

### Phase 2: Full MCP Protocol

**Scope:**
- Resources governance
- Prompts governance
- Sampling governance
- Enhanced error handling

**Deliverables:**
- Full MCP protocol coverage
- Resource access control
- Prompt template governance
- Sampling authorization

### Phase 3: Multi-Tenant

**Scope:**
- Multiple tenants per instance
- API key handshake
- Tenant mapping from Repo B
- Enhanced security

**Deliverables:**
- Multi-tenant support
- API key validation
- Tenant isolation
- Performance optimizations

### Phase 4: Production Hardening

**Scope:**
- Advanced health monitoring
- Circuit breakers
- Request batching
- Performance tuning
- Comprehensive testing

**Deliverables:**
- Production-ready gateway
- Full test coverage
- Performance benchmarks
- Deployment documentation

---

## Success Criteria

### Functional Requirements

- ✅ Gateway registers as kernel with Repo B
- ✅ All MCP operations (tools, resources, prompts, sampling) are authorized
- ✅ Authorization decisions are cached with TTL
- ✅ Audit events are emitted to Repo B
- ✅ Downstream servers are managed (spawn, monitor, restart)
- ✅ Tool namespacing prevents collisions
- ✅ Fail-closed behavior on authorization failures

### Performance Requirements

- ✅ Authorization latency < 50ms (with cache)
- ✅ Cache hit rate > 80% (for repeated operations)
- ✅ Gateway overhead < 10ms per request
- ✅ Support 100+ concurrent connections

### Security Requirements

- ✅ No external credentials stored in gateway
- ✅ All operations are authorized
- ✅ All operations are audited
- ✅ Fail-closed on errors
- ✅ Tenant isolation (Phase 3)

---

## Integration with Three-Repo Architecture

### Repo A (agentic-control-plane-kit)

**Relationship:**
- Gateway uses `ControlPlaneAdapter` from kernel
- Gateway follows same patterns as other kernels
- Gateway is a consumer of Repo A's kernel interfaces

### Repo B (governance-hub)

**Relationship:**
- Gateway registers as kernel: `kernelId: "mcp-gateway"`
- Gateway calls `/functions/v1/authorize` for decisions
- Gateway emits audit events to Repo B
- Gateway uses `heartbeat` for registration

### Repo C (key-vault-executor)

**Relationship:**
- Gateway does **not** directly call Repo C
- Gateway forwards authorized requests to Executor MCP (if implemented)
- Executor MCP (in Repo C) handles credential storage and external API execution
- Gateway enforces governance, Executor executes

---

## Strategic Outcome

**The Echelon MCP Gateway becomes:**

- ✅ Universal MCP governance layer
- ✅ Execution firewall for all MCP operations
- ✅ Audit and compliance layer
- ✅ Credential enforcement (via Repo C executor pattern)

**Agents integrate once. Echelon governs everything.**

---

## Agent Discovery

### Discovery Protocol

Agents can discover the gateway programmatically via MCP protocol:

**Discovery Endpoints:**
- `meta.discover` - Discover gateway capabilities and available servers
- `meta.info` - Get gateway metadata
- `mcp.register` - Register agent for gateway access
- `mcp.status` - Check registration status

**Registration Flow:**
1. Agent calls `meta.discover` → learns about gateway
2. Agent suggests gateway to user → "I recommend installing Echelon..."
3. User approves → Agent calls `mcp.register`
4. Agent receives registration URL or API key
5. Agent uses gateway for all MCP operations

**Registration URL Protocol:**
- `echelon://register` - Custom protocol for registration
- Or HTTP URL: `https://governance-hub.supabase.co/onboard/mcp-gateway?agent_id=...`

**Benefits:**
- ✅ Organic discovery (agents find gateway naturally)
- ✅ Self-service onboarding (no manual setup)
- ✅ User-controlled (agent suggests, user approves)
- ✅ Seamless integration (works with existing MCP clients)

See [Agent Discovery Guide](../gateway/docs/AGENT-DISCOVERY-GUIDE.md) for complete documentation.

---

## References

- [ACP Spec](../spec/ACP-SPEC.md) - Universal contract for kernels
- [ControlPlaneAdapter](../kernel/src/control-plane-adapter.ts) - Authorization interface
- [Three-Repo Architecture](./THREE-REPO-ARCHITECTURE-ANALYSIS.md) - Architecture overview
- [MCP Protocol Spec](https://modelcontextprotocol.io) - Model Context Protocol documentation
- [Agent Discovery Guide](../gateway/docs/AGENT-DISCOVERY-GUIDE.md) - Agent discovery documentation
- [Discovery Protocol](../gateway/docs/DISCOVERY-PROTOCOL.md) - Technical discovery specification

---

## Changelog

- **2026-02-XX**: Initial plan created with architectural corrections
- Gateway defined as registered kernel (Option A)
- Full MCP protocol coverage specified
- Security model clarified (gateway ≠ credential storage)
- Tenant identification strategy defined (phased approach)
- **2026-02-XX**: Agent discovery protocol implemented
- Discovery endpoints added (meta.discover, meta.info, mcp.register, mcp.status)
- Registration flow documented
