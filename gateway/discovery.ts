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
  registration_url?: string;
  registration_required: boolean;
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

  return {
    gateway_id: config.kernel.kernelId,
    gateway_version: config.kernel.version,
    name: 'Echelon MCP Gateway',
    description: 'Universal governance layer for Model Context Protocol (MCP) operations. Enforces policies, rate limits, and audit logging for all MCP tools, resources, prompts, and sampling.',
    registration_url: registrationUrl || 'echelon://register',
    registration_required: true, // Phase 1: requires registration
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
