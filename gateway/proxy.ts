/**
 * MCP Protocol Proxy
 * 
 * Handles MCP protocol (JSON-RPC 2.0)
 * Routes requests to downstream servers
 * Aggregates tools across servers
 */

import {
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPTool,
  MCPProcess,
} from './types.ts';
import type { GatewayConfig } from './config.ts';
import { ProcessManager } from './process-manager.ts';
import { getServerForTool, stripToolPrefix } from './namespace.ts';
import { authorizeAction } from './policy.ts';
import { emitAuthorizationAudit } from './audit.ts';
import type { ControlPlaneAdapter, AuthorizationResponse } from './kernel-bridge.ts';
import { AuthorizationCache } from './cache.ts';
import { Actor } from './types.ts';
import { MCPClientManager } from './mcp-client.ts';
import {
  AuthorizationError,
  NetworkError,
  ProcessError,
  MCPProtocolError,
  ValidationError,
  TimeoutError,
  isRetryableError,
} from './errors.ts';
import {
  getDiscoveryInfo,
  handleRegistration,
  getRegistrationStatus,
} from './discovery.ts';

export class MCPProxy {
  private config: GatewayConfig;
  private processManager: ProcessManager;
  private controlPlane: ControlPlaneAdapter;
  private cache: AuthorizationCache;
  private kernelId: string;
  private clientManager: MCPClientManager;
  private platformUrl: string;
  private kernelApiKey: string;

  constructor(
    config: GatewayConfig,
    processManager: ProcessManager,
    controlPlane: ControlPlaneAdapter,
    cache: AuthorizationCache,
    kernelId: string,
    platformUrl: string,
    kernelApiKey: string
  ) {
    this.config = config;
    this.processManager = processManager;
    this.controlPlane = controlPlane;
    this.cache = cache;
    this.kernelId = kernelId;
    this.platformUrl = platformUrl;
    this.kernelApiKey = kernelApiKey;
    this.clientManager = new MCPClientManager();
  }

