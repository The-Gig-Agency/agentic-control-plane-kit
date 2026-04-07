import { describe, expect, it, vi } from 'vitest';
import { approve } from '../installer/approve.js';

describe('approve', () => {
  it('returns helpful error when not configured', async () => {
    delete process.env.ACP_BASE_URL;
    delete process.env.GOVERNANCE_HUB_URL;
    delete process.env.ACP_KERNEL_KEY;
    const res = await approve({ approvalId: 'app_123' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('ACP_BASE_URL');
  });

  it('posts to default approval endpoint and returns ok', async () => {
    process.env.ACP_BASE_URL = 'https://example.supabase.co/functions/v1';
    process.env.ACP_KERNEL_KEY = 'secret';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: 'approved', approval_id: 'app_123' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await approve({ approvalId: 'app_123' });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/functions/v1/approval-approve');
    expect(init.headers.Authorization).toContain('Bearer');
  });

  it('fails closed on malformed 200 response', async () => {
    process.env.ACP_BASE_URL = 'https://example.supabase.co/functions/v1';
    process.env.ACP_KERNEL_KEY = 'secret';

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await approve({ approvalId: 'app_123' });
    expect(res.ok).toBe(false);
  });
});

