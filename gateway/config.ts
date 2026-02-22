/**
 * Configuration loading and validation for MCP Gateway
 */

import type { GatewayConfig, ServerConfig } from './types.ts';
import { ConfigurationError } from './errors.ts';

/**
 * Load configuration from config.json file
 */
export function loadConfig(path: string = './config.json'): GatewayConfig {
  try {
    const configText = Deno.readTextFileSync(path);
    const config = JSON.parse(configText) as GatewayConfig;
    validateConfig(config);
    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new ConfigurationError(`Config file not found: ${path}`);
    }
    if (error instanceof SyntaxError) {
      throw new ConfigurationError(`Invalid JSON in config file: ${error.message}`, error);
    }
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Validate configuration structure and requirements
 */
export function validateConfig(config: GatewayConfig): void {
  // Validate kernel config
  if (!config.kernel) {
    throw new Error('Config must have "kernel" section');
  }
  if (!config.kernel.kernelId || typeof config.kernel.kernelId !== 'string') {
    throw new Error('Config must have "kernel.kernelId" as a string');
  }
  if (!config.kernel.version || typeof config.kernel.version !== 'string') {
    throw new Error('Config must have "kernel.version" as a string');
  }

  // Validate servers
  if (!config.servers || typeof config.servers !== 'object') {
    throw new Error('Config must have "servers" object');
  }

  const serverIds = Object.keys(config.servers);
  if (serverIds.length === 0) {
    throw new Error('Config must have at least one server defined');
  }

  // Validate each server
  for (const [serverId, serverConfig] of Object.entries(config.servers)) {
    validateServerConfig(serverId, serverConfig);
  }

  // Check for tool prefix collisions
  const prefixes = new Set<string>();
  for (const serverConfig of Object.values(config.servers)) {
    const prefix = serverConfig.tool_prefix;
    if (prefixes.has(prefix)) {
      throw new Error(`Duplicate tool_prefix found: "${prefix}"`);
    }
    prefixes.add(prefix);
  }
}

/**
 * Validate individual server configuration
 */
function validateServerConfig(serverId: string, config: ServerConfig): void {
  if (!config.command || typeof config.command !== 'string') {
    throw new ConfigurationError(`Server "${serverId}" must have "command" as a string`);
  }

  if (!Array.isArray(config.args)) {
    throw new ConfigurationError(`Server "${serverId}" must have "args" as an array`);
  }

  // CRITICAL: tool_prefix is REQUIRED
  if (!config.tool_prefix || typeof config.tool_prefix !== 'string') {
    throw new ConfigurationError(
      `Server "${serverId}" must have "tool_prefix" as a string. ` +
      `This is required to prevent tool name collisions.`
    );
  }

  // Validate tool_prefix format (should end with dot)
  if (!config.tool_prefix.endsWith('.')) {
    throw new ConfigurationError(
      `Server "${serverId}" tool_prefix must end with "." (e.g., "amazon.")`
    );
  }

  // Validate tool_prefix is not empty
  if (config.tool_prefix === '.') {
    throw new ConfigurationError(
      `Server "${serverId}" tool_prefix cannot be just "." - use a prefix like "amazon."`
    );
  }
}

/**
 * Get server configuration by ID
 */
export function getServerConfig(
  config: GatewayConfig,
  serverId: string
): ServerConfig | null {
  return config.servers[serverId] || null;
}

/**
 * Get all server IDs
 */
export function getServerIds(config: GatewayConfig): string[] {
  return Object.keys(config.servers);
}
