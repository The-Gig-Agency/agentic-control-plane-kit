/**
 * Agent Discovery and Registration
 * 
 * Enables agents to discover MCP Gateway capabilities and register for access
 */

import type { GatewayConfig } from './config.ts';
import { ProcessManager } from './process-manager.ts';
import type { MCPTool } from './types.ts';

export interface DiscoveryInfo {
  gateway_id: string;
  gateway_version: string;
  name: string;
  description: string;
  registration_url?: string; // Web page URL (for humans)
  registration_required: boolean;
  verification_required_for_write?: boolean;
  verify_email_endpoint?: string;
  unverified_scopes?: string[];
  verified_scopes?: string[];
  agent_quickstart?: string[];
  // API endpoints for programmatic signup
  signup_api_base?: string; // Base URL for signup API (e.g., https://www.buyechelon.com)
  signup_endpoint?: string; // Exact signup endpoint path (e.g., /api/consumer/signup)
  tenant_directory_endpoint?: string; // GET - Discover available tenants (Repo B)
  tenant_join_endpoint?: string; // POST - Join a tenant and get a per-tenant key
  // Registry endpoints - full URLs (no guessing path format)
  registry_endpoints?: {
    list_servers: string; // GET - List MCP servers for tenant
    register_server: string; // POST - Register new MCP server
    update_server: string; // PUT - Update MCP server config
    delete_server: string; // DELETE - Delete MCP server
    list_connectors: string; // GET - List available connectors from catalog
  };
  // Governance endpoints - full URLs for policy management
  governance_endpoints?: {
    propose_policy: string; // POST - Propose a new policy/limit/runbook
    list_policies: string; // GET - List policies for tenant (optional, if implemented)
    simulate_policy: string; // POST - Simulate policy effect (optional, if implemented)
  };
  docs_url?: string; // Public documentation URL
  available_servers: ServerDiscoveryInfo[];
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    sampling: boolean;
  };
}

export interface ServerDiscoveryInfo {
  server_id: string;
  name: string;
  description?: string;
  tool_prefix: string;
  available_tools: number;
  status: 'available' | 'unavailable' | 'requires_registration';
}

export interface RegistrationRequest {
  agent_id: string;
  agent_name?: string;
  email?: string;
  organization_name?: string;
  requested_servers?: string[]; // Server IDs to enable
}

export interface RegistrationResponse {
  registered: boolean;
  tenant_id?: string;
  api_key?: string;
  api_key_prefix?: string;
  registration_url?: string;
  message: string;
}

/**
 * Get discovery information about the gateway
 */
