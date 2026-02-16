/**
 * ControlPlaneAdapter - Interface for calling Governance Hub (Repo B)
 * 
 * This adapter allows kernels to consult the platform for authoritative
 * authorization decisions.
 */

export interface AuthorizationRequest {
  kernelId: string;
  tenantId: string;
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
    api_key_id?: string;
  };
  action: string;
  request_hash: string;
  params_summary?: Record<string, any>;
  params_summary_schema_id?: string;
}

export interface AuthorizationResponse {
  decision_id: string;
  decision: 'allow' | 'deny' | 'require_approval';
  approval_id?: string;
  reason?: string;
  policy_id?: string;
  policy_version: string;
  expires_at?: number;
  decision_ttl_ms?: number;
}

export interface ControlPlaneAdapter {
  /**
   * Request authorization decision from Governance Hub
   * 
   * CRITICAL: This is on the hot path - must be fast (<50ms ideally)
   * Kernels should cache decisions using decision_ttl_ms
   */
  authorize(request: AuthorizationRequest): Promise<AuthorizationResponse>;
}

/**
 * HTTP implementation of ControlPlaneAdapter
 * Calls Governance Hub /authorize endpoint
 */
export class HttpControlPlaneAdapter implements ControlPlaneAdapter {
  private platformUrl: string;
  private kernelApiKey: string;

  constructor(config: { platformUrl: string; kernelApiKey: string }) {
    this.platformUrl = config.platformUrl;
    this.kernelApiKey = config.kernelApiKey;
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const response = await fetch(`${this.platformUrl}/functions/v1/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.kernelApiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      // If platform is unreachable, fail-closed (deny)
      if (response.status >= 500) {
        throw new Error(`Platform unreachable: ${response.status}`);
      }
      
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Authorization failed: ${response.status}`);
    }

    const result = await response.json();
    return result.data || result;
  }
}
