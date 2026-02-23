/**
 * MCP Gateway Server - Main Entry Point
 * 
 * Registered Echelon kernel that provides governance for MCP protocol
 * Registers with Repo B, spawns downstream servers, handles MCP requests
 */

import { loadConfig } from './config.ts';
import { extractTenantId, extractActor } from './auth.ts';
import { AuthorizationCache } from './cache.ts';
import { ProcessManager } from './process-manager.ts';
import { HealthMonitor } from './health.ts';
import { MCPProxy } from './proxy.ts';
import { MCPRequest, MCPResponse, Actor } from './types.ts';
import { HttpControlPlaneAdapter } from './kernel-bridge.ts';
import {
  ConfigurationError,
  NetworkError,
  ProcessError,
  formatError,
} from './errors.ts';

// Initialize components
let config: ReturnType<typeof loadConfig>;
let controlPlane: HttpControlPlaneAdapter;
let cache: AuthorizationCache;
let processManager: ProcessManager;
let healthMonitor: HealthMonitor;
let proxy: MCPProxy;
let tenantId: string;

// Export for HTTP server
export { proxy, processManager, controlPlane, cache };

/**
 * Initialize gateway
 */
export async function initialize(): Promise<void> {
  console.log('[GATEWAY] Initializing MCP Gateway...');

  // 1. Load configuration
  try {
    config = loadConfig();
    console.log(`[GATEWAY] ✅ Loaded config for kernel: ${config.kernel.kernelId}`);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }

  // 2. Initialize ControlPlaneAdapter
  const platformUrl = Deno.env.get('ACP_BASE_URL');
  const kernelApiKey = Deno.env.get('ACP_KERNEL_KEY');

  if (!platformUrl || !kernelApiKey) {
    throw new ConfigurationError(
      'ACP_BASE_URL and ACP_KERNEL_KEY environment variables required. ' +
      'Set these to connect to Governance Hub (Repo B).'
    );
  }

  controlPlane = new HttpControlPlaneAdapter({
    platformUrl,
    kernelApiKey,
  });

  console.log(`[GATEWAY] Connected to Governance Hub: ${platformUrl}`);

  // 3. Register kernel with Repo B via heartbeat
  try {
    if (controlPlane.heartbeat) {
      const heartbeatResult = await controlPlane.heartbeat({
        kernel_id: config.kernel.kernelId,
        version: config.kernel.version,
        packs: ['mcp-governance'],
        env: Deno.env.get('ENVIRONMENT') || 'production',
      });

      if (heartbeatResult.ok) {
        console.log(`✅ Kernel "${config.kernel.kernelId}" registered with Repo B`);
      } else {
        console.warn(`⚠️ Heartbeat failed: ${heartbeatResult.error || 'Unknown error'}`);
      }
    } else {
      console.warn('⚠️ ControlPlaneAdapter does not support heartbeat');
    }
  } catch (error) {
    console.error('[GATEWAY] Failed to register with Repo B:', error);
    // Continue anyway - authorization will fail but gateway can start
  }

  // 4. Extract tenant ID (optional for hosted gateway - can be extracted per-request from API key)
  try {
    tenantId = extractTenantId();
    console.log(`[GATEWAY] ✅ Tenant ID: ${tenantId.substring(0, 8)}...`);
  } catch (error) {
    // For hosted gateway, tenant ID is extracted per-request from API key
    // So it's OK if ACP_TENANT_ID is not set
    console.log(`[GATEWAY] ⚠️  Tenant ID not set (will be extracted per-request from API key)`);
    tenantId = ''; // Will be set per-request
  }

  // 5. Initialize cache
  cache = new AuthorizationCache();
  console.log('[GATEWAY] Authorization cache initialized');

  // 6. Initialize process manager
  processManager = new ProcessManager();
  console.log('[GATEWAY] Process manager initialized');

  // 7. Spawn downstream MCP servers
  const spawnErrors: Array<{ serverId: string; error: Error }> = [];
  for (const [serverId, serverConfig] of Object.entries(config.servers)) {
    try {
      await processManager.spawnServer(serverId, serverConfig);
      console.log(`[GATEWAY] ✅ Spawned server: ${serverId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      spawnErrors.push({ serverId, error: err });
      console.error(`[GATEWAY] ❌ Failed to spawn server "${serverId}":`, formatError(err));
      // Continue with other servers
    }
  }
  
  if (spawnErrors.length > 0) {
    console.warn(`[GATEWAY] ⚠️  ${spawnErrors.length} server(s) failed to spawn. Gateway will continue with available servers.`);
  }
  
  if (spawnErrors.length === Object.keys(config.servers).length) {
    throw new ProcessError(
      'All servers failed to spawn. Gateway cannot operate without at least one server.',
      'all'
    );
  }

  // 8. Initialize health monitor
  healthMonitor = new HealthMonitor(processManager);
  console.log('[GATEWAY] Health monitor initialized');

  // 9. Initialize proxy
  proxy = new MCPProxy(
    config,
    processManager,
    controlPlane,
    cache,
    config.kernel.kernelId,
    platformUrl,
    kernelApiKey
  );
  console.log('[GATEWAY] MCP proxy initialized');

  console.log('[GATEWAY] ✅ Initialization complete');
}

/**
 * Handle incoming MCP request
 * 
 * @param request - MCP request
 * @param tenantId - Tenant ID (optional, will use env var if not provided)
 * @param actor - Actor (optional, will use system actor if not provided)
 */
export async function handleMCPRequest(
  request: MCPRequest,
  tenantIdOverride?: string,
  actorOverride?: Actor
): Promise<MCPResponse> {
  try {
    // Use provided tenant ID or fall back to env var
    const effectiveTenantId = tenantIdOverride || tenantId;
    if (!effectiveTenantId) {
      throw new ConfigurationError('Tenant ID is required');
    }

    // Use provided actor or fall back to system actor
    const effectiveActor = actorOverride || extractActor();

    // Handle request via proxy
    return await proxy.handleRequest(request, effectiveTenantId, effectiveActor);
  } catch (error) {
    // This should rarely happen as proxy.handleRequest catches errors
    // But if it does, return a proper error response
    console.error('[GATEWAY] Unexpected error handling request:', formatError(error instanceof Error ? error : new Error('Unknown error')));
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    };
  }
}

/**
 * Main server function
 */
async function startServer(): Promise<void> {
  try {
    await initialize();
  } catch (error) {
    console.error('[GATEWAY] Initialization failed:', error);
    Deno.exit(1);
  }

  // Handle stdin/stdout for MCP protocol
  // MCP uses JSON-RPC over stdio
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const buffer: Uint8Array[] = [];

  console.log('[GATEWAY] Listening for MCP requests on stdin...');

  // Read from stdin
  for await (const chunk of Deno.stdin.readable) {
    buffer.push(chunk);
    
    // Try to parse complete JSON-RPC messages
    const text = decoder.decode(new Uint8Array(buffer.flat()));
    const lines = text.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const request: MCPRequest = JSON.parse(line);
        
        // Handle request
        const response = await handleMCPRequest(request);
        
        // Write response to stdout
        const responseText = JSON.stringify(response) + '\n';
        await Deno.stdout.write(encoder.encode(responseText));
      } catch (error) {
        // Invalid JSON or request error
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : 'Unknown error',
          },
        };
        
        const errorText = JSON.stringify(errorResponse) + '\n';
        await Deno.stdout.write(encoder.encode(errorText));
      }
    }
    
    // Clear buffer after processing
    buffer.length = 0;
  }
}

// Start server
if (import.meta.main) {
  startServer().catch((error) => {
    console.error('[GATEWAY] Fatal error:', error);
    Deno.exit(1);
  });

  // Cleanup on exit
  const cleanup = async () => {
    console.log('[GATEWAY] Shutting down...');
    if (proxy && (proxy as any).clientManager) {
      await (proxy as any).clientManager.closeAll();
    }
    if (processManager) {
      await processManager.killAll();
    }
  };

  Deno.addSignalListener('SIGINT', async () => {
    await cleanup();
    Deno.exit(0);
  });

  Deno.addSignalListener('SIGTERM', async () => {
    await cleanup();
    Deno.exit(0);
  });
}
