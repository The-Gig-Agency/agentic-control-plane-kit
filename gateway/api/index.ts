/**
 * Vercel Serverless Function Handler for MCP Gateway
 * 
 * This is the entry point for Vercel Deno serverless functions.
 * Vercel requires a default export that handles Request and returns Response.
 */

import { handleHttpRequest } from '../http-server.ts';

// Export default handler for Vercel
export default async function handler(req: Request): Promise<Response> {
  try {
    return await handleHttpRequest(req);
  } catch (error) {
    // Catch any unhandled errors and return a proper response
    console.error('[Vercel Handler] Unhandled error:', error);
    const origin = req.headers.get('Origin');
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Content-Type': 'application/json',
    };
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
