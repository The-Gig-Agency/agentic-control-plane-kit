/**
 * Vercel Serverless Function Handler for MCP Gateway
 * 
 * Minimal handler to test Deno in Vercel
 */

// Simple handler without any imports first
export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Content-Type': 'application/json',
    };
    
    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Health check - simplest possible
    if (path === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: corsHeaders,
      });
    }
    
    // Discovery - basic response
    if (path === '/meta.discover' && req.method === 'GET') {
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
        headers: corsHeaders,
      });
    }
    
    // MCP endpoint - will need API key and imports, but for now return error
    if (path === '/mcp' || path === '/') {
      return new Response(JSON.stringify({
        error: 'MCP endpoint requires API key and full gateway initialization',
      }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    
    // Not found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: corsHeaders,
    });
    
  } catch (error) {
    console.error('[Handler] Error:', error);
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
