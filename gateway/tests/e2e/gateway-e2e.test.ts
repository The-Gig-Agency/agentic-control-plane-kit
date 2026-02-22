/**
 * End-to-End Test: Filesystem MCP + Gateway
 * 
 * Tests:
 * - Block path (deny authorization)
 * - Allow path (allow authorization)
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { MCPProxy } from '../../proxy.ts';
import { ProcessManager } from '../../process-manager.ts';
import { AuthorizationCache } from '../../cache.ts';
import { Actor } from '../../types.ts';
import type { GatewayConfig } from '../../config.ts';
import type { ControlPlaneAdapter, AuthorizationResponse } from '../../../kernel/src/control-plane-adapter.ts';
import { AuthorizationError } from '../../errors.ts';

// Mock ControlPlaneAdapter with configurable responses
class TestControlPlaneAdapter implements ControlPlaneAdapter {
  private allowActions: Set<string> = new Set();
  private denyActions: Set<string> = new Set();

  allowAction(action: string): void {
    this.allowActions.add(action);
    this.denyActions.delete(action);
  }

  denyAction(action: string): void {
    this.denyActions.add(action);
    this.allowActions.delete(action);
  }

  async authorize(request: any): Promise<AuthorizationResponse> {
    if (this.denyActions.has(request.action)) {
      return {
        decision_id: 'dec-deny',
        decision: 'deny',
        reason: 'Policy denied',
        policy_version: '1.0.0',
      };
    }

    if (this.allowActions.has(request.action)) {
      return {
        decision_id: 'dec-allow',
        decision: 'allow',
        reason: 'Allowed',
        policy_version: '1.0.0',
        decision_ttl_ms: 1000,
      };
    }

    // Default: deny
    return {
      decision_id: 'dec-default-deny',
      decision: 'deny',
      reason: 'No policy found',
      policy_version: '1.0.0',
    };
  }
}

Deno.test('E2E - Gateway blocks unauthorized tool call', async () => {
  // Setup
  const config: GatewayConfig = {
    servers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        tool_prefix: 'fs.',
      },
    },
    kernel: {
      kernelId: 'test-gateway',
      version: '1.0.0',
    },
  };

  const processManager = new ProcessManager();
  const controlPlane = new TestControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  // Deny fs.read_file
  controlPlane.denyAction('tool:fs.read_file');

  const proxy = new MCPProxy(
    config,
    processManager,
    controlPlane,
    cache,
    'test-gateway',
    'https://test.com',
    'test-key'
  );

  try {
    // Spawn filesystem MCP server
    await processManager.spawnServer('filesystem', config.servers.filesystem);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server to start

    // Attempt tool call - should be denied
    await assertRejects(
      async () => {
        await proxy.handleRequest(
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'fs.read_file',
              arguments: { path: '/tmp/test.txt' },
            },
          },
          'tenant-1',
          actor
        );
      },
      AuthorizationError,
      'Policy denied'
    );
  } finally {
    // Cleanup
    try {
      await processManager.stopServer('filesystem');
    } catch {}
  }
});

Deno.test('E2E - Gateway allows authorized tool call', async () => {
  // Setup
  const config: GatewayConfig = {
    servers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        tool_prefix: 'fs.',
      },
    },
    kernel: {
      kernelId: 'test-gateway',
      version: '1.0.0',
    },
  };

  const processManager = new ProcessManager();
  const controlPlane = new TestControlPlaneAdapter();
  const cache = new AuthorizationCache();
  const actor: Actor = { type: 'system', id: 'test' };

  // Allow fs.read_file
  controlPlane.allowAction('tool:fs.read_file');

  const proxy = new MCPProxy(
    config,
    processManager,
    controlPlane,
    cache,
    'test-gateway',
    'https://test.com',
    'test-key'
  );

  try {
    // Spawn filesystem MCP server
    await processManager.spawnServer('filesystem', config.servers.filesystem);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server to start

    // Make tool call - should succeed
    const response = await proxy.handleRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fs.read_file',
          arguments: { path: '/tmp' }, // Read directory (safer than file)
        },
      },
      'tenant-1',
      actor
    );

    // Should have result (even if file doesn't exist, we get a response)
    assertEquals(response.jsonrpc, '2.0');
    assertEquals(response.id, 1);
    // Result may be error from MCP server (file not found), but that's OK
    // Important: we got past authorization
  } finally {
    // Cleanup
    try {
      await processManager.stopServer('filesystem');
    } catch {}
  }
});
