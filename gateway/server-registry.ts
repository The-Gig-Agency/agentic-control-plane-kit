/**
 * Server Registry - Dynamic MCP Server Loading from Repo B
 * 
 * Fetches and caches MCP server configurations per tenant from Repo B.
 * Supports both hosted mode (connector_id) and self_hosted mode (command/args).
 * Resolves connector_id to command/args for hosted mode.
 */

import type { ServerConfig } from './types.ts';
import { NetworkError, ConfigurationError } from './errors.ts';

export interface RepoBServerConfig {
  id: string;
  server_id: string;
  name: string;
  // For stdio-based servers
  command: string | null;
  args: string[] | null;
  // For HTTP-based servers
  server_type?: 'stdio' | 'http';
  url?: string | null;
  http_headers?: Record<string, string> | null;
  // Common fields
  tool_prefix: string;
  enabled: boolean;
  mode?: 'hosted' | 'self_hosted';
  connector_id?: string | null;
  connector_version?: string | null;
  connector_config?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectorConfig {
  connector_id: string;
  name: string;
  tool_prefix: string;
  command: string;
  args: string[];
  version: string;
  config_schema?: Record<string, any>;
}

interface CachedServers {
  servers: Map<string, ServerConfig>;
  expiresAt: number;
}

export class ServerRegistry {
  private cache: Map<string, CachedServers> = new Map();
  private cacheTTL = 60000; // 1 minute default
  private platformUrl: string;
  private kernelApiKey: string;
  private connectorCache: Map<string, ConnectorConfig> = new Map();
  private connectorCacheTTL = 3600000; // 1 hour for connectors

  constructor(platformUrl: string, kernelApiKey: string, cacheTTL?: number) {
    this.platformUrl = platformUrl;
    this.kernelApiKey = kernelApiKey;
    if (cacheTTL) {
      this.cacheTTL = cacheTTL;
    }
  }

