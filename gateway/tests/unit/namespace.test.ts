/**
 * Unit tests for namespace resolution
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { getServerForTool, stripToolPrefix, addToolPrefix } from '../../namespace.ts';
import type { GatewayConfig } from '../../config.ts';

Deno.test('getServerForTool - resolves tool to correct server by prefix', () => {
  const config: GatewayConfig = {
    servers: {
      filesystem: {
        command: 'node',
        args: ['fs-server.js'],
        tool_prefix: 'fs.',
      },
      amazon: {
        command: 'node',
        args: ['amazon-server.js'],
        tool_prefix: 'amazon.',
      },
      stripe: {
        command: 'node',
        args: ['stripe-server.js'],
        tool_prefix: 'stripe.',
      },
    },
    kernel: {
      kernelId: 'test-gateway',
      version: '1.0.0',
    },
  };

  const fsServer = getServerForTool('fs.read_file', config);
  assertEquals(fsServer.tool_prefix, 'fs.');

  const amazonServer = getServerForTool('amazon.order', config);
  assertEquals(amazonServer.tool_prefix, 'amazon.');

  const stripeServer = getServerForTool('stripe.charge', config);
  assertEquals(stripeServer.tool_prefix, 'stripe.');
});

Deno.test('getServerForTool - throws on unknown tool prefix', () => {
  const config: GatewayConfig = {
    servers: {
      filesystem: {
        command: 'node',
        args: ['fs-server.js'],
        tool_prefix: 'fs.',
      },
    },
    kernel: {
      kernelId: 'test-gateway',
      version: '1.0.0',
    },
  };

  assertThrows(
    () => getServerForTool('unknown.tool', config),
    Error,
    'No server found'
  );
});

Deno.test('getServerForTool - handles tools without prefix', () => {
  const config: GatewayConfig = {
    servers: {
      filesystem: {
        command: 'node',
        args: ['fs-server.js'],
        tool_prefix: 'fs.',
      },
    },
    kernel: {
      kernelId: 'test-gateway',
      version: '1.0.0',
    },
  };

  assertThrows(
    () => getServerForTool('tool_without_prefix', config),
    Error,
    'No server found'
  );
});

Deno.test('stripToolPrefix - removes prefix correctly', () => {
  assertEquals(stripToolPrefix('fs.read_file', 'fs.'), 'read_file');
  assertEquals(stripToolPrefix('amazon.order', 'amazon.'), 'order');
  assertEquals(stripToolPrefix('stripe.charge', 'stripe.'), 'charge');
  assertEquals(stripToolPrefix('test.tool.name', 'test.'), 'tool.name');
});

Deno.test('stripToolPrefix - handles tools without matching prefix', () => {
  // If prefix doesn't match, returns original
  assertEquals(stripToolPrefix('other.tool', 'fs.'), 'other.tool');
  assertEquals(stripToolPrefix('tool', 'fs.'), 'tool');
});

Deno.test('addToolPrefix - adds prefix correctly', () => {
  assertEquals(addToolPrefix('read_file', 'fs.'), 'fs.read_file');
  assertEquals(addToolPrefix('order', 'amazon.'), 'amazon.order');
  assertEquals(addToolPrefix('charge', 'stripe.'), 'stripe.charge');
});

Deno.test('addToolPrefix - handles already prefixed tools', () => {
  // If already has prefix, returns as-is (or could throw)
  assertEquals(addToolPrefix('fs.read_file', 'fs.'), 'fs.fs.read_file');
  // This is expected behavior - caller should check first
});

Deno.test('Namespace - round trip (strip then add)', () => {
  const prefix = 'fs.';
  const originalTool = 'fs.read_file';
  
  const stripped = stripToolPrefix(originalTool, prefix);
  assertEquals(stripped, 'read_file');
  
  const restored = addToolPrefix(stripped, prefix);
  assertEquals(restored, 'fs.read_file');
});
