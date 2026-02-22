/**
 * Authentication and tenant extraction for MCP Gateway
 * 
 * Phase 1 (MVP): Single tenant per instance via environment variable
 * Phase 2 (Future): Multi-tenant via API key handshake
 */

import { Actor, MCPConnectionMetadata } from './types.ts';

/**
 * Extract tenant ID from environment variable (Phase 1)
 * 
 * For MVP, one gateway instance = one tenant
 * Set ACP_TENANT_ID environment variable
 */
export function extractTenantId(): string {
  const tenantId = Deno.env.get('ACP_TENANT_ID');
  if (!tenantId) {
    throw new Error(
      'ACP_TENANT_ID environment variable required. ' +
      'For Phase 1 (MVP), one gateway instance = one tenant.'
    );
  }
  return tenantId.trim();
}

/**
 * Extract actor information from connection metadata
 * 
 * Phase 1: Uses system actor (gateway itself)
 * Phase 2: Will extract from API key in connection metadata
 */
export function extractActor(
  connectionMetadata?: MCPConnectionMetadata
): Actor {
  // Phase 1: Gateway acts as system actor
  // Phase 2: Extract from API key in connectionMetadata
  if (connectionMetadata?.apiKey) {
    // Phase 2 implementation would:
    // 1. Validate API key
    // 2. Lookup tenant from Repo B or local cache
    // 3. Return actor with api_key type
    // For now, fall back to system actor
    return {
      type: 'system',
      id: 'mcp-gateway',
    };
  }

  // Phase 1: System actor
  return {
    type: 'system',
    id: 'mcp-gateway',
  };
}

/**
 * Validate API key (Phase 2 - placeholder)
 * 
 * Future implementation will:
 * - Validate API key format
 * - Lookup tenant mapping from Repo B
 * - Cache tenant mappings
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  // Phase 2 implementation
  // For now, return true if key exists
  return apiKey.length > 0;
}

/**
 * Get tenant from API key (Phase 2 - placeholder)
 * 
 * Future implementation will:
 * - Query Repo B for tenant mapping
 * - Cache results
 * - Handle cache invalidation
 */
export async function getTenantFromApiKey(
  apiKey: string
): Promise<string | null> {
  // Phase 2 implementation
  // For now, return null (use env var instead)
  return null;
}
