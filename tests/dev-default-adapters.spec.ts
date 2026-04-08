/**
 * Dev default adapters (TGA-192) — full DbAdapter surface, no throws on happy paths.
 */

import { describe, it, expect } from 'vitest';
import {
  DevDefaultDbAdapter,
  DevDefaultAuditAdapter,
  DevDefaultIdempotencyAdapter,
  DevDefaultRateLimitAdapter,
  DevDefaultCeilingsAdapter,
} from '../kernel/src/dev-default-adapters';

describe('DevDefaultDbAdapter', () => {
  it('supports transactions and in-memory IAM round-trip', async () => {
    const db = new DevDefaultDbAdapter();
    const tx = await db.beginTransaction();
    await tx.commit();

    const key = await db.createApiKey('t1', { scopes: ['manage.read'] });
    await expect(db.getTenantFromApiKey(key.id)).resolves.toBe('t1');
    await expect(db.listApiKeys('t1')).resolves.toHaveLength(1);

    await db.revokeApiKey('t1', key.id);
    await expect(db.listApiKeys('t1')).resolves.toHaveLength(0);
  });
});

describe('DevDefaultAuditAdapter', () => {
  it('logEvent and log are no-ops', async () => {
    const a = new DevDefaultAuditAdapter();
    await expect(
      a.logEvent({
        event_id: 'e1',
        event_version: 1,
        schema_version: 1,
        ts: Date.now(),
        tenant_id: 't',
        integration: 'i',
        pack: 'p',
        action: 'a',
        actor: { type: 'system', id: 's' },
        request_hash: 'h',
        status: 'success',
      }),
    ).resolves.toBeUndefined();
    await expect(
      a.log({
        tenantId: 't',
        actorType: 'system',
        actorId: 's',
        action: 'a',
        requestId: 'r',
        result: 'success',
        dryRun: false,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('DevDefaultIdempotencyAdapter', () => {
  it('stores and replays', async () => {
    const idem = new DevDefaultIdempotencyAdapter();
    await idem.storeReplay('t', 'act', 'k', { ok: true });
    await expect(idem.getReplay('t', 'act', 'k')).resolves.toEqual({ ok: true });
  });
});

describe('DevDefaultRateLimitAdapter', () => {
  it('allows until limit', async () => {
    const rl = new DevDefaultRateLimitAdapter();
    const r1 = await rl.check('k', 'a', 2);
    expect(r1.allowed).toBe(true);
    const r2 = await rl.check('k', 'a', 2);
    expect(r2.allowed).toBe(true);
    const r3 = await rl.check('k', 'a', 2);
    expect(r3.allowed).toBe(false);
  });
});

describe('DevDefaultCeilingsAdapter', () => {
  it('check resolves and getUsage is zero', async () => {
    const c = new DevDefaultCeilingsAdapter();
    await expect(c.check('x', {}, 't')).resolves.toBeUndefined();
    await expect(c.getUsage('cpu', 't')).resolves.toBe(0);
  });
});
