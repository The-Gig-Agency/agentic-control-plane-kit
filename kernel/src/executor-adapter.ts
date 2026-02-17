/**
 * ExecutorAdapter - Interface for calling external services (e.g., CIQ Automations)
 * 
 * This allows packs to delegate execution to external services while
 * maintaining governance through the kernel.
 */

import { hashPayload } from './audit';

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
   */
  execute<T = any>(
    endpoint: string,
    params: Record<string, any>,
    tenantId: string
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
 * Calls endpoint-style URLs (e.g., legacy CIA or custom executor).
 * Use CiaExecutorAdapter for Repo C (key-vault-executor).
 */
export class HttpExecutorAdapter implements ExecutorAdapter {
  private executorUrl: string;
  private apiKey?: string;

  constructor(config: { executorUrl: string; apiKey?: string }) {
    this.executorUrl = config.executorUrl;
    this.apiKey = config.apiKey;
  }

  async execute<T = any>(
    endpoint: string,
    params: Record<string, any>,
    tenantId: string
  ): Promise<ExecutorResponse<T>> {
    // Replace {tenantId} placeholder in endpoint
    const url = endpoint.replace('{tenantId}', tenantId);
    const fullUrl = `${this.executorUrl}${url}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Executor failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      data: result.data || result,
      resource_ids: result.resource_ids,
      resource_type: result.resource_type,
      count: result.count,
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
