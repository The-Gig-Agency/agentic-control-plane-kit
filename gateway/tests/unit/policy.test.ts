/**
 * Unit tests for authorization flow and fail-closed behavior
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { authorizeAction } from '../../policy.ts';
import { AuthorizationCache } from '../../cache.ts';
import { AuthorizationError, NetworkError } from '../../errors.ts';
import type { ControlPlaneAdapter, AuthorizationResponse } from '../../../kernel/src/control-plane-adapter.ts';
import { Actor } from '../../types.ts';

// Mock ControlPlaneAdapter
class MockControlPlaneAdapter implements ControlPlaneAdapter {
  private responses: Map<string, AuthorizationResponse> = new Map();
  private shouldFail = false;
  private failError?: Error;

  setResponse(action: string, response: AuthorizationResponse): void {
    this.responses.set(action, response);
  }

  setShouldFail(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    this.failError = error;
  }

  async authorize(request: any): Promise<AuthorizationResponse> {
    if (this.shouldFail) {
      if (this.failError) {
        throw this.failError;
      }
      throw new NetworkError('Network error', undefined, true);
    }

    const response = this.responses.get(request.action);
    if (!response) {
      return {
        decision_id: 'dec-default',
        decision: 'deny',
        reason: 'No policy found',
        policy_version: '1.0.0',
      };
    }

    return response;
  }
}

Deno.test('authorizeAction - allows when decision is allow', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  controlPlane.setResponse('tool:test', {
    decision_id: 'dec-1',
    decision: 'allow',
    reason: 'Allowed',
    policy_version: '1.0.0',
    decision_ttl_ms: 1000,
  });

  const decision = await authorizeAction(
    'tool:test',
    { arg: 'value' },
    'tenant-1',
    actor,
    'test-kernel',
    controlPlane,
    cache
  );

  assertEquals(decision.decision, 'allow');
  assertEquals(decision.decision_id, 'dec-1');
});

Deno.test('authorizeAction - throws AuthorizationError on deny', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  controlPlane.setResponse('tool:test', {
    decision_id: 'dec-1',
    decision: 'deny',
    reason: 'Rate limit exceeded',
    policy_version: '1.0.0',
  });

  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    AuthorizationError,
    'Rate limit exceeded'
  );
});

Deno.test('authorizeAction - throws AuthorizationError on require_approval', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  controlPlane.setResponse('tool:test', {
    decision_id: 'dec-1',
    decision: 'require_approval',
    reason: 'Requires approval',
    policy_version: '1.0.0',
  });

  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    AuthorizationError,
    'Requires approval'
  );
});

Deno.test('authorizeAction - fail-closed on network error', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  controlPlane.setShouldFail(true, new NetworkError('Connection refused', undefined, true));

  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    NetworkError,
    'Connection refused'
  );
});

Deno.test('authorizeAction - fail-closed on timeout', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  // Simulate timeout by making authorize hang
  const originalAuthorize = controlPlane.authorize.bind(controlPlane);
  controlPlane.authorize = async () => {
    await new Promise(resolve => setTimeout(resolve, 6000)); // Exceeds 5s timeout
    return { decision_id: 'dec-1', decision: 'allow', policy_version: '1.0.0' };
  };

  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    Error // TimeoutError wrapped
  );
});

Deno.test('authorizeAction - uses cache for allow decisions', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  let callCount = 0;
  controlPlane.authorize = async () => {
    callCount++;
    return {
      decision_id: 'dec-1',
      decision: 'allow',
      reason: 'Allowed',
      policy_version: '1.0.0',
      decision_ttl_ms: 1000,
    };
  };

  // First call - should hit control plane
  const decision1 = await authorizeAction(
    'tool:test',
    { arg: 'value' },
    'tenant-1',
    actor,
    'test-kernel',
    controlPlane,
    cache
  );
  assertEquals(callCount, 1);
  assertEquals(decision1.decision, 'allow');

  // Second call - should use cache
  const decision2 = await authorizeAction(
    'tool:test',
    { arg: 'value' },
    'tenant-1',
    actor,
    'test-kernel',
    controlPlane,
    cache
  );
  assertEquals(callCount, 1); // Should still be 1 (cache hit)
  assertEquals(decision2.decision, 'allow');
});

Deno.test('authorizeAction - does not cache deny decisions', async () => {
  const controlPlane = new MockControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  let callCount = 0;
  controlPlane.authorize = async () => {
    callCount++;
    return {
      decision_id: 'dec-1',
      decision: 'deny',
      reason: 'Denied',
      policy_version: '1.0.0',
    };
  };

  // First call - should hit control plane
  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    AuthorizationError
  );
  assertEquals(callCount, 1);

  // Second call - should hit control plane again (not cached)
  await assertRejects(
    async () => {
      await authorizeAction(
        'tool:test',
        { arg: 'value' },
        'tenant-1',
        actor,
        'test-kernel',
        controlPlane,
        cache
      );
    },
    AuthorizationError
  );
  assertEquals(callCount, 2); // Should be 2 (no cache)
});
