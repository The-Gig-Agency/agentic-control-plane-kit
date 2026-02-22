/**
 * Unit tests for TTL cache behavior
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { AuthorizationCache } from '../../cache.ts';
import type { AuthorizationResponse } from '../../../kernel/src/control-plane-adapter.ts';

Deno.test('Cache - respects TTL and expires entries', async () => {
  const cache = new AuthorizationCache();
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 100, // 100ms TTL
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  
  // Set cache entry
  await cache.set(key, decision, 100);

  // Should exist immediately
  const cached1 = await cache.get(key);
  assertEquals(cached1?.decision, 'allow');

  // Wait for expiration (100ms + buffer)
  await new Promise(resolve => setTimeout(resolve, 150));

  // Should be expired
  const cached2 = await cache.get(key);
  assertEquals(cached2, null);
});

Deno.test('Cache - different TTLs work independently', async () => {
  const cache = new AuthorizationCache();
  
  const decision1: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 50,
  };

  const decision2: AuthorizationResponse = {
    decision_id: 'dec-2',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 200,
  };

  const key1 = cache.generateKey('tenant-1', 'tool:test1', 'hash1');
  const key2 = cache.generateKey('tenant-1', 'tool:test2', 'hash2');

  await cache.set(key1, decision1, 50);
  await cache.set(key2, decision2, 200);

  // Both should exist
  assertEquals((await cache.get(key1))?.decision, 'allow');
  assertEquals((await cache.get(key2))?.decision, 'allow');

  // Wait for first to expire
  await new Promise(resolve => setTimeout(resolve, 100));

  // First should be expired, second should still exist
  assertEquals(await cache.get(key1), null);
  assertEquals((await cache.get(key2))?.decision, 'allow');

  // Wait for second to expire
  await new Promise(resolve => setTimeout(resolve, 150));

  // Both should be expired
  assertEquals(await cache.get(key1), null);
  assertEquals(await cache.get(key2), null);
});

Deno.test('Cache - uses decision_ttl_ms when provided', async () => {
  const cache = new AuthorizationCache();
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 100, // TTL from decision
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  
  // Set with explicit TTL, but decision also has TTL
  await cache.set(key, decision, 1000); // Explicit TTL (should use decision_ttl_ms instead)

  // Should exist
  const cached1 = await cache.get(key);
  assertEquals(cached1?.decision, 'allow');

  // Wait for decision TTL
  await new Promise(resolve => setTimeout(resolve, 150));

  // Should be expired (used decision_ttl_ms, not explicit TTL)
  const cached2 = await cache.get(key);
  assertEquals(cached2, null);
});

Deno.test('Cache - cleanup removes expired entries', async () => {
  const cache = new AuthorizationCache();
  
  const decision: AuthorizationResponse = {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 50,
  };

  const key = cache.generateKey('tenant-1', 'tool:test', 'hash123');
  await cache.set(key, decision, 50);

  // Should exist
  assertEquals((await cache.get(key))?.decision, 'allow');

  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 100));

  // Should be expired
  assertEquals(await cache.get(key), null);

  // Cache size should reflect cleanup
  const stats = cache.getStats();
  assertEquals(stats.size, 0); // Expired entries removed
});