  /**
   * Handle MCP request (JSON-RPC 2.0)
   */
  async handleRequest(
    request: MCPRequest,
    tenantId: string,
    actor: Actor
  ): Promise<MCPResponse> {
    const { method, params, id } = request;

    try {
      // Validate request
      if (!method || typeof method !== 'string') {
        throw new ValidationError('Method is required and must be a string', 'method');
      }

      // Route based on method
      let result: any;

      switch (method) {
        case 'tools/list':
          result = await this.aggregateTools();
          break;

        case 'tools/call':
          // Check if this is the gateway's own connector discovery tool
          if (params.name === 'echelon.connectors.list') {
            result = await this.handleConnectorsList(tenantId);
          } else {
            // Otherwise, handle as regular tool call
            result = await this.handleToolCall(params, tenantId, actor);
          }
          break;

        case 'resources/list':
          result = await this.handleResourcesList();
          break;

        case 'resources/read':
          result = await this.handleResourceRead(params, tenantId, actor);
          break;

        case 'resources/write':
          result = await this.handleResourceWrite(params, tenantId, actor);
          break;

        case 'prompts/list':
          result = await this.handlePromptsList();
          break;

        case 'prompts/get':
          result = await this.handlePromptGet(params, tenantId, actor);
          break;

        // Discovery endpoints
        case 'meta.discover':
          result = await this.handleDiscovery();
          break;

        case 'meta.info':
          result = await this.handleInfo();
          break;

        case 'mcp.register':
          result = await this.handleRegister(params);
          break;

        case 'mcp.status':
          result = await this.handleStatus(params, tenantId);
          break;

        case 'sampling/create':
          result = await this.handleSamplingCreate(params, tenantId, actor);
          break;

        default:
          return this.createErrorResponse(
            id,
            -32601,
            'Method not found',
            `Unknown method: ${method}`
          );
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      // Map errors to appropriate MCP error codes
      if (error instanceof AuthorizationError) {
        return this.createErrorResponse(
          id,
          -32001,
          'Authorization denied',
          {
            message: error.message,
            decision_id: error.decisionId,
            policy_id: error.policyId,
          }
        );
      }
      
      if (error instanceof ValidationError) {
        return this.createErrorResponse(
          id,
          -32602,
          'Invalid params',
          {
            message: error.message,
            field: error.field,
          }
        );
      }
      
      if (error instanceof TimeoutError) {
        return this.createErrorResponse(
          id,
          -32002,
          'Request timeout',
          {
            message: error.message,
            timeout_ms: error.timeoutMs,
          }
        );
      }
      
      if (error instanceof NetworkError || error instanceof ProcessError) {
        return this.createErrorResponse(
          id,
          -32003,
          'Service unavailable',
          {
            message: error.message,
            retryable: error.retryable,
          }
        );
      }
      
      // Generic error
      return this.createErrorResponse(
        id,
        -32000,
        'Internal error',
        {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: error instanceof Error ? error.constructor.name : 'Unknown',
        }
      );
    }
  }

  /**
   * Aggregate tools from all downstream servers
   * Also includes gateway's own tools (e.g., echelon.connectors.list)
   */
  async aggregateTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    // Add gateway's own connector discovery tool (Option B)
    allTools.push({
      name: 'echelon.connectors.list',
      description: 'List available connectors from the catalog. Returns connector_id, name, tool_prefix, scopes, and docs_url for each connector.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    });

    // Aggregate tools from downstream servers
    const processes = this.processManager.getAllProcesses();

    for (const process of processes) {
      try {
        // Call tools/list on downstream server
        const response = await this.forwardToServer(process.id, 'tools/list', {});
        
        // MCP tools/list returns { tools: MCPTool[] }
        const tools = response?.tools || (Array.isArray(response) ? response : []);
        
        // Add prefix to tool names
        if (Array.isArray(tools)) {
          for (const tool of tools) {
            allTools.push({
              ...tool,
              name: `${process.config.tool_prefix}${tool.name}`,
            });
          }
        }
      } catch (error) {
        console.error(`[PROXY] Failed to get tools from server "${process.id}":`, error);
        // Continue with other servers
      }
    }

    return allTools;
  }

  /**
   * Handle tool call with authorization
   */
  async handleToolCall(
    params: any,
    tenantId: string,
    actor: Actor
  ): Promise<any> {
    const toolName = params.name;
    if (!toolName) {
      throw new Error('Tool name required');
    }

    // Gateway's own tools don't need server lookup
    if (toolName === 'echelon.connectors.list') {
      return await this.handleConnectorsList(tenantId);
    }

    // Find server for this tool
    const serverConfig = getServerForTool(toolName, this.config);
    if (!serverConfig) {
      throw new Error(`No server found for tool: ${toolName}`);
    }

    // Authorize tool call
    const action = `tool:${toolName}`;
    let decision: AuthorizationResponse;
    
    try {
      decision = await authorizeAction(
        action,
        params.arguments || {},
        tenantId,
        actor,
        this.kernelId,
        this.controlPlane,
        this.cache
      );
    } catch (error) {
      // If AuthorizationError, emit audit and rethrow
      if (error instanceof AuthorizationError) {
        // Create a deny decision for audit
        const denyDecision: AuthorizationResponse = {
          decision_id: error.decisionId || `deny_${Date.now()}`,
          decision: 'deny',
          reason: error.message,
          policy_id: error.policyId,
          policy_version: '1.0.0',
        };
        
        // Emit audit for denied request
        await emitAuthorizationAudit(
          tenantId,
          action,
          denyDecision,
          actor,
          this.platformUrl,
          this.kernelApiKey,
          params.arguments || {}
        ).catch(() => {}); // Don't fail on audit errors
        
        throw error; // Re-throw AuthorizationError
      }
      throw error; // Re-throw other errors
    }

    // Emit audit for allowed request
    await emitAuthorizationAudit(
      tenantId,
      action,
      decision,
      actor,
      this.platformUrl,
      this.kernelApiKey,
      params.arguments || {}
    ).catch(() => {}); // Don't fail on audit errors

    // Strip prefix and forward to downstream server
    const serverId = this.getServerIdForTool(toolName);
    const strippedName = stripToolPrefix(toolName, serverConfig.tool_prefix);
    
    return await this.forwardToServer(serverId, 'tools/call', {
      name: strippedName,
      arguments: params.arguments,
    });
  }

  /**
   * Handle resource read with authorization
   */
  async handleResourceRead(
    params: any,
    tenantId: string,
    actor: Actor
  ): Promise<any> {
    const uri = params.uri;
    if (!uri) {
      throw new Error('Resource URI required');
    }

    // Authorize resource read
    const action = `resource:${uri}.read`;
    let decision: AuthorizationResponse;
    
    try {
      decision = await authorizeAction(
        action,
        params,
        tenantId,
        actor,
        this.kernelId,
        this.controlPlane,
        this.cache
      );
    } catch (error) {
      // If AuthorizationError, emit audit and rethrow
      if (error instanceof AuthorizationError) {
        const denyDecision: AuthorizationResponse = {
          decision_id: error.decisionId || `deny_${Date.now()}`,
          decision: 'deny',
          reason: error.message,
          policy_id: error.policyId,
          policy_version: '1.0.0',
        };
        
        await emitAuthorizationAudit(
          tenantId,
          action,
          denyDecision,
          actor,
          this.platformUrl,
          this.kernelApiKey,
          params
        ).catch(() => {});
        
        throw error;
      }
      throw error;
    }

    // Emit audit for allowed request
    await emitAuthorizationAudit(
      tenantId,
      action,
      decision,
      actor,
      this.platformUrl,
      this.kernelApiKey,
      params
    ).catch(() => {});

    // Forward to appropriate server
    // TODO: Implement proper resource routing (match URI to server)
    // For now, try all servers until one succeeds
    const processes = this.processManager.getAllProcesses();
    if (processes.length === 0) {
      throw new Error('No servers available');
    }

    // Try each server until one succeeds
    let lastError: Error | null = null;
    for (const process of processes) {
      try {
        return await this.forwardToServer(process.id, 'resources/read', params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        // Continue to next server
      }
    }

    // All servers failed
    throw lastError || new Error('All servers failed to read resource');
  }

  /**
   * Handle resource write with authorization
   */
  async handleResourceWrite(
    params: any,
    tenantId: string,
    actor: Actor
  ): Promise<any> {
    const uri = params.uri;
    if (!uri) {
      throw new ValidationError('Resource URI required', 'uri');
    }

    // Authorize resource write
    const action = `resource:${uri}.write`;
    let decision: AuthorizationResponse;
    
    try {
      decision = await authorizeAction(
        action,
        params,
        tenantId,
        actor,
        this.kernelId,
        this.controlPlane,
        this.cache
      );
    } catch (error) {
      // If AuthorizationError, emit audit and rethrow
      if (error instanceof AuthorizationError) {
        const denyDecision: AuthorizationResponse = {
          decision_id: error.decisionId || `deny_${Date.now()}`,
          decision: 'deny',
          reason: error.message,
          policy_id: error.policyId,
          policy_version: '1.0.0',
        };
        
        await emitAuthorizationAudit(
          tenantId,
          action,
          denyDecision,
          actor,
          this.platformUrl,
          this.kernelApiKey,
          params
        ).catch(() => {});
        
        throw error;
      }
      throw error;
    }

    // Emit audit for allowed request
    await emitAuthorizationAudit(
      tenantId,
      action,
      decision,
      actor,
      this.platformUrl,
      this.kernelApiKey,
      params
    ).catch(() => {});

    // Forward to appropriate server
    // TODO: Implement proper resource routing (match URI to server)
    // For now, try all servers until one succeeds
    const processes = this.processManager.getAllProcesses();
    if (processes.length === 0) {
      throw new ProcessError('No servers available', 'all');
    }

    // Try each server until one succeeds
    let lastError: Error | null = null;
    for (const process of processes) {
      try {
        return await this.forwardToServer(process.id, 'resources/write', params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        // Continue to next server
      }
    }

    // All servers failed
    throw lastError || new ProcessError('All servers failed to write resource', 'all');
  }

  /**
   * Handle prompts list
   */
  async handlePromptsList(): Promise<any[]> {
    // Aggregate prompts from all servers
    const allPrompts: any[] = [];
    const processes = this.processManager.getAllProcesses();

    for (const process of processes) {
      try {
        const response = await this.forwardToServer(process.id, 'prompts/list', {});
        // MCP prompts/list returns { prompts: MCPPrompt[] }
        const prompts = response?.prompts || (Array.isArray(response) ? response : []);
        if (Array.isArray(prompts)) {
          allPrompts.push(...prompts);
        }
      } catch (error) {
        console.error(`[PROXY] Failed to get prompts from server "${process.id}":`, error);
      }
    }

    return allPrompts;
  }

  /**
   * Handle prompt get with authorization
   */
  async handlePromptGet(
    params: any,
    tenantId: string,
    actor: Actor
  ): Promise<any> {
    const promptName = params.name;
    if (!promptName) {
      throw new Error('Prompt name required');
    }

    // Authorize prompt access
    const action = `prompt:${promptName}.get`;
    const decision = await authorizeAction(
      action,
      params,
      tenantId,
      actor,
      this.kernelId,
      this.controlPlane,
      this.cache
    );

    // Emit audit
    await emitAuthorizationAudit(
      tenantId,
      action,
      decision,
      actor,
      this.platformUrl,
      this.kernelApiKey,
      params.arguments || {}
    );

    // Decision is checked in authorizeAction - if we get here, it's allowed

    // Forward to appropriate server
    // TODO: Implement proper prompt routing (match name to server)
    // For now, try all servers until one succeeds
    const processes = this.processManager.getAllProcesses();
    if (processes.length === 0) {
      throw new Error('No servers available');
    }

    // Try each server until one succeeds
    let lastError: Error | null = null;
    for (const process of processes) {
      try {
        return await this.forwardToServer(process.id, 'prompts/get', params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        // Continue to next server
      }
    }

    // All servers failed
    throw lastError || new Error('All servers failed to get prompt');
  }

  /**
   * Handle resources list
   */
  async handleResourcesList(): Promise<any[]> {
    const allResources: any[] = [];
    const processes = this.processManager.getAllProcesses();

    for (const process of processes) {
      try {
        const response = await this.forwardToServer(process.id, 'resources/list', {});
        // MCP resources/list returns { resources: MCPResource[] }
        const resources = response?.resources || (Array.isArray(response) ? response : []);
        if (Array.isArray(resources)) {
          allResources.push(...resources);
        }
      } catch (error) {
        console.error(`[PROXY] Failed to get resources from server "${process.id}":`, error);
      }
    }

    return allResources;
  }

  /**
   * Forward request to downstream MCP server
   */
  private async forwardToServer(
    serverId: string,
    method: string,
    params: any,
    retries: number = 1
  ): Promise<any> {
    const process = this.processManager.getServerProcess(serverId);
    if (!process) {
      throw new ProcessError(
        `Server "${serverId}" not found`,
        serverId
      );
    }

    // Get or create MCP client for this process
    let client;
    try {
      client = await this.clientManager.getClient(process);
    } catch (error) {
      throw new ProcessError(
        `Failed to get client for server "${serverId}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        serverId,
        undefined,
        error instanceof Error ? error : undefined
      );
    }

    // Check if client is ready
    if (!client.isReady()) {
      throw new ProcessError(
        `Server "${serverId}" is not ready`,
        serverId
      );
    }

    // Call method via MCP client with retries
    try {
      const result = await client.call(method, params, 30000, retries);
      return result;
    } catch (error) {
      // If retryable and retries remaining, retry
      if (isRetryableError(error) && retries > 0) {
        console.warn(`[PROXY] Retrying "${method}" on server "${serverId}" (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        return this.forwardToServer(serverId, method, params, retries - 1);
      }
      
      // Map to appropriate error type
      if (error instanceof MCPProtocolError) {
        throw error;
      }
      
      if (error instanceof TimeoutError) {
        throw error;
      }
      
      // Wrap in ProcessError
      throw new ProcessError(
        `Error calling "${method}" on server "${serverId}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        serverId,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get server ID for a tool name
   */
  private getServerIdForTool(toolName: string): string {
    const serverConfig = getServerForTool(toolName, this.config);
    if (!serverConfig) {
      throw new Error(`No server found for tool: ${toolName}`);
    }

    // Find server ID by config
    for (const [id, config] of Object.entries(this.config.servers)) {
      if (config === serverConfig) {
        return id;
      }
    }

    throw new Error(`Server ID not found for tool: ${toolName}`);
  }

  /**
   * Handle sampling create with authorization
   */
  async handleSamplingCreate(
    params: any,
    tenantId: string,
    actor: Actor
  ): Promise<any> {
    const model = params.model || params.model_name || 'unknown';
    const prompt = params.prompt || params.messages || '';

    // Authorize sampling
    const action = `sampling:${model}.create`;
    let decision: AuthorizationResponse;
    
    try {
      decision = await authorizeAction(
        action,
        params,
        tenantId,
        actor,
        this.kernelId,
        this.controlPlane,
        this.cache
      );
    } catch (error) {
      // If AuthorizationError, emit audit and rethrow
      if (error instanceof AuthorizationError) {
        const denyDecision: AuthorizationResponse = {
          decision_id: error.decisionId || `deny_${Date.now()}`,
          decision: 'deny',
          reason: error.message,
          policy_id: error.policyId,
          policy_version: '1.0.0',
        };
        
        await emitAuthorizationAudit(
          tenantId,
          action,
          denyDecision,
          actor,
          this.platformUrl,
          this.kernelApiKey,
          params
        ).catch(() => {});
        
        throw error;
      }
      throw error;
    }

    // Emit audit for allowed request
    await emitAuthorizationAudit(
      tenantId,
      action,
      decision,
      actor,
      this.platformUrl,
      this.kernelApiKey,
      params
    ).catch(() => {});

    // Forward to appropriate server
    // TODO: Implement proper sampling routing (match model to server)
    // For now, try all servers until one succeeds
    const processes = this.processManager.getAllProcesses();
    if (processes.length === 0) {
      throw new ProcessError('No servers available', 'all');
    }

    // Try each server until one succeeds
    let lastError: Error | null = null;
    for (const process of processes) {
      try {
        return await this.forwardToServer(process.id, 'sampling/create', params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        // Continue to next server
      }
    }

    // All servers failed
    throw lastError || new ProcessError('All servers failed to create sampling', 'all');
  }

  /**
   * Handle discovery request
   */
  async handleDiscovery(): Promise<any> {
    // Aggregate tools to get accurate counts
    let aggregatedTools: MCPTool[] = [];
    try {
      aggregatedTools = await this.aggregateTools();
    } catch (error) {
      // If tool aggregation fails, continue without tool counts
      console.warn('[PROXY] Failed to aggregate tools for discovery:', error);
    }

    const discoveryInfo = await getDiscoveryInfo(
      this.config,
      this.processManager,
      `${this.platformUrl}/onboard/mcp-gateway`,
      aggregatedTools
    );
    
    return {
      gateway: discoveryInfo,
      servers: discoveryInfo.available_servers,
      capabilities: discoveryInfo.capabilities,
      total_tools: aggregatedTools.length,
    };
  }

  /**
   * Handle info request (gateway metadata)
   */
  async handleInfo(): Promise<any> {
    const discoveryInfo = await getDiscoveryInfo(
      this.config,
      this.processManager,
      `${this.platformUrl}/onboard/mcp-gateway`
    );
    
    return {
      name: discoveryInfo.name,
      description: discoveryInfo.description,
      version: discoveryInfo.gateway_version,
      registration_url: discoveryInfo.registration_url,
      registration_required: discoveryInfo.registration_required,
    };
  }

  /**
   * Handle registration request
   */
  async handleRegister(params: any): Promise<any> {
    if (!params || !params.agent_id) {
      throw new ValidationError('agent_id is required', 'agent_id');
    }

    const registrationRequest = {
      agent_id: params.agent_id,
      agent_name: params.agent_name,
      email: params.email,
      organization_name: params.organization_name,
      requested_servers: params.requested_servers,
    };

    const response = await handleRegistration(
      registrationRequest,
      this.config,
      this.platformUrl
    );

    return response;
  }

  /**
   * Handle status request
   */
  async handleStatus(params: any, tenantId: string): Promise<any> {
    const agentId = params?.agent_id;
    const status = await getRegistrationStatus(agentId || 'unknown', tenantId);
    
    return status;
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: any
  ): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    };
  }

  /**
   * Handle connectors.list tool (Option B: Discovery inside MCP)
   * 
   * Returns available connectors from Repo B catalog
   */
  private async handleConnectorsList(tenantId: string): Promise<any> {
    const platformUrl = this.platformUrl;
    
    try {
      const response = await fetch(`${platformUrl}/functions/v1/connectors/list`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.kernelApiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch connectors: ${response.status}`);
      }

      const data = await response.json();
      return {
        connectors: data.data?.connectors || [],
        count: data.data?.count || 0,
      };
    } catch (error) {
      console.error('[PROXY] Failed to fetch connectors:', error);
      throw new Error(`Failed to list connectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
