/**
 * Unit tests for AuthorizationCache
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { AuthorizationCache } from '../../cache.ts';
import type { AuthorizationResponse } from '../../../kernel/src/control-plane-adapter.ts';

Deno.test('AuthorizationCache - generateKey', () => {
  const cache = new AuthorizationCache();
  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  assertEquals(key, 'tenant-1:tool:test:hash123');
});

Deno.test('AuthorizationCache - set and get', async () => {
  const cache = new AuthorizationCache();
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 1000,
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  await cache.set(key, decision, 1000);

  const cached = await cache.get(key);
  assertExists(cached);
  assertEquals(cached.decision, 'allow');
  assertEquals(cached.decision_id, 'dec-1');
});

Deno.test('AuthorizationCache - expires after TTL', async () => {
  const cache = new AuthorizationCache();
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 100,
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  await cache.set(key, decision, 100);

  // Should exist immediately
  const cached1 = await cache.get(key);
  assertExists(cached1);

  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 150));

  // Should be expired
  const cached2 = await cache.get(key);
  assertEquals(cached2, null);
});

Deno.test('AuthorizationCache - only caches allow decisions', async () => {
  const cache = new AuthorizationCache();
  const denyDecision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'deny',
    reason: 'Denied',
    policy_version: '1.0.0',
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  await cache.set(key, denyDecision, 1000);

  // Deny decisions should not be cached
  const cached = await cache.get(key);
  assertEquals(cached, null);
});

Deno.test('AuthorizationCache - statistics', async () => {
  const cache = new AuthorizationCache();
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 1000,
  };

  const key1 = cache.generateKey('tenant-1', 'tool:test1', 'hash1');
  const key2 = cache.generateKey('tenant-1', 'tool:test2', 'hash2');

  await cache.set(key1, decision, 1000);
  await cache.set(key2, decision, 1000);

  const stats = cache.getStats();
  assertEquals(stats.size, 2);
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 0);

  // Hit
  await cache.get(key1);
  const stats2 = cache.getStats();
  assertEquals(stats2.hits, 1);

  // Miss
  await cache.get('nonexistent');
  const stats3 = cache.getStats();
  assertEquals(stats3.misses, 1);
});
