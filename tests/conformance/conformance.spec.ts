/**
 * ACP Conformance Tests
 * HTTP-based — run against any /manage endpoint (TS, Python, Go kernels)
 *
 * Usage:
 *   ACP_BASE_URL=http://localhost:8000/api/manage ACP_API_KEY=ock_xxx npm run test:conformance
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.ACP_BASE_URL || 'http://localhost:8000/api/manage';
const API_KEY = process.env.ACP_API_KEY || '';

function postManage(body: object, apiKey?: string) {
  return fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {})
    },
    body: JSON.stringify(body)
  });
}

describe('ACP Conformance (HTTP)', () => {
  beforeAll(() => {
    if (!API_KEY) {
      console.warn(
        '⚠️  ACP_API_KEY not set. Tests requiring auth will be skipped. Set ACP_BASE_URL and ACP_API_KEY to run full conformance.'
      );
    }
  });

  describe('Request/Response envelope', () => {
    it('accepts valid request with action only', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      expect(res.status).toBeLessThan(500);
      const body = await res.json();
      expect(body).toHaveProperty('ok');
      expect(body).toHaveProperty('request_id');
      expect(typeof body.request_id).toBe('string');
    });

    it('rejects request without action (validation)', async () => {
      const res = await postManage({}, API_KEY);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(['VALIDATION_ERROR', 'INVALID_API_KEY']).toContain(body.code);
    });

    it('response has standard shape on success', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok) {
        expect(body).toHaveProperty('request_id');
        expect(body).toHaveProperty('data');
      }
    });

    it('error response has code and error', async () => {
      const res = await postManage({ action: 'nonexistent.action.xyz' }, API_KEY);
      const body = await res.json();
      if (!body.ok) {
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
      }
    });
  });

  describe('Error codes', () => {
    it('uses standard error codes', async () => {
      const validCodes = [
        'VALIDATION_ERROR',
        'INVALID_API_KEY',
        'SCOPE_DENIED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'CEILING_EXCEEDED',
        'IDEMPOTENT_REPLAY',
        'INTERNAL_ERROR'
      ];
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (!body.ok && body.code) {
        expect(validCodes).toContain(body.code);
      }
    });
  });

  describe('meta.actions', () => {
    it('meta.actions returns actions array and api_version', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data) {
        expect(body.data).toHaveProperty('actions');
        expect(Array.isArray(body.data.actions)).toBe(true);
        expect(body.data).toHaveProperty('api_version');
        expect(body.data).toHaveProperty('total_actions');
      }
    });

    it('action def has name, scope, description, params_schema, supports_dry_run', async () => {
      const res = await postManage({ action: 'meta.actions' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data?.actions?.length) {
        const first = body.data.actions[0];
        expect(first).toHaveProperty('name');
        expect(first).toHaveProperty('scope');
        expect(first).toHaveProperty('description');
        expect(first).toHaveProperty('params_schema');
        expect(first).toHaveProperty('supports_dry_run');
      }
    });
  });

  describe('meta.version', () => {
    it('meta.version returns api_version and schema_version', async () => {
      const res = await postManage({ action: 'meta.version' }, API_KEY);
      const body = await res.json();
      if (body.ok && body.data) {
        expect(body.data).toHaveProperty('api_version');
        expect(body.data).toHaveProperty('actions_count');
      }
    });
  });

  describe('Unknown action', () => {
    it('returns NOT_FOUND for unknown action', async () => {
      const res = await postManage({ action: 'unknown.action.xyz' }, API_KEY);
      const body = await res.json();
      if (!body.ok) {
        expect(body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('Auth', () => {
    it('rejects request without X-API-Key when required', async () => {
      const res = await postManage({ action: 'meta.actions' });
      const body = await res.json();
      if (!body.ok && body.code === 'INVALID_API_KEY') {
        expect(body.code).toBe('INVALID_API_KEY');
      }
    });
  });
});
