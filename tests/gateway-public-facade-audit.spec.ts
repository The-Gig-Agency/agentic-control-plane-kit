/**
 * Public audit row → facade mapping (Vitest; gateway code is plain TS).
 */

import { describe, it, expect } from 'vitest';
import { buildPublicAuditResponseFromRows } from '../gateway/public-facade.ts';

describe('buildPublicAuditResponseFromRows', () => {
  it('maps basic fields', () => {
    const resp = buildPublicAuditResponseFromRows({
      project: 'my-app',
      env: 'production',
      rows: [
        {
          audit_id: 'aud_1',
          created_at: '2026-04-07T00:00:00.000Z',
          action: 'shopify.products.update',
          actor_id: 'user_123',
          decision: 'allow',
          execution_status: 'completed',
        },
      ],
    });

    expect(resp.entries.length).toBe(1);
    expect(resp.entries[0].audit_id).toBe('aud_1');
    expect(resp.entries[0].project).toBe('my-app');
    expect(resp.entries[0].env).toBe('production');
    expect(resp.entries[0].connector).toBe('shopify');
    expect(resp.entries[0].action).toBe('shopify.products.update');
    expect(resp.entries[0].actor_id).toBe('user_123');
    expect(resp.entries[0].created_at).toBe('2026-04-07T00:00:00.000Z');
  });

  it('throws on missing required fields', () => {
    expect(() =>
      buildPublicAuditResponseFromRows({
        project: 'my-app',
        env: 'production',
        rows: [
          {
            created_at: '2026-04-07T00:00:00.000Z',
            action: 'shopify.products.update',
          },
        ],
      }),
    ).toThrow();
  });
});
