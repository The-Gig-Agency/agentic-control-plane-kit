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

  it('blocks login (no fake session persistence) until hosted orchestration exists', async () => {
    detectFrameworkMock.mockResolvedValueOnce('express');

    const cwd = makeTempDir('echelon-login');
    const result = await runLoginWorkflow({
      cwd,
      env: 'staging',
    }, {
      userId: 'alan',
    });

    expect(result.status).toBe('blocked');
    expect(result.authUrl).toContain('project=echelon-login');
    expect(fs.existsSync(path.join(cwd, '.echelon'))).toBe(false);
  });

  it('blocks link (no fake project IDs) until hosted orchestration exists', async () => {
    const blockedCwd = makeTempDir('echelon-link');
    detectFrameworkMock.mockResolvedValueOnce('express');
    const blocked = await runLinkWorkflow({
      cwd: blockedCwd,
    });
    expect(blocked.status).toBe('blocked');
    expect(fs.existsSync(path.join(blockedCwd, '.echelon'))).toBe(false);
  });

  it('blocks env selection (no fake env state) until hosted orchestration exists', async () => {
    const cwd = makeTempDir('echelon-env');
    detectFrameworkMock.mockResolvedValueOnce('supabase');
    detectFrameworkMock.mockResolvedValueOnce('supabase');
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