export async function getDiscoveryInfo(
  config: GatewayConfig,
  processManager: ProcessManager,
  registrationUrl?: string,
  aggregatedTools?: MCPTool[]
): Promise<DiscoveryInfo> {
  const servers: ServerDiscoveryInfo[] = [];
  const processes = processManager.getAllProcesses();

  // Count tools per server from aggregated tools
  const toolCounts = new Map<string, number>();
  if (aggregatedTools) {
    for (const tool of aggregatedTools) {
      // Extract server from tool prefix
      for (const [serverId, serverConfig] of Object.entries(config.servers)) {
        if (tool.name.startsWith(serverConfig.tool_prefix)) {
          toolCounts.set(serverId, (toolCounts.get(serverId) || 0) + 1);
          break;
        }
      }
    }
  }

  for (const [serverId, serverConfig] of Object.entries(config.servers)) {
    const process = processManager.getServerProcess(serverId);
    const isAvailable = process !== null && processManager.isServerRunning(serverId);
    const toolCount = toolCounts.get(serverId) || 0;

    servers.push({
      server_id: serverId,
      name: serverId,
      description: `MCP server: ${serverId} (${toolCount} tools available)`,
      tool_prefix: serverConfig.tool_prefix,
      available_tools: toolCount,
      status: isAvailable ? 'available' : 'unavailable',
    });
  }

  // Get platform URL from environment or use default
  let platformUrl = Deno.env.get('ACP_BASE_URL') || 'https://governance-hub.supabase.co';
  const signupApiBase = Deno.env.get('SIGNUP_API_BASE') || 'https://www.buyechelon.com';
  const docsUrl = Deno.env.get('DOCS_URL') || 'https://github.com/The-Gig-Agency/echelon-control';

  // Normalize platform URL - remove trailing /functions/v1 if present
  platformUrl = platformUrl.replace(/\/functions\/v1\/?$/, '');
  
  // Build full registry endpoint URLs (hyphen format, not slash)
  const registryBase = `${platformUrl}/functions/v1`;
  const registryEndpoints = {
    list_servers: `${registryBase}/mcp-servers-list`, // GET
    register_server: `${registryBase}/mcp-servers-register`, // POST
    update_server: `${registryBase}/mcp-servers-update`, // PUT
    delete_server: `${registryBase}/mcp-servers-delete`, // DELETE
    list_connectors: `${registryBase}/connectors-list`, // GET
  };
  
  // Build governance endpoint URLs
  const governanceEndpoints = {
    propose_policy: `${registryBase}/policy-propose`, // POST - Propose policy/limit/runbook
  };

  const agentQuickstart = [
    '1) Call meta.discover to get tenant directory + join endpoints.',
    '2) GET tenant_directory_endpoint to see available tenants.',
    '3) POST tenant_join_endpoint with {agent_id,email,tenant_slug} to receive a per-tenant api_key.',
    '4) Until email is verified, keys are read-only (write scopes blocked).',
    '5) Verify email via verify_email_endpoint using {token}.',
    '6) After verification, write scopes unlock (register/update servers, propose policies).',
  ];

  return {
    gateway_id: config.kernel.kernelId,
    gateway_version: config.kernel.version,
    name: 'Echelon MCP Gateway',
    description: 'Universal governance layer for Model Context Protocol (MCP) operations. Enforces policies, rate limits, and audit logging for all MCP tools, resources, prompts, and sampling.',
    registration_url: registrationUrl || `${signupApiBase}/consumer`, // Web page for humans
    registration_required: true,
    verification_required_for_write: true,
    verify_email_endpoint: `${registryBase}/verify-email`,
    unverified_scopes: ['mcp.read', 'mcp.meta.discover'],
    verified_scopes: ['mcp:read', 'mcp:write', 'mcp:register', 'mcp:delete', 'authorize', 'connectors:read', 'connectors:resolve'],
    agent_quickstart: agentQuickstart,
    // API endpoints for programmatic signup
    signup_api_base: signupApiBase,
    signup_endpoint: '/api/consumer/signup', // Public signup endpoint (no auth required)
    tenant_directory_endpoint: `${registryBase}/tenants-discover`,
    tenant_join_endpoint: `${registryBase}/tenants-join`,
    // Registry endpoints - full URLs (no path guessing needed)
    registry_endpoints: registryEndpoints,
    // Governance endpoints - full URLs for policy management
    governance_endpoints: governanceEndpoints,
    docs_url: docsUrl,
    available_servers: servers,
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      sampling: true,
    },
  };
}

/**
 * Handle agent registration request
 * 
 * Phase 1: Returns registration URL and instructions
 * Phase 2: Will create tenant and API key automatically
 */
export async function handleRegistration(
  request: RegistrationRequest,
  config: GatewayConfig,
  platformUrl: string
): Promise<RegistrationResponse> {
  // Phase 1: Return registration URL for manual onboarding
  // Phase 2: Will integrate with Repo B tenant creation
  
  const registrationUrl = `${platformUrl}/onboard/mcp-gateway?agent_id=${encodeURIComponent(request.agent_id)}${request.email ? `&email=${encodeURIComponent(request.email)}` : ''}`;

  return {
    registered: false,
    registration_url: registrationUrl,
    message: `Registration required. Visit ${registrationUrl} to complete onboarding and receive your API key. After registration, you can use the gateway to access MCP servers with governance enforcement.`,
  };
}

/**
 * Get registration status for an agent
 */
export async function getRegistrationStatus(
  agentId: string,
  tenantId?: string
): Promise<{
  registered: boolean;
  tenant_id?: string;
  status: 'not_registered' | 'pending' | 'active' | 'suspended';
  message: string;
}> {
  // Phase 1: Simple check
  // Phase 2: Will query Repo B for tenant status
  
  if (tenantId) {
    return {
      registered: true,
      tenant_id: tenantId,
      status: 'active',
      message: 'Agent is registered and active',
    };
  }

  return {
    registered: false,
    status: 'not_registered',
    message: 'Agent is not registered. Use mcp.register to begin onboarding.',
  };
}
