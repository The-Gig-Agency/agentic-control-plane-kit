/**
 * ExecutorAdapter - Interface for calling external services (e.g., CIQ Automations)
 * 
 * This allows packs to delegate execution to external services while
 * maintaining governance through the kernel.
 */

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
 * HTTP implementation of ExecutorAdapter
 * Calls CIQ Automations (or other executor services)
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
