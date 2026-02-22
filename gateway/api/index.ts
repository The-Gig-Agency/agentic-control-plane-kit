/**
 * Vercel Serverless Function Handler for MCP Gateway
 * 
 * This is the entry point for Vercel Deno serverless functions.
 * Vercel requires a default export that handles Request and returns Response.
 */

import { handleHttpRequest } from '../http-server.ts';

// Export default handler for Vercel
export default async function handler(req: Request): Promise<Response> {
  return await handleHttpRequest(req);
}
