/**
 * Tool name resolution and routing
 * 
 * Handles tool namespacing via tool_prefix to prevent collisions
 * Routes tool calls to correct downstream MCP server
 */

import type { GatewayConfig, ServerConfig } from './types.ts';

/**
 * Resolve which server a tool belongs to based on tool name and prefixes
 */
export function resolveToolNamespace(
  toolName: string,
  config: GatewayConfig
): string | null {
  for (const [serverId, serverConfig] of Object.entries(config.servers)) {
    if (toolName.startsWith(serverConfig.tool_prefix)) {
      return serverId;
    }
  }
  return null;
}

/**
 * Get server configuration for a given tool name
 */
export function getServerForTool(
  toolName: string,
  config: GatewayConfig
): ServerConfig | null {
  const serverId = resolveToolNamespace(toolName, config);
  if (!serverId) {
    return null;
  }
  return config.servers[serverId];
}

/**
 * Validate that all tool prefixes are unique and properly formatted
 * (Called during config validation, but available here for runtime checks)
 */
export function validateToolPrefixes(config: GatewayConfig): void {
  const prefixes = new Set<string>();
  for (const [serverId, serverConfig] of Object.entries(config.servers)) {
    const prefix = serverConfig.tool_prefix;
    
    if (prefixes.has(prefix)) {
      throw new Error(`Duplicate tool_prefix "${prefix}" found in server "${serverId}"`);
    }
    
    if (!prefix.endsWith('.')) {
      throw new Error(
        `Server "${serverId}" tool_prefix must end with "." (found: "${prefix}")`
      );
    }
    
    prefixes.add(prefix);
  }
}

/**
 * Strip tool prefix to get original tool name from downstream server
 */
export function stripToolPrefix(toolName: string, prefix: string): string {
  if (!toolName.startsWith(prefix)) {
    return toolName; // Already stripped or doesn't match
  }
  return toolName.slice(prefix.length);
}

/**
 * Add tool prefix to tool name for gateway exposure
 */
export function addToolPrefix(toolName: string, prefix: string): string {
  return `${prefix}${toolName}`;
}

/**
 * Get all tool prefixes from config
 */
export function getAllToolPrefixes(config: GatewayConfig): string[] {
  return Object.values(config.servers).map(s => s.tool_prefix);
}
