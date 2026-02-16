/**
 * Authentication and authorization utilities
 */

import { DbAdapter, Bindings } from './types';

export interface AuthResult {
  success: boolean;
  tenantId?: string;
  apiKeyId?: string;
  scopes?: string[];
  keyPrefix?: string;
  error?: string;
  status?: number;
}

export async function validateApiKey(
  req: Request,
  dbAdapter: DbAdapter,
  bindings: Bindings
): Promise<AuthResult> {
  const apiKey = req.headers.get('x-api-key');
  
  if (!apiKey) {
    return { success: false, error: 'Missing X-API-Key header', status: 401 };
  }

  const { key_prefix, prefix_length } = bindings.auth;
  
  // Validate format
  if (!apiKey.startsWith(key_prefix) || apiKey.length < prefix_length) {
    return { success: false, error: 'Invalid API key format', status: 401 };
  }

  const prefix = apiKey.slice(0, prefix_length);
  
  // Hash the full key for comparison
  // SECURITY: Use HMAC-SHA-256 with a pepper for production
  // Current implementation uses SHA-256 as fallback
  // For HMAC, set bindings.auth.hmac_pepper (from environment variable)
  let keyHash: string;
  
  const hmacPepper = (bindings.auth as any).hmac_pepper;
  if (hmacPepper) {
    // HMAC-SHA-256 (recommended for production)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacPepper);
    const messageData = encoder.encode(apiKey);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // SHA-256 fallback (acceptable but HMAC preferred)
    // Note: HMAC-SHA-256 is supported via bindings.auth.hmac_pepper
    // If HMAC_PEPPER env var is set, HMAC will be used automatically
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Look up API key by prefix and hash
  const keyQuery = `
    SELECT id, ${bindings.auth.scopes_column} as scopes, status, ${bindings.tenant.id_column} as tenant_id
    FROM ${bindings.auth.keys_table}
    WHERE ${bindings.auth.key_prefix_column} = $1
      AND ${bindings.auth.key_hash_column} = $2
    LIMIT 1
  `;
  
  const keyRecord = await dbAdapter.queryOne<any>(keyQuery, [prefix, keyHash]);

  if (!keyRecord) {
    return { success: false, error: 'Invalid API key', status: 401 };
  }

  if (keyRecord.status !== 'active') {
    return { success: false, error: 'API key is inactive', status: 403 };
  }

  return {
    success: true,
    tenantId: keyRecord.tenant_id,
    apiKeyId: keyRecord.id,
    scopes: keyRecord.scopes || [],
    keyPrefix: prefix
  };
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}
