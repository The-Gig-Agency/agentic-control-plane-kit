/**
 * Audit Layer Validation Tests
 * 
 * These tests prove the audit layer is actually safe and deterministic.
 */

import { sanitize, canonicalJson, redactString } from '../../kernel/src/sanitize';
import { hashPayload } from '../../kernel/src/audit';
import { emitAuditEvent, extractPack, AuditEventContext } from '../../kernel/src/audit-event';
import { AuditAdapter, AuditEvent } from '../../kernel/src/types';

describe('Audit Layer Security Validation', () => {
  describe('1. Secrets Cannot Leak', () => {
    it('should redact sensitive fields in sanitize()', () => {
      const payload = {
        action: 'test.action',
        params: {
          name: 'Test',
          api_key: 'secret_key_123456789',
          authorization: 'Bearer token_abc123',
          access_token: 'token_xyz789',
          client_secret: 'secret_456',
          safe_field: 'not_secret'
        }
      };

      const sanitized = sanitize(payload);

      // Sensitive fields should be redacted
      expect(sanitized.params.api_key).toBe('[REDACTED]');
      expect(sanitized.params.authorization).toBe('[REDACTED]');
      expect(sanitized.params.access_token).toBe('[REDACTED]');
      expect(sanitized.params.client_secret).toBe('[REDACTED]');

      // Safe fields should remain
      expect(sanitized.params.name).toBe('Test');
      expect(sanitized.params.safe_field).toBe('not_secret');

      // No raw secrets in stringified output
      const str = JSON.stringify(sanitized);
      expect(str).not.toContain('secret_key_123456789');
      expect(str).not.toContain('token_abc123');
      expect(str).not.toContain('token_xyz789');
      expect(str).not.toContain('secret_456');
    });

    it('should redact secrets in error messages', () => {
      const errorMsg = 'Error: api_key=secret_123, token=abc456, authorization=Bearer xyz789';
      const redacted = redactString(errorMsg);

      expect(redacted).not.toContain('secret_123');
      expect(redacted).not.toContain('abc456');
      expect(redacted).not.toContain('xyz789');
      expect(redacted).toContain('[REDACTED]');
    });

    it('should not persist request_payload in audit event', async () => {
      const capturedEvents: AuditEvent[] = [];
      const mockAdapter: AuditAdapter = {
        async logEvent(event: AuditEvent) {
          capturedEvents.push(event);
        },
        async log() {
          // Legacy shim
        }
      };

      const req = {
        action: 'test.action',
        params: { api_key: 'secret_123', data: 'test' }
      };

      await emitAuditEvent(mockAdapter, {
        tenant_id: 'tenant1',
        integration: 'test',
        actor: { type: 'api_key', id: 'test' },
        action: 'test.action',
        request_payload: req,
        status: 'success',
      });

      const event = capturedEvents[0];
      
      // request_payload should NOT be in event
      expect((event as any).request_payload).toBeUndefined();
      
      // Only hash should be present
      expect(event.request_hash).toBeDefined();
      expect(typeof event.request_hash).toBe('string');
      expect(event.request_hash.length).toBe(64); // SHA-256 hex
    });
  });

  describe('2. Event Structure Validation', () => {
    it('should emit correct event structure', async () => {
      const capturedEvents: AuditEvent[] = [];
      const mockAdapter: AuditAdapter = {
        async logEvent(event: AuditEvent) {
          capturedEvents.push(event);
        },
        async log() {}
      };

      const startTime = Date.now();
      await emitAuditEvent(mockAdapter, {
        tenant_id: 'tenant_abc',
        integration: 'ciq-automations',
        actor: {
          type: 'api_key',
          id: 'ciq_test1234',
          api_key_id: 'key_uuid_123',
        },
        action: 'domain.publishers.create',
        request_payload: {
          action: 'domain.publishers.create',
          params: { name: 'Test Publisher' }
        },
        status: 'success',
        start_time: startTime,
      }, {
        result_meta: {
          resource_type: 'publisher',
          resource_id: 'pub_456',
        },
      });

      const event = capturedEvents[0];

      // Required fields
      expect(event.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(event.event_version).toBe(1);
      expect(event.ts).toBeGreaterThan(0);
      expect(event.tenant_id).toBe('tenant_abc');
      expect(event.integration).toBe('ciq-automations');
      expect(event.pack).toBe('domain'); // Auto-derived
      expect(event.action).toBe('domain.publishers.create');
      expect(event.actor.type).toBe('api_key');
      expect(event.actor.id).toBe('ciq_test1234');
      expect(event.actor.api_key_id).toBe('key_uuid_123');
      expect(event.request_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      expect(event.status).toBe('success');

      // Optional fields
      expect(event.result_meta?.resource_type).toBe('publisher');
      expect(event.result_meta?.resource_id).toBe('pub_456');
      expect(event.latency_ms).toBeGreaterThanOrEqual(0);

      // Should NOT have
      expect((event as any).request_payload).toBeUndefined();
      expect((event as any).headers).toBeUndefined();
      expect((event as any).api_key).toBeUndefined();
    });
  });

  describe('3. Determinism Validation', () => {
    it('should produce identical hashes for identical inputs', async () => {
      const payload1 = {
        action: 'test.action',
        params: { a: 1, b: 2, c: 3 }
      };

      const payload2 = {
        action: 'test.action',
        params: { c: 3, b: 2, a: 1 } // Different key order
      };

      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);

      // Should be identical (canonical JSON handles key order)
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const payload1 = {
        action: 'test.action',
        params: { a: 1, b: 2 }
      };

      const payload2 = {
        action: 'test.action',
        params: { a: 1, b: 3 } // Different value
      };

      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);

      // Should be different
      expect(hash1).not.toBe(hash2);
    });

    it('should produce stable hashes across multiple calls', async () => {
      const payload = {
        action: 'test.action',
        params: { name: 'Test', count: 42 }
      };

      const hash1 = await hashPayload(payload);
      const hash2 = await hashPayload(payload);
      const hash3 = await hashPayload(payload);

      // All should be identical
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should handle nested objects deterministically', async () => {
      const payload1 = {
        action: 'test.action',
        params: {
          config: { a: 1, b: 2 },
          data: { x: 10, y: 20 }
        }
      };

      const payload2 = {
        action: 'test.action',
        params: {
          data: { y: 20, x: 10 }, // Different order
          config: { b: 2, a: 1 }  // Different order
        }
      };

      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);

      // Should be identical (canonical JSON sorts keys recursively)
      expect(hash1).toBe(hash2);
    });

    it('should sanitize before hashing (secrets don\'t affect hash)', async () => {
      const payload1 = {
        action: 'test.action',
        params: { name: 'Test', api_key: 'secret_123' }
      };

      const payload2 = {
        action: 'test.action',
        params: { name: 'Test', api_key: 'secret_456' } // Different secret
      };

      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);

      // Should be identical (secrets are redacted before hashing)
      expect(hash1).toBe(hash2);
    });

    it('should keep business parameters (hash remains useful)', async () => {
      // Different business parameters should produce different hashes
      const payload1 = {
        action: 'domain.publishers.create',
        params: { name: 'Publisher A', type: 'influencer' }
      };

      const payload2 = {
        action: 'domain.publishers.create',
        params: { name: 'Publisher B', type: 'influencer' } // Different name
      };

      const payload3 = {
        action: 'domain.publishers.create',
        params: { name: 'Publisher A', type: 'brand' } // Different type
      };

      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);
      const hash3 = await hashPayload(payload3);

      // Business parameters should create different hashes
      expect(hash1).not.toBe(hash2); // Different name
      expect(hash1).not.toBe(hash3); // Different type
      expect(hash2).not.toBe(hash3); // Both different
    });

    it('should handle runtime edge cases deterministically', async () => {
      // Test floats (1 vs 1.0)
      const payload1 = { action: 'test', params: { count: 1 } };
      const payload2 = { action: 'test', params: { count: 1.0 } };
      const hash1 = await hashPayload(payload1);
      const hash2 = await hashPayload(payload2);
      // JSON.stringify normalizes 1.0 to 1, so should be same
      expect(hash1).toBe(hash2);

      // Test dates (should be ISO strings)
      const date1 = new Date('2024-01-01T00:00:00Z');
      const date2 = new Date('2024-01-01T00:00:00Z');
      const payload3 = { action: 'test', params: { created_at: date1 } };
      const payload4 = { action: 'test', params: { created_at: date2 } };
      const hash3 = await hashPayload(payload3);
      const hash4 = await hashPayload(payload4);
      expect(hash3).toBe(hash4);

      // Test undefined (should be omitted)
      const payload5 = { action: 'test', params: { a: 1, b: undefined } };
      const payload6 = { action: 'test', params: { a: 1 } }; // b omitted
      const hash5 = await hashPayload(payload5);
      const hash6 = await hashPayload(payload6);
      expect(hash5).toBe(hash6); // undefined should be omitted

      // Test null (should be preserved)
      const payload7 = { action: 'test', params: { a: 1, b: null } };
      const payload8 = { action: 'test', params: { a: 1, b: null } };
      const hash7 = await hashPayload(payload7);
      const hash8 = await hashPayload(payload8);
      expect(hash7).toBe(hash8);
    });
  });

  describe('4. Pack Extraction', () => {
    it('should extract pack from action name', () => {
      expect(extractPack('domain.publishers.create')).toBe('domain');
      expect(extractPack('iam.keys.list')).toBe('iam');
      expect(extractPack('webhooks.create')).toBe('webhooks');
      expect(extractPack('settings.update')).toBe('settings');
      expect(extractPack('unknown')).toBe('unknown');
    });
  });

  describe('5. Error Handling', () => {
    it('should not throw if adapter.logEvent() fails', async () => {
      const failingAdapter = {
        logEvent: async () => {
          throw new Error('Database connection failed');
        },
        log: async () => {} // Legacy method
      };

      const ctx: AuditEventContext = {
        tenant_id: 'tenant_123',
        integration: 'test-integration',
        actor: {
          type: 'api_key',
          id: 'test_key_123',
        },
        action: 'test.action',
        request_payload: { test: 'data' },
        status: 'success',
      };

      // Should not throw - audit failures should not break requests
      await expect(
        emitAuditEvent(failingAdapter, ctx, {})
      ).resolves.not.toThrow();
    });

    it('should handle adapter errors gracefully', async () => {
      let consoleErrorCalled = false;
      const originalError = console.error;
      console.error = (...args: any[]) => {
        consoleErrorCalled = true;
        originalError(...args);
      };

      const failingAdapter = {
        logEvent: async () => {
          throw new Error('Network timeout');
        },
        log: async () => {}
      };

      const ctx: AuditEventContext = {
        tenant_id: 'tenant_123',
        integration: 'test-integration',
        actor: {
          type: 'api_key',
          id: 'test_key_123',
        },
        action: 'test.action',
        request_payload: { test: 'data' },
        status: 'success',
      };

      await emitAuditEvent(failingAdapter, ctx, {});

      // Error should be logged but not thrown
      expect(consoleErrorCalled).toBe(true);

      // Restore console.error
      console.error = originalError;
    });
  });
});
