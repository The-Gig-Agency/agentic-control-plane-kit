/**
 * ExecutorAdapter - Interface for calling external services (e.g., CIQ Automations)
 * 
 * This allows packs to delegate execution to external services while
 * maintaining governance through the kernel.
 */

import { hashPayload } from './audit.ts';

export interface ExecutorResponse<T = any> {
  data: T;
  resource_ids?: string[];
  resource_type?: string;
  count?: number;
}

export interface ExecutorAdapter {
  /**
   * Execute an action via external service
   * 
   * @param endpoint - Endpoint path (e.g., "/api/tenants/{tenantId}/shopify/products.create")
   * @param params - Action parameters
   * @param tenantId - Tenant ID for the request
   * @param trace - Optional trace information (kernel_id, policy_decision_id, actor_id)
   */
  execute<T = any>(
    endpoint: string,
    params: Record<string, any>,
    tenantId: string,
    trace?: {
      kernel_id?: string;
      policy_decision_id?: string;
      actor_id?: string;
    }
  ): Promise<ExecutorResponse<T>>;
}

/**
 * Parse endpoint path to integration and action for Repo C.
 * 
 * Examples:
 * - /api/tenants/{tenantId}/shopify/products.list → { integration: "shopify", action: "shopify.products.list" }
 * - /api/tenants/{tenantId}/ciq/campaigns.list → { integration: "ciq", action: "ciq.campaigns.list" }
 */
export function parseEndpointToCiaFormat(endpoint: string): { integration: string; action: string } {
  const match = endpoint.match(/\/api\/tenants\/[^/]+\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid executor endpoint format: ${endpoint}. Expected /api/tenants/{tenantId}/{integration}/{resource}.{verb}`);
  }
  const integration = match[1];
  const resourceVerb = match[2];
  const action = `${integration}.${resourceVerb}`;
  return { integration, action };
}

/**
 * HTTP implementation of ExecutorAdapter
 * 
 * Calls CIA /api/execute endpoint (Key Vault + Executor - Repo C).
 * This is the standard adapter for Repo C (key-vault-executor).
 * 
 * For legacy endpoint-style URLs, use CiaExecutorAdapter below.
 */
export class HttpExecutorAdapter implements ExecutorAdapter {
  private ciaUrl: string;
  private ciaServiceKey: string;
  private ciaAnonKey?: string;  // Supabase anon key (required for Supabase Edge Functions)
  private kernelId?: string;

  constructor(config: { 
    ciaUrl: string;  // CIA base URL (e.g., https://xxx.supabase.co)
    ciaServiceKey: string;  // CIA_SERVICE_KEY for authentication
    ciaAnonKey?: string;  // Supabase anon key (required for Supabase Edge Functions)
    kernelId?: string;  // Optional: kernel ID for trace
  }) {
    this.ciaUrl = config.ciaUrl;
    this.ciaServiceKey = config.ciaServiceKey;
    this.ciaAnonKey = config.ciaAnonKey;
    this.kernelId = config.kernelId;
  }

  async execute<T = any>(
    endpoint: string,
    params: Record<string, any>,
    tenantId: string,
    trace?: {
      kernel_id?: string;
      policy_decision_id?: string;
      actor_id?: string;
    }
  ): Promise<ExecutorResponse<T>> {
    // Extract integration and action from endpoint
    // e.g., "/api/tenants/{tenantId}/shopify/products.create" -> integration: "shopify", action: "products.create"
    const endpointMatch = endpoint.match(/\/(shopify|ciq|leadscore)\/(.+)$/);
    if (!endpointMatch) {
      throw new Error(`Invalid endpoint format: ${endpoint}. Expected pattern: /api/tenants/{tenantId}/{integration}/{action}`);
    }

    const integration = endpointMatch[1];
    const action = endpointMatch[2];

    // Create request hash (sanitized, canonical JSON)
    const { sanitize, canonicalJson } = await import('./sanitize.ts');
    const { hashPayload } = await import('./audit.ts');
    const sanitizedParams = sanitize(params);
    const canonicalParams = canonicalJson(sanitizedParams);
    const request_hash = await hashPayload(canonicalParams);

    // Call CIA /api/execute
    const fullUrl = `${this.ciaUrl}/functions/v1/execute`;
    
    // Build headers - Supabase Edge Functions require apikey header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.ciaServiceKey}`,
    };
    
    // Add apikey header if provided (required for Supabase Edge Functions)
    if (this.ciaAnonKey) {
      headers['apikey'] = this.ciaAnonKey;
    }
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenant_id: tenantId,
        integration,
        action: `${integration}.${action}`,  // e.g., "shopify.products.create"
        params,
        request_hash,
        trace: {
          kernel_id: trace?.kernel_id || this.kernelId || 'unknown',
          policy_decision_id: trace?.policy_decision_id,
          actor_id: trace?.actor_id,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error_message_redacted || error.error || `CIA executor failed: ${response.status}`);
    }

    const result = await response.json();
    
    // Transform CIA response to ExecutorResponse format
    return {
      data: result.data,
      resource_ids: result.result_meta?.ids_created || (result.result_meta?.resource_id ? [result.result_meta.resource_id] : undefined),
      resource_type: result.result_meta?.resource_type,
      count: result.result_meta?.count,
    };
  }
}

/**
 * Repo C (key-vault-executor) compatible ExecutorAdapter.
 * 
 * Maps pack endpoint-style calls to Repo C's POST /functions/v1/execute API:
 * - Parses endpoint (e.g. /api/tenants/{tenantId}/shopify/products.list) → integration, action
 * - Computes request_hash via hashPayload()
 * - POSTs to {ciaUrl}/functions/v1/execute with apikey + Authorization: Bearer {ciaServiceKey}
 * 
 * Env vars: CIA_URL, CIA_SERVICE_KEY, CIA_ANON_KEY
 */
export class CiaExecutorAdapter implements ExecutorAdapter {
  private ciaUrl: string;
  private ciaServiceKey: string;
  private ciaAnonKey: string;

  constructor(config: { ciaUrl: string; ciaServiceKey: string; ciaAnonKey: string }) {
    this.ciaUrl = config.ciaUrl.replace(/\/$/, '');
    this.ciaServiceKey = config.ciaServiceKey;
    this.ciaAnonKey = config.ciaAnonKey;
  }

  async execute<T = any>(
    endpoint: string,
    params: Record<string, any>,
    tenantId: string
  ): Promise<ExecutorResponse<T>> {
    const { integration, action } = parseEndpointToCiaFormat(endpoint);
    const request_hash = await hashPayload(params);

    const body = {
      tenant_id: tenantId,
      integration,
      action,
      params: params ?? {},
      request_hash,
    };

    const url = `${this.ciaUrl}/functions/v1/execute`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': this.ciaAnonKey,
      'Authorization': `Bearer ${this.ciaServiceKey}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = result.error_message_redacted ?? result.error ?? `Executor failed: ${response.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    if (result.ok === false) {
      const msg = result.error_message_redacted ?? result.error ?? 'Execution failed';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    return {
      data: result.data ?? result,
      resource_ids: result.resource_ids,
      resource_type: result.resource_type,
      count: result.count,
    };
  }
}
