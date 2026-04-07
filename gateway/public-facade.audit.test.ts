import { buildPublicAuditResponseFromRows } from './public-facade.ts';
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.test('buildPublicAuditResponseFromRows maps basic fields', () => {
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

  assertEquals(resp.entries.length, 1);
  assertEquals(resp.entries[0].audit_id, 'aud_1');
  assertEquals(resp.entries[0].project, 'my-app');
  assertEquals(resp.entries[0].env, 'production');
  assertEquals(resp.entries[0].connector, 'shopify');
  assertEquals(resp.entries[0].action, 'shopify.products.update');
  assertEquals(resp.entries[0].actor_id, 'user_123');
  assertEquals(resp.entries[0].created_at, '2026-04-07T00:00:00.000Z');
});

Deno.test('buildPublicAuditResponseFromRows throws on missing required fields', () => {
  let threw = false;
  try {
    buildPublicAuditResponseFromRows({
      project: 'my-app',
      env: 'production',
      rows: [
        {
          // missing audit_id, actor_id, decision, execution_status
          created_at: '2026-04-07T00:00:00.000Z',
          action: 'shopify.products.update',
        },
      ],
    });
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

