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
 * WARNING: This returns true for any non-empty key. NOT used in gateway flow
 * (gateway uses extractTenantFromApiKey). Do not use for auth decisions.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
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

/**
 * Extract tenant ID from API key (Hosted Gateway)
 * 
 * Looks up tenant from Repo B using API key
 * Caches results for performance
 */
export async function extractTenantFromApiKey(
  apiKey: string
): Promise<string> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key is required');
  }

  // Validate API key format
  if (!apiKey.startsWith('mcp_')) {
    throw new Error('Invalid API key format. Must start with "mcp_"');
  }

  // Lookup tenant from Repo B (same key store as signup/registry)
  const platformUrl = Deno.env.get('ACP_BASE_URL');
  const kernelApiKey = Deno.env.get('ACP_KERNEL_KEY');

  if (!platformUrl || !kernelApiKey) {
    throw new Error(
      'ACP_BASE_URL and ACP_KERNEL_KEY required for API key lookup'
    );
  }

  // Normalize platform URL - remove trailing /functions/v1 if present
  // (ACP_BASE_URL may already include it; prevents duplication)
  const baseUrl = platformUrl.replace(/\/functions\/v1\/?$/, '');
  const lookupUrl = `${baseUrl}/functions/v1/api-keys-lookup`;

  // Check cache first (if implemented)
  // const cached = await tenantCache.get(apiKey);
  // if (cached) return cached;

  // Lookup from Repo B (must be same Supabase project as signup)
  try {
    const response = await fetch(lookupUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kernelApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      if (response.status === 401) {
        // Kernel auth failed — ACP_KERNEL_KEY wrong or not recognized by Repo B
        throw new Error(`KERNEL_AUTH_FAILED calling api-keys-lookup (${lookupUrl}) body=${bodyText}`);
      }
      if (response.status === 404) {
        throw new Error('API_KEY_NOT_FOUND');
      }
      throw new Error(`API_KEY_LOOKUP_FAILED status=${response.status} body=${bodyText}`);
    }

    const data = await response.json();
    
    // Handle nested response format: { ok: true, data: { tenant_id: "..." } }
    const tenantId = data.data?.tenant_id || data.tenant_id;

    if (!tenantId) {
      console.error('[Auth] API key lookup response missing tenant_id:', JSON.stringify(data));
      throw new Error('Tenant ID not found in response');
    }

    // Cache result (if cache implemented)
    // await tenantCache.set(apiKey, tenantId, 3600000); // 1 hour

    return tenantId;
  } catch (error) {
    // Re-throw as-is; caller distinguishes KERNEL_AUTH_FAILED vs API_KEY_NOT_FOUND
    throw error;
  }
}