  /**
   * Get all servers for a tenant (with caching)
   */
  async getServers(tenantId: string, forceRefresh = false): Promise<Map<string, ServerConfig>> {
    // Check cache
    if (!forceRefresh) {
      const cached = this.cache.get(tenantId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.servers;
      }
    }

    // Fetch from Repo B
    const servers = await this.fetchServersFromRepoB(tenantId);

    // Cache results
    this.cache.set(tenantId, {
      servers,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return servers;
  }

  /**
   * Get a specific server by server_id
   */
  async getServer(tenantId: string, serverId: string): Promise<ServerConfig | null> {
    const servers = await this.getServers(tenantId);
    return servers.get(serverId) || null;
  }

  /**
   * Invalidate cache for a tenant (call when servers are updated)
   */
  invalidateCache(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Fetch servers from Repo B
   */
  private async fetchServersFromRepoB(tenantId: string): Promise<Map<string, ServerConfig>> {
    try {
      const url = new URL(`${this.platformUrl}/functions/v1/mcp-servers/list`);
      url.searchParams.set('tenant_id', tenantId);
      url.searchParams.set('enabled_only', 'true');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.kernelApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No servers found - return empty map
          return new Map();
        }
        throw new NetworkError(
          `Failed to fetch servers from Repo B: ${response.status} ${response.statusText}`,
          'repo_b_fetch',
          response.status
        );
      }

      const data = await response.json();
      if (!data.ok || !data.data || !Array.isArray(data.data.servers)) {
        throw new ConfigurationError('Invalid response format from Repo B');
      }

      const repoBServers: RepoBServerConfig[] = data.data.servers;
      const serverMap = new Map<string, ServerConfig>();

      // Convert Repo B format to ServerConfig
      for (const repoBServer of repoBServers) {
        if (!repoBServer.enabled) {
          continue; // Skip disabled servers
        }

        let serverConfig: ServerConfig;

        // Determine mode (default to self_hosted if not specified)
        const mode = repoBServer.mode || (repoBServer.connector_id ? 'hosted' : 'self_hosted');

        if (mode === 'hosted') {
          // Resolve connector_id to command/args
          if (!repoBServer.connector_id) {
            console.warn(`[REGISTRY] Server "${repoBServer.server_id}" is in hosted mode but missing connector_id, skipping`);
            continue;
          }

          const connector = await this.resolveConnector(repoBServer.connector_id);
          if (!connector) {
            console.warn(`[REGISTRY] Connector "${repoBServer.connector_id}" not found for server "${repoBServer.server_id}", skipping`);
            continue;
          }

          // Build args with connector config
          const args = [...connector.args];
          if (repoBServer.connector_config) {
            // Merge connector_config into args if needed
            // For now, we'll pass it as env vars or append to args based on connector schema
            // This is connector-specific, so we'll keep it simple for now
          }

          serverConfig = {
            command: connector.command,
            args,
            tool_prefix: repoBServer.tool_prefix,
            env: repoBServer.connector_config ? this.configToEnv(repoBServer.connector_config) : undefined,
          };
        } else {
          // Self-hosted mode: check server_type
          const serverType = repoBServer.server_type || 'stdio';
          
          if (serverType === 'http') {
            // HTTP-based MCP server
            if (!repoBServer.url) {
              console.warn(`[REGISTRY] Server "${repoBServer.server_id}" is HTTP type but missing url, skipping`);
              continue;
            }

            serverConfig = {
              server_type: 'http',
              url: repoBServer.url,
              http_headers: repoBServer.http_headers || {},
              tool_prefix: repoBServer.tool_prefix,
            };
          } else {
            // Stdio-based MCP server
            if (!repoBServer.command || !repoBServer.args) {
              console.warn(`[REGISTRY] Server "${repoBServer.server_id}" is stdio type but missing command/args, skipping`);
              continue;
            }

            serverConfig = {
              server_type: 'stdio',
              command: repoBServer.command,
              args: repoBServer.args,
              tool_prefix: repoBServer.tool_prefix,
            };
          }
        }

        serverMap.set(repoBServer.server_id, serverConfig);
      }

      return serverMap;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ConfigurationError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to fetch servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'repo_b_fetch',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Resolve connector_id to connector config (with caching)
   */
  private async resolveConnector(connectorId: string): Promise<ConnectorConfig | null> {
    // Check connector cache
    const cached = this.connectorCache.get(connectorId);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.platformUrl}/functions/v1/connectors/list`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.kernelApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[REGISTRY] Failed to fetch connectors: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (!data.ok || !data.data || !Array.isArray(data.data.connectors)) {
        return null;
      }

      const connectors: any[] = data.data.connectors;
      const connector = connectors.find((c: any) => c.connector_id === connectorId);

      if (!connector) {
        return null;
      }

      // Convert connector to ConnectorConfig
      // Note: Connector catalog may not have command/args, so we need to map connector_id to actual MCP server packages
      // For now, we'll use a mapping table or fetch from a connector registry
      // This is a simplified version - in production, connectors would have command/args in the catalog
      
      const connectorConfig: ConnectorConfig = {
        connector_id: connector.connector_id,
        name: connector.name,
        tool_prefix: connector.tool_prefix,
        command: this.getConnectorCommand(connector.connector_id),
        args: this.getConnectorArgs(connector.connector_id, connector.config_schema),
        version: connector.version || '1.0.0',
        config_schema: connector.config_schema,
      };

      // Cache connector
      this.connectorCache.set(connectorId, connectorConfig);

      return connectorConfig;
    } catch (error) {
      console.error(`[REGISTRY] Error resolving connector "${connectorId}":`, error);
      return null;
    }
  }

  /**
   * Get command for a connector (maps connector_id to actual command)
   * 
   * Maps connector IDs to their execution commands:
   * - TypeScript servers: 'npx'
   * - Python servers: 'uvx'
   * 
   * TODO: This should be stored in the connectors table or fetched from connector metadata
   */
  private getConnectorCommand(connectorId: string): string {
    // Python-based servers (use uvx)
    const pythonServers = ['git', 'puppeteer'];
    
    if (pythonServers.includes(connectorId)) {
      return 'uvx';
    }
    
    // All other servers are TypeScript-based (use npx)
    return 'npx';
  }

  /**
   * Get args for a connector (maps connector_id to actual args)
   * 
   * Maps connector IDs to their package names and arguments.
   * TypeScript servers use npx with @modelcontextprotocol/server-* packages.
   * Python servers use uvx with mcp-server-* packages.
   * 
   * TODO: This should be stored in the connectors table or fetched from connector metadata
   */
  private getConnectorArgs(connectorId: string, configSchema?: Record<string, any>): string[] {
    // Python-based servers (use uvx with mcp-server-* package names)
    const pythonPackages: Record<string, string[]> = {
      'git': ['mcp-server-git'],
      'puppeteer': ['mcp-server-puppeteer'],
    };

    if (pythonPackages[connectorId]) {
      return pythonPackages[connectorId];
    }

    // TypeScript-based servers (use npx with @modelcontextprotocol/server-* packages)
    const typescriptPackages: Record<string, string[]> = {
      // Core Infrastructure
      'filesystem': ['-y', '@modelcontextprotocol/server-filesystem'],
      'memory': ['-y', '@modelcontextprotocol/server-memory'],
      
      // Version Control
      'github': ['-y', '@modelcontextprotocol/server-github'],
      
      // Databases
      'postgres': ['-y', '@modelcontextprotocol/server-postgres'],
      'sqlite': ['-y', '@modelcontextprotocol/server-sqlite'],
      
      // Web & Search
      'brave-search': ['-y', '@modelcontextprotocol/server-brave-search'],
      
      // Cloud Services
      'aws': ['-y', '@modelcontextprotocol/server-aws'],
      'gcp': ['-y', '@modelcontextprotocol/server-gcp'],
      
      // Communication
      'slack': ['-y', '@modelcontextprotocol/server-slack'],
      'discord': ['-y', '@modelcontextprotocol/server-discord'],
      
      // Development Tools
      'docker': ['-y', '@modelcontextprotocol/server-docker'],
      'kubernetes': ['-y', '@modelcontextprotocol/server-kubernetes'],
      
      // Data & Analytics
      'fetch': ['-y', '@modelcontextprotocol/server-fetch'],
      'youtube-transcript': ['-y', '@modelcontextprotocol/server-youtube-transcript'],
      
      // E-commerce & Payments
      'stripe': ['-y', '@modelcontextprotocol/server-stripe'],
      'shopify': ['-y', '@modelcontextprotocol/server-shopify'],
    };

    const args = typescriptPackages[connectorId];
    if (!args) {
      throw new ConfigurationError(`Unknown connector: ${connectorId}. Connector not found in registry.`);
    }

    return args;
  }

  /**
   * Convert connector_config to environment variables
   */
  private configToEnv(config: Record<string, any>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        env[key.toUpperCase()] = String(value);
      }
    }
    return env;
  }
}
