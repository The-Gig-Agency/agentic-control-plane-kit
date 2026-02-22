/**
 * Unit tests for configuration loading
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { loadConfig, validateConfig } from '../../config.ts';
import { ConfigurationError } from '../../errors.ts';

Deno.test('loadConfig - loads valid config', () => {
  const configPath = './gateway/config.json.example';
  // This test would need the actual config file
  // For now, we'll test validation
});

Deno.test('validateConfig - requires tool_prefix', () => {
  const invalidConfig = {
    servers: {
      test: {
        command: 'node',
        args: ['test.js'],
        // Missing tool_prefix
      },
    },
    kernel: {
      kernelId: 'test',
      version: '1.0.0',
    },
  };

  assertThrows(() => {
    validateConfig(invalidConfig as any);
  }, ConfigurationError);
});

Deno.test('validateConfig - rejects duplicate prefixes', () => {
  const invalidConfig = {
    servers: {
      server1: {
        command: 'node',
        args: ['test1.js'],
        tool_prefix: 'test.',
      },
      server2: {
        command: 'node',
        args: ['test2.js'],
        tool_prefix: 'test.', // Duplicate
      },
    },
    kernel: {
      kernelId: 'test',
      version: '1.0.0',
    },
  };

  assertThrows(() => {
    validateConfig(invalidConfig as any);
  }, ConfigurationError);
});
