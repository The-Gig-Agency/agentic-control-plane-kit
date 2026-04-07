import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer } from 'node:http';

vi.mock('../detect/index.js', () => ({
  detectFramework: vi.fn(),
}));

import { detectFramework } from '../detect/index.js';
import {
  createEnvironmentWorkflowPlan,
  createLinkWorkflowPlan,
  createLoginWorkflowPlan,
  createProductShellWorkflowScaffold,
  runEnvironmentWorkflow,
  runLinkWorkflow,
  runLoginWorkflow,
} from './product-shell.js';

const detectFrameworkMock = vi.mocked(detectFramework);
const tempDirs: string[] = [];

function makeTempDir(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  detectFrameworkMock.mockReset();
  vi.unstubAllGlobals();
  delete process.env.ECHELON_ORCHESTRATOR_BASE_URL;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('product-shell workflow scaffold', () => {
  it('builds a login workflow plan from detected context', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const plan = await createLoginWorkflowPlan({
      cwd: '/tmp/acme-growth',
      env: 'staging',
    });

    expect(plan.workflow).toBe('login');
    expect(plan.publicCommand).toBe('echelon login');
    expect(plan.context.framework).toBe('express');
    expect(plan.context.projectName).toBe('acme-growth');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'detect-project',
      'authenticate-user',
      'persist-session',
    ]);
    expect(plan.summary).not.toContain('Governance Hub URL');
    expect(plan.summary).not.toContain('Executor URL');
  });

  it('builds a link workflow plan with product-facing steps', async () => {
    detectFrameworkMock.mockResolvedValueOnce('django');

    const plan = await createLinkWorkflowPlan({
      cwd: '/tmp/acme-platform',
      env: 'production',
    });

    expect(plan.workflow).toBe('link');
    expect(plan.publicCommand).toBe('echelon link');
    expect(plan.context.framework).toBe('django');
    expect(plan.requiresInput).toContain('target Echelon project selection');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'load-session',
      'resolve-project',
      'write-local-link',
      'resolve-dashboard',
    ]);
  });

  it('builds an environment workflow plan without leaking backend identifiers', async () => {
    detectFrameworkMock.mockResolvedValueOnce('supabase');

    const plan = await createEnvironmentWorkflowPlan({
      cwd: '/tmp/acme-control',
    });

    expect(plan.workflow).toBe('environment');
    expect(plan.publicCommand).toBe('echelon env');
    expect(plan.context.framework).toBe('supabase');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'load-linked-project',
      'resolve-environment',
      'persist-environment',
    ]);
    expect(plan.nextAction).not.toContain('governance');
    expect(plan.nextAction).not.toContain('executor');
  });

  it('builds the full workflow scaffold from one detected context', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const scaffold = await createProductShellWorkflowScaffold({
      cwd: '/tmp/acme-growth',
      projectName: 'acme-growth',
      env: 'development',
    });

    expect(Object.keys(scaffold)).toEqual(['login', 'link', 'environment', 'init', 'protect']);
    expect(scaffold.login.context).toEqual(scaffold.link.context);
    expect(scaffold.link.context).toEqual(scaffold.environment.context);
  });

  it('blocks login (no fake session persistence) until hosted orchestration exists', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const cwd = makeTempDir('echelon-login');
    delete process.env.ECHELON_ORCHESTRATOR_BASE_URL;
    const result = await runLoginWorkflow({ cwd, env: 'staging' });

    expect(result.status).toBe('blocked');
    expect(result.authUrl).toContain('project=echelon-login');
    expect(fs.existsSync(path.join(cwd, '.echelon'))).toBe(false);
  });

  it('runs hosted login and persists metadata-only session state when configured', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';

    const cwd = makeTempDir('echelon-hosted-login');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ auth_url: 'https://auth.test', poll_id: 'poll_123' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'authenticated', user_id: 'user_abc' }), { status: 200 }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await runLoginWorkflow({ cwd, env: 'development' });
    expect(result.status).toBe('ready');
    expect(result.stateFile).toContain('.echelon/session.json');

    const saved = JSON.parse(fs.readFileSync(path.join(cwd, '.echelon', 'session.json'), 'utf-8'));
    expect(saved.userId).toBe('user_abc');
  });

  it('returns blocked (not throw) when hosted login start returns a remote error', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'nope' }), { status: 500 })) as any,
    );

    const cwd = makeTempDir('echelon-login-start-error');
    await expect(runLoginWorkflow({ cwd, env: 'development' })).resolves.toMatchObject({
      status: 'blocked',
      summary: 'Hosted login start failed.',
    });
  });

  it('returns blocked (not throw) when hosted login poll throws (e.g. network error)', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = 'https://orchestrator.test';

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ auth_url: 'https://auth.test', poll_id: 'poll_123' }), { status: 200 }),
        )
        .mockRejectedValueOnce(new Error('network down')) as any,
    );

    const cwd = makeTempDir('echelon-login-poll-error');
    await expect(runLoginWorkflow({ cwd, env: 'development' })).resolves.toMatchObject({
      status: 'blocked',
      summary: 'Hosted login poll failed.',
    });
  });

  it('smoke: hosted login succeeds against a real mock orchestrator server', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    let calls: string[] = [];
    let pollCount = 0;
    const server = createServer((req, res) => {
      const url = req.url || '';
      calls.push(url);
      res.setHeader('Content-Type', 'application/json');

      if (url === '/cli/login/start') {
        res.statusCode = 200;
        res.end(JSON.stringify({ auth_url: 'http://auth.local', poll_id: 'poll_1' }));
        return;
      }

      if (url === '/cli/login/poll') {
        pollCount += 1;
        res.statusCode = 200;
        if (pollCount < 2) {
          res.end(JSON.stringify({ status: 'pending' }));
          return;
        }
        res.end(JSON.stringify({ status: 'authenticated', user_id: 'user_1' }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    process.env.ECHELON_ORCHESTRATOR_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.ECHELON_LOGIN_TIMEOUT_MS = '5000';
    process.env.ECHELON_LOGIN_POLL_MS = '5';

    const cwd = makeTempDir('echelon-login-mock-server');
    const result = await runLoginWorkflow({ cwd, env: 'development' });
    server.close();

    expect(result.status).toBe('ready');
    expect(calls).toContain('/cli/login/start');
    expect(calls).toContain('/cli/login/poll');
  });

  it('blocks link (no fake project IDs) until hosted orchestration exists', async () => {
    const blockedCwd = makeTempDir('echelon-link');
    detectFrameworkMock.mockResolvedValueOnce('express');
    delete process.env.ECHELON_ORCHESTRATOR_BASE_URL;
    const blocked = await runLinkWorkflow({
      cwd: blockedCwd,
    });
    expect(blocked.status).toBe('blocked');
    expect(fs.existsSync(path.join(blockedCwd, '.echelon'))).toBe(false);
  });

  it('blocks env selection (no fake env state) until hosted orchestration exists', async () => {
    const cwd = makeTempDir('echelon-env');
    detectFrameworkMock.mockResolvedValueOnce('supabase');
    delete process.env.ECHELON_ORCHESTRATOR_BASE_URL;
    const envResult = await runEnvironmentWorkflow({
      cwd,
      env: 'staging',
      projectName: 'echelon-env',
    });

    expect(envResult.status).toBe('blocked');
    expect(fs.existsSync(path.join(cwd, '.echelon'))).toBe(false);
  });

  // Note: .echelon/gitignore behavior is exercised once hosted orchestration exists.
});
