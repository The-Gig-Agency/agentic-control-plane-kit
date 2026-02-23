/**
 * Policy enforcement logic
 * 
 * Integrates with ControlPlaneAdapter for authorization
 * Coordinates with cache for performance
 * Implements fail-closed behavior
 */

import type {
  ControlPlaneAdapter,
  AuthorizationRequest,
  AuthorizationResponse,
} from './kernel-bridge.ts';
import { Actor } from './types.ts';
import { AuthorizationCache } from './cache.ts';
import { canonicalJson, sanitize } from './kernel-bridge.ts';
import { hashPayload } from './kernel-bridge.ts';
import {
  AuthorizationError,
  NetworkError,
  TimeoutError,
  CacheError,
  ValidationError,
  isRetryableError,
} from './errors.ts';

/**
 * Authorize an MCP action (tool, resource, prompt, sampling)
 * 
 * Flow:
 * 1. Check cache first
 * 2. If cache miss, call ControlPlaneAdapter.authorize()
 * 3. Cache decision if allowed
 * 4. Return decision
 */
export async function authorizeAction(
  action: string,
  params: any,
  tenantId: string,
  actor: Actor,
  kernelId: string,
  controlPlane: ControlPlaneAdapter,
  cache: AuthorizationCache
): Promise<AuthorizationResponse> {
  // Generate request hash for idempotency and caching
  const sanitizedParams = sanitizeParams(params);
  const canonicalParams = canonicalJson(sanitizedParams);
  const requestHash = await hashPayload(canonicalParams);

  // Check cache first
  const cacheKey = cache.generateKey(tenantId, action, requestHash);
  const cached = await cache.get(cacheKey);
  if (cached && cached.decision === 'allow') {
    return cached;
  }

  // Build authorization request
  const authRequest: AuthorizationRequest = {
    kernelId,
    tenantId,
    actor,
    action,
    request_hash: requestHash,
    params_summary: sanitizedParams,
    params_summary_schema_id: 'mcp-v1',
  };

  // Call authorization (fail-closed on error)
  let decision: AuthorizationResponse;
  try {
    // Add timeout wrapper for authorization calls
    const authPromise = controlPlane.authorize(authRequest);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError('Authorization request timed out', 5000)), 5000);
    });
    
    decision = await Promise.race([authPromise, timeoutPromise]);
  } catch (error) {
    // Fail-closed: deny on authorization failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[POLICY] Authorization failed for ${action}:`, errorMessage);
    
    // Determine if it's a network error (retryable) or policy error (not retryable)
    if (error instanceof TimeoutError || 
        (error instanceof Error && (
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT')
        ))) {
      // Network/timeout error - fail-closed but log as network issue
      throw new NetworkError(
        `Authorization service unavailable: ${errorMessage}`,
        error instanceof Error ? error : undefined,
        true // Retryable
      );
    }
    
    // Other errors - fail-closed with deny decision
    return {
      decision_id: `error_${Date.now()}`,
      decision: 'deny',
      reason: `Authorization failed: ${errorMessage}`,
      policy_version: '0.0.0',
    };
  }
  
  // Check decision result
  if (decision.decision === 'deny') {
    throw new AuthorizationError(
      decision.reason || 'Policy denied',
      decision.decision_id,
      decision.policy_id,
      403
    );
  }
  
  if (decision.decision === 'require_approval') {
    throw new AuthorizationError(
      decision.reason || 'Approval required',
      decision.decision_id,
      decision.policy_id,
      403
    );
  }

  // Cache decision if allowed (using TTL from response)
  if (decision.decision === 'allow' && decision.decision_ttl_ms) {
    try {
      await cache.set(cacheKey, decision, decision.decision_ttl_ms);
    } catch (error) {
      // Cache errors are non-fatal - log but continue
      console.warn(`[POLICY] Failed to cache decision: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't throw - caching is best-effort
    }
  }

  return decision;
}

/**
 * Sanitize parameters for authorization request
 * Remove sensitive data, limit size
 */
function sanitizeParams(params: any): Record<string, any> {
  if (!params || typeof params !== 'object') {
    return {};
  }

  const sanitized: Record<string, any> = {};
  const maxDepth = 3;
  const maxSize = 1000; // Max characters in stringified params

  function sanitizeValue(value: any, depth: number): any {
    if (depth > maxDepth) {
      return '[max depth]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      // Limit string length
      return value.length > 200 ? value.substring(0, 200) + '...' : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 10).map(v => sanitizeValue(v, depth + 1));
    }

    if (typeof value === 'object') {
      const obj: Record<string, any> = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count++ >= 20) break; // Limit object keys
        obj[key] = sanitizeValue(val, depth + 1);
      }
      return obj;
    }

    return '[unknown type]';
  }

  const result = sanitizeValue(params, 0);
  const stringified = JSON.stringify(result);
  
  // If too large, truncate
  if (stringified.length > maxSize) {
    return { _truncated: true, _size: stringified.length };
  }

  return result as Record<string, any>;
}
