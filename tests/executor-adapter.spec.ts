/**
 * Executor adapter tests - CiaExecutorAdapter and parseEndpointToCiaFormat
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEndpointToCiaFormat, CiaExecutorAdapter } from '../kernel/src/executor-adapter';

describe('parseEndpointToCiaFormat', () => {
  it('parses shopify endpoint', () => {
    const result = parseEndpointToCiaFormat('/api/tenants/{tenantId}/shopify/products.list');
    expect(result).toEqual({ integration: 'shopify', action: 'shopify.products.list' });
  });

  it('parses shopify endpoint with actual tenantId', () => {
    const result = parseEndpointToCiaFormat('/api/tenants/tenant-123/shopify/products.create');
    expect(result).toEqual({ integration: 'shopify', action: 'shopify.products.create' });
  });

  it('parses ciq endpoint', () => {
    const result = parseEndpointToCiaFormat('/api/tenants/{tenantId}/ciq/campaigns.list');
    expect(result).toEqual({ integration: 'ciq', action: 'ciq.campaigns.list' });
  });

  it('parses leadscore endpoint', () => {
    const result = parseEndpointToCiaFormat('/api/tenants/{tenantId}/leadscore/something.action');
    expect(result).toEqual({ integration: 'leadscore', action: 'leadscore.something.action' });
  });

  it('throws on invalid format', () => {
    expect(() => parseEndpointToCiaFormat('/wrong/path')).toThrow('Invalid executor endpoint format');
    expect(() => parseEndpointToCiaFormat('/api/tenants/')).toThrow('Invalid executor endpoint format');
  });
});

describe('CiaExecutorAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('POSTs to /functions/v1/execute with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { products: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CiaExecutorAdapter({
      ciaUrl: 'https://cia.example.com',
      ciaServiceKey: 'cia_service_xxx',
      ciaAnonKey: 'anon_xxx',
    });

    await adapter.execute(
      '/api/tenants/{tenantId}/shopify/products.list',
      { first: 10 },
      'tenant-123'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cia.example.com/functions/v1/execute');
    expect(opts.method).toBe('POST');
    expect(opts.headers['apikey']).toBe('anon_xxx');
    expect(opts.headers['Authorization']).toBe('Bearer cia_service_xxx');
    const body = JSON.parse(opts.body);
    expect(body.tenant_id).toBe('tenant-123');
    expect(body.integration).toBe('shopify');
    expect(body.action).toBe('shopify.products.list');
    expect(body.params).toEqual({ first: 10 });
    expect(typeof body.request_hash).toBe('string');
    expect(body.request_hash.length).toBe(64); // SHA-256 hex
  });

  it('strips trailing slash from ciaUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CiaExecutorAdapter({
      ciaUrl: 'https://cia.example.com/',
      ciaServiceKey: 'key',
      ciaAnonKey: 'anon',
    });

    await adapter.execute('/api/tenants/{tenantId}/shopify/products.list', {}, 't1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://cia.example.com/functions/v1/execute');
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error_message_redacted: 'Invalid service key' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CiaExecutorAdapter({
      ciaUrl: 'https://cia.example.com',
      ciaServiceKey: 'bad',
      ciaAnonKey: 'anon',
    });

    await expect(
      adapter.execute('/api/tenants/{tenantId}/shopify/products.list', {}, 't1')
    ).rejects.toThrow('Invalid service key');
  });

  it('throws when result.ok is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error_message_redacted: 'Action not allowed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CiaExecutorAdapter({
      ciaUrl: 'https://cia.example.com',
      ciaServiceKey: 'key',
      ciaAnonKey: 'anon',
    });

    await expect(
      adapter.execute('/api/tenants/{tenantId}/shopify/products.create', {}, 't1')
    ).rejects.toThrow('Action not allowed');
  });
});
