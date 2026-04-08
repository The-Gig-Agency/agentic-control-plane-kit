import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HostedOrchestrationError,
  hostedLoginPoll,
  hostedLoginStart,
  hostedLinkProject,
  hostedSelectEnvironment,
} from './hosted-orchestration.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ECHELON_ORCHESTRATOR_BASE_URL;
});

describe('hosted-orchestration response validation', () => {
  it('throws invalid_response when login start payload is missing required fields', async () => {
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ poll_id: 'poll_1' }), { status: 200 })) as any,
    );

    await expect(
      hostedLoginStart({ project_name: 'acme', env: 'development', framework: 'express' as any }),
    ).rejects.toMatchObject({ name: 'HostedOrchestrationError', code: 'invalid_response' });
  });

  it('throws invalid_response when login poll authenticated is missing user_id', async () => {
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'authenticated' }), { status: 200 })) as any,
    );

    await expect(hostedLoginPoll({ poll_id: 'poll_1' })).rejects.toMatchObject({
      name: 'HostedOrchestrationError',
      code: 'invalid_response',
    });
  });

  it('throws invalid_response when link project payload is missing project_id', async () => {
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ project_slug: 'acme' }), { status: 200 })) as any,
    );

    await expect(
      hostedLinkProject({
        project_name: 'acme',
        env: 'development',
        framework: 'express' as any,
        user_id: 'user_1',
      }),
    ).rejects.toMatchObject({ name: 'HostedOrchestrationError', code: 'invalid_response' });
  });

  it('throws invalid_response when environment response has invalid env', async () => {
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ env: 'prod' }), { status: 200 })) as any,
    );

    await expect(
      hostedSelectEnvironment({
        project_id: 'proj_1',
        project_slug: 'acme',
        env: 'production',
        user_id: 'user_1',
      }),
    ).rejects.toBeInstanceOf(HostedOrchestrationError);
  });
});

