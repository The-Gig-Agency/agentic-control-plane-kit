/**
 * TypeScript type definitions for MCP Gateway
 * Includes MCP protocol types and gateway-specific types
 */

// MCP Protocol Types (JSON-RPC 2.0 based)
export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

// MCP Resource Definition
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// MCP Prompt Definition
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// Gateway Configuration Types
export interface ServerConfig {
  // For stdio-based servers
  command?: string;
  args?: string[];
  // For HTTP-based servers
  url?: string;
  http_headers?: Record<string, string>;
  // Common fields
  server_type?: 'stdio' | 'http'; // Default: 'stdio'
  tool_prefix: string; // REQUIRED - prevents collisions
  env?: Record<string, string>;
}

export interface GatewayConfig {
  servers: Record<string, ServerConfig>;
  kernel: {
    kernelId: string;
    version: string;
  };
}

// Actor Context
export interface Actor {
  type: 'api_key' | 'user' | 'system';
  id: string;
  api_key_id?: string;
}

// MCP Process Management
export interface MCPProcess {
  id: string;
  process: Deno.ChildProcess;
  config: ServerConfig;
  healthy: boolean;
  lastHealthCheck: number;
  restartCount: number;
}

// Cache Types
export interface CachedDecision {
  decision: 'allow' | 'deny' | 'require_approval';
  expiresAt: number;
  decision_id: string;
  decision_ttl_ms?: number;
}

// Health Monitoring
export interface HealthStatus {
  serverId: string;
  healthy: boolean;
  lastCheck: number;
  error?: string;
  uptime: number;
}

// Audit Event
export interface AuditEvent {
  tenant_id: string;
  integration: string;
  actor: Actor;
  action: string;
  request_payload?: any;
  status: 'success' | 'error' | 'denied';
  start_time: number;
  end_time?: number;
  error_code?: string;
  error_message?: string;
  decision_id?: string;
  policy_id?: string;
}

// Connection Metadata (for Phase 2 multi-tenant)
export interface MCPConnectionMetadata {
  apiKey?: string;
  tenantId?: string;
  userAgent?: string;
  ipAddress?: string;
}
