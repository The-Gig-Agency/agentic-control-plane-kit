/**
 * Authorization decision caching
 * 
 * Caches allow decisions using decision_ttl_ms from AuthorizationResponse
 * Cache key: tenantId + action + request_hash
 * Only caches 'allow' decisions to prevent authorization latency from blocking throughput
 */

import { CachedDecision } from './types.ts';
import type { AuthorizationResponse } from '../kernel/src/control-plane-adapter.ts';

export class AuthorizationCache {
  private cache: Map<string, CachedDecision> = new Map();
  private cleanupInterval: number;

  constructor(cleanupIntervalMs: number = 60000) {
    // Cleanup expired entries every minute
    this.cleanupInterval = cleanupIntervalMs;
    this.startCleanup();
  }

  /**
   * Generate cache key from tenant, action, and request hash
   */
  generateKey(
    tenantId: string,
    action: string,
    requestHash: string
  ): string {
    return `${tenantId}:${action}:${requestHash}`;
  }

  /**
   * Get cached decision if available and not expired
   */
  async get(key: string): Promise<AuthorizationResponse | null> {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() >= cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Return as AuthorizationResponse
    return {
      decision_id: cached.decision_id,
      decision: cached.decision,
      decision_ttl_ms: cached.decision_ttl_ms,
    };
  }

  /**
   * Set cached decision (only cache 'allow' decisions)
   */
  async set(
    key: string,
    decision: AuthorizationResponse,
    ttlMs?: number
  ): Promise<void> {
    // Only cache 'allow' decisions
    if (decision.decision !== 'allow') {
      return;
    }

    // Use provided TTL or decision_ttl_ms from response
    const ttl = ttlMs || decision.decision_ttl_ms || 60000; // Default 60s
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, {
      decision: decision.decision,
      expiresAt,
      decision_id: decision.decision_id,
      decision_ttl_ms: ttl,
    });
  }

  /**
   * Delete cached decision
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Clear all cached decisions
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.cache.entries()) {
        if (now >= cached.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, this.cleanupInterval);
  }
}
