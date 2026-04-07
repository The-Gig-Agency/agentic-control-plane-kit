import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

  it('persists local login state and returns the next link action', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const cwd = makeTempDir('echelon-login');
    const result = await runLoginWorkflow({
      cwd,
      env: 'staging',
    }, {
      userId: 'alan',
    });

    expect(result.status).toBe('ready');
    expect(result.stateFile).toContain('.echelon/session.json');
    expect(result.authUrl).toContain('project=echelon-login');
    const saved = JSON.parse(fs.readFileSync(path.join(cwd, '.echelon', 'session.json'), 'utf-8'));
    expect(saved.userId).toBe('alan');
    const gitignore = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.echelon/');
  });

  it('blocks link until a login session exists, then persists project link state', async () => {
    const blockedCwd = makeTempDir('echelon-link-blocked');
    detectFrameworkMock.mockResolvedValueOnce('express');
    const blocked = await runLinkWorkflow({
      cwd: blockedCwd,
    });
    expect(blocked.status).toBe('blocked');

    const readyCwd = makeTempDir('echelon-link-ready');
    detectFrameworkMock.mockResolvedValueOnce('express');
    await runLoginWorkflow({ cwd: readyCwd }, { userId: 'alan' });
    detectFrameworkMock.mockResolvedValueOnce('express');
    const linked = await runLinkWorkflow({
      cwd: readyCwd,
      env: 'production',
      projectName: 'echelon-link-ready',
    });

    expect(linked.status).toBe('ready');
    expect(linked.dashboardUrl).toContain('/dashboard/echelon-link-ready/production');
    const saved = JSON.parse(fs.readFileSync(path.join(readyCwd, '.echelon', 'project-link.json'), 'utf-8'));
    expect(saved.projectId).toBe('echelon_echelon-link-ready');
  });

  it('persists environment state after link orchestration', async () => {
    const cwd = makeTempDir('echelon-env');
    detectFrameworkMock.mockResolvedValueOnce('supabase');
    await runLoginWorkflow({ cwd }, { userId: 'alan' });
    detectFrameworkMock.mockResolvedValueOnce('supabase');
    await runLinkWorkflow({ cwd, env: 'development', projectName: 'echelon-env' });
    detectFrameworkMock.mockResolvedValueOnce('supabase');
    const envResult = await runEnvironmentWorkflow({
      cwd,
      env: 'staging',
      projectName: 'echelon-env',
    });

    expect(envResult.status).toBe('ready');
    expect(envResult.dashboardUrl).toContain('/dashboard/echelon-env/staging');
    const saved = JSON.parse(fs.readFileSync(path.join(cwd, '.echelon', 'environment.json'), 'utf-8'));
    expect(saved.env).toBe('staging');
  });

  it('appends .echelon to an existing gitignore without clobbering entries', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const cwd = makeTempDir('echelon-gitignore');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n');

    await runLoginWorkflow({ cwd }, { userId: 'alan' });

    const gitignore = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.echelon/');
  });
});
