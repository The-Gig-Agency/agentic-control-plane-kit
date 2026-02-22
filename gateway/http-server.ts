/**
 * HTTP Server for Hosted MCP Gateway
 * 
 * Provides HTTP/WebSocket endpoints for MCP protocol
 * Multi-tenant by default (identifies tenant via API key)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { MCPRequest, MCPResponse } from './types.ts';
import { extractTenantFromApiKey, extractActor } from './auth.ts';
import { handleMCPRequest } from './server.ts';
import { Actor } from './types.ts';
import {
  ConfigurationError,
  AuthorizationError,
  ValidationError,
} from './errors.ts';

// Import gateway initialization
import { initialize } from './server.ts';

// Initialize gateway (reuse existing initialization)
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  
  // Run gateway initialization (loads config, connects to Repo B, spawns MCP servers)
  await initialize();
  initialized = true;
}

/**
 * Handle HTTP request
 */
async function handleHttpRequest(req: Request): Promise<Response> {
  try {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    };

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract API key from headers
    const apiKey = req.headers.get('X-API-Key') || 
                   url.searchParams.get('api_key');

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'X-API-Key header or api_key query parameter required',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lookup tenant from API key
    let tenantId: string;
    try {
      tenantId = await extractTenantFromApiKey(apiKey);
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Invalid API key',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle MCP protocol endpoint
    if (path === '/mcp' || path === '/') {
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'Method not allowed',
        }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Parse MCP request
      let mcpRequest: MCPRequest;
      try {
        mcpRequest = await req.json();
      } catch (error) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : 'Invalid JSON',
          },
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract actor (system actor for now, could be enhanced to use API key)
      const actor = extractActor();

      // Get proxy from initialized server
      const { proxy } = await import('./server.ts');
      
      // Handle MCP request via proxy
      const mcpResponse = await proxy.handleRequest(mcpRequest, tenantId, actor);

      return new Response(JSON.stringify(mcpResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Discovery endpoint (public, no API key required)
    if (path === '/meta.discover' && req.method === 'GET') {
      // Import discovery handler
      const { getDiscoveryInfo } = await import('./discovery.ts');
      const { loadConfig } = await import('./config.ts');
      const { ProcessManager } = await import('./process-manager.ts');
      
      const config = loadConfig();
      const processManager = new ProcessManager();
      
      const discoveryInfo = await getDiscoveryInfo(
        config,
        processManager,
        'https://echelon.com/signup'
      );

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        result: discoveryInfo,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Not found
    return new Response(JSON.stringify({
      error: 'Not found',
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[HTTP] Error handling request:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * Start HTTP server
 */
export async function startHttpServer(port: number = 8000): Promise<void> {
  await ensureInitialized();

  console.log(`[HTTP] Starting MCP Gateway HTTP server on port ${port}...`);
  console.log(`[HTTP] Gateway URL: http://localhost:${port}`);
  console.log(`[HTTP] MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`[HTTP] Discovery: http://localhost:${port}/meta.discover`);

  await serve(handleHttpRequest, { port });

  console.log(`[HTTP] Server started on port ${port}`);
}

// Start server if run directly
if (import.meta.main) {
  const port = parseInt(Deno.env.get('PORT') || '8000');
  startHttpServer(port).catch((error) => {
    console.error('[HTTP] Fatal error:', error);
    Deno.exit(1);
  });
}
