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
 * Get CORS headers based on allowed origins
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [];
  const defaultOrigin = Deno.env.get('DEFAULT_CORS_ORIGIN') || 'https://echelon.com';
  
  // If no origin header, use default
  if (!origin) {
    return {
      'Access-Control-Allow-Origin': defaultOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  
  // Check if origin is allowed
  const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
  const allowOrigin = isAllowed ? origin : defaultOrigin;
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Handle HTTP request
 * 
 * Exported for use by Vercel serverless functions
 */
export async function handleHttpRequest(req: Request): Promise<Response> {
  try {
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Health check (public, no initialization needed)
    if (path === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Discovery endpoint (public, no API key required)
    if (path === '/meta.discover' && req.method === 'GET') {
      try {
        // Try to load config, but handle gracefully if it doesn't exist
        let config;
        let processManager;
        try {
          const { loadConfig } = await import('./config.ts');
          const { ProcessManager } = await import('./process-manager.ts');
          config = loadConfig();
          processManager = new ProcessManager();
        } catch (error) {
          // Config might not exist in serverless - return basic discovery info
          console.warn('[HTTP] Config not found, returning basic discovery info:', error);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            result: {
              gateway: {
                name: 'Echelon MCP Gateway',
                url: 'https://gateway.buyechelon.com',
                registration_required: true,
                registration_url: 'https://www.buyechelon.com/consumer',
              },
              servers: [],
              capabilities: {
                tools: true,
                resources: true,
                prompts: true,
                sampling: true,
              },
            },
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const { getDiscoveryInfo } = await import('./discovery.ts');
        const discoveryInfo = await getDiscoveryInfo(
          config,
          processManager,
          'https://www.buyechelon.com/consumer'
        );

        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          result: discoveryInfo,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[HTTP] Discovery error:', error);
        // Return basic discovery info even on error
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          result: {
            gateway: {
              name: 'Echelon MCP Gateway',
              url: 'https://gateway.buyechelon.com',
              registration_required: true,
              registration_url: 'https://www.buyechelon.com/consumer',
            },
            servers: [],
            capabilities: {
              tools: true,
              resources: true,
              prompts: true,
              sampling: true,
            },
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Extract API key from headers only (SECURITY: query params can leak in logs)
    const apiKey = req.headers.get('X-API-Key');

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'X-API-Key header required',
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

      // Parse and validate MCP request
      let mcpRequest: MCPRequest;
      try {
        const rawRequest = await req.json();
        
        // Validate JSON-RPC 2.0 structure
        if (!rawRequest || typeof rawRequest !== 'object') {
          throw new ValidationError('Request must be a JSON object');
        }
        
        if (rawRequest.jsonrpc !== '2.0') {
          throw new ValidationError('jsonrpc must be "2.0"');
        }
        
        if (!rawRequest.method || typeof rawRequest.method !== 'string') {
          throw new ValidationError('method is required and must be a string');
        }
        
        // Validate params if present
        if (rawRequest.params !== undefined && typeof rawRequest.params !== 'object') {
          throw new ValidationError('params must be an object if provided');
        }
        
        // Enforce request size limit (1MB)
        const requestSize = new TextEncoder().encode(JSON.stringify(rawRequest)).length;
        if (requestSize > 1024 * 1024) {
          throw new ValidationError('Request body too large (max 1MB)');
        }
        
        mcpRequest = rawRequest as MCPRequest;
      } catch (error) {
        if (error instanceof ValidationError) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32602,
              message: 'Invalid params',
              data: error.message,
            },
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
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

    // Not found
    return new Response(JSON.stringify({
      error: 'Not found',
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[HTTP] Error handling request:', error);
    
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
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

// Also support being imported and called directly (for Docker/ECS)
export { startHttpServer, handleHttpRequest };
