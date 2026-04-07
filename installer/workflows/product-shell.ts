import { detectFramework, type Framework } from '../detect/index.js';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  HostedOrchestrationError,
  getHostedOrchestrationHint,
  hostedLinkProject,
  hostedLoginPoll,
  hostedLoginStart,
  hostedSelectEnvironment,
  isHostedOrchestrationConfigured,
} from './hosted-orchestration.js';

export type ProductShellWorkflowName = 'login' | 'link' | 'environment' | 'init' | 'protect';
export type ProductShellWorkflowStatus = 'pending' | 'ready' | 'blocked';

export interface ProductShellContext {
  cwd?: string;
  env?: 'development' | 'staging' | 'production';
  framework?: Framework;
  projectName?: string;
}

export interface ProductShellStep {
  id: string;
  label: string;
  description: string;
  integrationPoint?: string;
}

export interface ProductShellWorkflowPlan {
  workflow: ProductShellWorkflowName;
  publicCommand: string;
  status: ProductShellWorkflowStatus;
  summary: string;
  context: {
    cwd: string;
    env: 'development' | 'staging' | 'production';
    framework: Framework;
    projectName: string;
  };
  requiresInput: string[];
  nextAction: string;
  output: {
    projectName: string;
    framework: Framework;
    env: 'development' | 'staging' | 'production';
  };
  steps: ProductShellStep[];
}

export interface ProductShellWorkflowExecution {
  plan: ProductShellWorkflowPlan;
  status: ProductShellWorkflowStatus;
  summary: string;
  nextAction: string;
  stateFile?: string;
  authUrl?: string;
  dashboardUrl?: string;
  data?: Record<string, unknown>;
}

interface ProductShellSessionState {
  kind: 'session';
  status: 'authenticated';
  userId: string;
  authUrl: string;
  createdAt: string;
}

interface ProductShellLinkState {
  kind: 'project-link';
  projectName: string;
  projectSlug: string;
  projectId: string;
  framework: Framework;
  linkedAt: string;
  dashboardUrl: string;
}

interface ProductShellEnvironmentState {
  kind: 'environment';
  env: 'development' | 'staging' | 'production';
  projectId: string;
  projectSlug: string;
  updatedAt: string;
  dashboardUrl: string;
}

const EchelonGitignoreEntry = '.echelon/';
const ForbiddenStateKeyPattern = /(token|secret|password|api[-_]?key)/i;

function deriveProjectName(cwd: string, explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const segments = cwd.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || 'echelon-project';
}

function normalizeContext(context: ProductShellContext, framework: Framework) {
  const cwd = context.cwd || process.cwd();
  const env = context.env || 'development';
  const projectName = deriveProjectName(cwd, context.projectName);

  return {
    cwd,
    env,
    framework,
    projectName,
  };
}

function getStateDir(cwd: string): string {
  return path.join(cwd, '.echelon');
}

function getGitignorePath(cwd: string): string {
  return path.join(cwd, '.gitignore');
}

function getSessionPath(cwd: string): string {
  return path.join(getStateDir(cwd), 'session.json');
}

function getLinkPath(cwd: string): string {
  return path.join(getStateDir(cwd), 'project-link.json');
}

function getEnvironmentPath(cwd: string): string {
  return path.join(getStateDir(cwd), 'environment.json');
}

function slugifyProjectName(projectName: string): string {
  return projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'echelon-project';
}

function buildDashboardUrl(projectSlug: string, env: 'development' | 'staging' | 'production'): string {
  const baseUrl = process.env.ECHELON_DASHBOARD_BASE_URL || 'https://www.buyechelon.com';
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/dashboard/${projectSlug}/${env}`;
}

function buildAuthUrl(projectName: string, env: 'development' | 'staging' | 'production'): string {
  const baseUrl = process.env.ECHELON_AUTH_BASE_URL || 'https://www.buyechelon.com/login';
  const url = new URL(baseUrl);
  url.searchParams.set('project', projectName);
  url.searchParams.set('env', env);
  return url.toString();
}

async function ensureStateDir(cwd: string): Promise<void> {
  await mkdir(getStateDir(cwd), { recursive: true });
}

function assertNoSecretLikeKeys(value: unknown, trail: string[] = []): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretLikeKeys(entry, [...trail, String(index)]));
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (ForbiddenStateKeyPattern.test(key)) {
      throw new Error(
        `Refusing to persist secret-like key "${nextTrail.join('.')}" in .echelon state. State files must remain metadata-only.`,
      );
    }
    assertNoSecretLikeKeys(nested, nextTrail);
  }
}

async function ensureGitignoreContains(cwd: string): Promise<void> {
  const gitignorePath = getGitignorePath(cwd);
  let current = '';
  try {
    current = await readFile(gitignorePath, 'utf-8');
  } catch {
    // create .gitignore on first stateful workflow run
  }

  const lines = current
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.includes(EchelonGitignoreEntry)) {
    return;
  }

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  const suffix = current.length > 0 ? '\n' : '';
  await writeFile(gitignorePath, `${current}${prefix}${EchelonGitignoreEntry}${suffix}`, 'utf-8');
}

async function writeJsonState(filePath: string, value: unknown): Promise<void> {
  assertNoSecretLikeKeys(value);
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  try {
    await chmod(filePath, 0o600);
  } catch {
    // Best-effort hardening for local state files.
  }
}

async function readJsonState<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    return null;
  }
}

function buildLoginPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  const hostedConfigured = isHostedOrchestrationConfigured();
  return {
    workflow: 'login',
    publicCommand: 'echelon login',
    status: hostedConfigured ? 'pending' : 'blocked',
    summary: hostedConfigured
      ? 'Authenticate the operator via hosted orchestration (configured; runtime availability verified at execution time).'
      : 'Authenticate the operator via hosted orchestration. This workflow is blocked until hosted orchestration is configured.',
    context,
    requiresInput: ['user credentials or browser auth handoff'],
    nextAction: hostedConfigured
      ? 'Run `echelon login` to start the hosted auth handoff.'
      : getHostedOrchestrationHint(),
    output: {
      projectName: context.projectName,
      framework: context.framework,
      env: context.env,
    },
    steps: [
      {
        id: 'detect-project',
        label: 'Detect project context',
        description: 'Capture cwd, framework, and target environment before any remote coordination begins.',
      },
      {
        id: 'authenticate-user',
        label: 'Authenticate user',
        description: 'Exchange local CLI intent for a hosted login session without prompting for Repo B internals.',
        integrationPoint: 'Future hosted auth endpoint for the public Echelon CLI.',
      },
      {
        id: 'persist-session',
        label: 'Persist session',
        description: 'Persist a metadata-only session locally after a real hosted auth exchange succeeds (no fabricated success state).',
        integrationPoint: 'Future local session store for CLI auth state.',
      },
    ],
  };
}

function buildLinkPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  const hostedConfigured = isHostedOrchestrationConfigured();
  return {
    workflow: 'link',
    publicCommand: 'echelon link',
    status: hostedConfigured ? 'pending' : 'blocked',
    summary: hostedConfigured
      ? 'Link the local app to a hosted Echelon project (configured; runtime availability verified at execution time).'
      : 'Link the local app to a hosted Echelon project. This workflow is blocked until hosted orchestration is configured.',
    context,
    requiresInput: ['target Echelon project selection'],
    nextAction: hostedConfigured
      ? 'Run `echelon link` after a successful `echelon login`.'
      : getHostedOrchestrationHint(),
    output: {
      projectName: context.projectName,
      framework: context.framework,
      env: context.env,
    },
    steps: [
      {
        id: 'load-session',
        label: 'Load authenticated session',
        description: 'Require an authenticated operator session before linking a project.',
        integrationPoint: 'Login workflow session store.',
      },
      {
        id: 'resolve-project',
        label: 'Resolve project',
        description: 'Create or select the hosted Echelon project that should own this local codebase.',
        integrationPoint: 'Future project list or create API behind the product shell.',
      },
      {
        id: 'write-local-link',
        label: 'Write local link state',
        description: 'Persist a metadata-only project mapping locally after real hosted project selection/creation succeeds.',
        integrationPoint: 'Future local project-link manifest.',
      },
      {
        id: 'resolve-dashboard',
        label: 'Resolve dashboard URL',
        description: 'Return the hosted dashboard destination for the linked project as a product-facing next action.',
        integrationPoint: 'Future dashboard routing service.',
      },
    ],
  };
}

function buildEnvironmentPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  const hostedConfigured = isHostedOrchestrationConfigured();
  return {
    workflow: 'environment',
    publicCommand: 'echelon env',
    status: hostedConfigured ? 'pending' : 'blocked',
    summary: hostedConfigured
      ? 'Select or create the product environment via hosted orchestration (configured; runtime availability verified at execution time).'
      : 'Select or create the product environment via hosted orchestration. This workflow is blocked until hosted orchestration is configured.',
    context,
    requiresInput: ['environment selection or creation intent'],
    nextAction: hostedConfigured
      ? 'Run `echelon env` after a successful `echelon link`.'
      : getHostedOrchestrationHint(),
    output: {
      projectName: context.projectName,
      framework: context.framework,
      env: context.env,
    },
    steps: [
      {
        id: 'load-linked-project',
        label: 'Load linked project',
        description: 'Require a linked Echelon project before selecting or creating environments.',
        integrationPoint: 'Link workflow local manifest.',
      },
      {
        id: 'resolve-environment',
        label: 'Resolve environment',
        description: 'Choose an existing environment or create one using product terms like development, staging, and production.',
        integrationPoint: 'Future environment list or create API behind the product shell.',
      },
      {
        id: 'persist-environment',
        label: 'Persist environment state',
        description: 'Persist a metadata-only environment selection locally after real hosted resolution succeeds.',
        integrationPoint: 'Future local environment state file.',
      },
    ],
  };
}

function buildInitPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  return {
    workflow: 'init',
    publicCommand: 'echelon init',
    status: 'ready',
    summary: 'Initialize the local ACP kernel scaffolding with explicit readiness gates.',
    context,
    requiresInput: ['none (framework auto-detection)'],
    nextAction: 'Review generated artifacts and run verify/install readiness checks before production.',
    output: {
      projectName: context.projectName,
      framework: context.framework,
      env: context.env,
    },
    steps: [
      {
        id: 'detect-project',
        label: 'Detect project context',
        description: 'Capture cwd + framework before generating anything. Failure -> abort early with a clear error.',
      },
      {
        id: 'preflight-validation',
        label: 'Preflight validation',
        description: 'Detect route collisions and validate production install constraints when needed.',
      },
      {
        id: 'generate-kernel',
        label: 'Generate kernel artifacts',
        description: 'Copy kernel, generate adapters/endpoint/bindings/migrations. Happy path generates runnable runtime files.',
      },
      {
        id: 'write-manifest',
        label: 'Write machine-readable manifest',
        description: 'Emit `.acp/install.json` as the trust anchor for later doctor/verification steps.',
      },
      {
        id: 'readiness-gates',
        label: 'Run readiness gates (soft)',
        description: 'Block on unresolved critical TODO/placeholder markers for production; otherwise emit warnings.',
      },
    ],
  };
}

function buildProtectPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  return {
    workflow: 'protect',
    publicCommand: 'echelon protect',
    status: 'ready',
    summary: 'Verify the init scaffolding and prepare the host for safe “protect/deploy” execution.',
    context,
    requiresInput: ['none (uses `.acp/install.json` + local directory checks)'],
    nextAction: 'If blocked, resolve readiness items; otherwise run your app and verify `/manage meta.actions` returns full registry metadata.',
    output: {
      projectName: context.projectName,
      framework: context.framework,
      env: context.env,
    },
    steps: [
      {
        id: 'load-manifest',
        label: 'Load install manifest',
        description: 'If missing, protect is blocked (no trust anchor). Happy path continues.',
      },
      {
        id: 'doctor-checks',
        label: 'Run doctor checks',
        description: 'Validate kernel install, bindings validity, and pack coverage. Failure -> blocked with explicit next actions.',
      },
      {
        id: 'verify-install',
        label: 'Run verification tooling',
        description: 'Run structural invariants / conformance checks for enabled packs.',
      },
      {
        id: 'guided-next-steps',
        label: 'Show guided next steps',
        description: 'Provide copy/paste commands for the next safe action (migrations + endpoint checks).',
      },
    ],
  };
}

export async function detectProductShellContext(
  context: ProductShellContext = {},
): Promise<ReturnType<typeof normalizeContext>> {
  const cwd = context.cwd || process.cwd();
  const framework = context.framework === undefined ? await detectFramework(cwd) : context.framework;
  return normalizeContext({ ...context, cwd }, framework);
}

export async function createLoginWorkflowPlan(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowPlan> {
  return buildLoginPlan(await detectProductShellContext(context));
}

export async function createLinkWorkflowPlan(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowPlan> {
  return buildLinkPlan(await detectProductShellContext(context));
}

export async function createEnvironmentWorkflowPlan(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowPlan> {
  return buildEnvironmentPlan(await detectProductShellContext(context));
}

export async function createInitWorkflowPlan(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowPlan> {
  return buildInitPlan(await detectProductShellContext(context));
}

export async function createProtectWorkflowPlan(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowPlan> {
  return buildProtectPlan(await detectProductShellContext(context));
}

export async function createProductShellWorkflowScaffold(
  context: ProductShellContext = {},
): Promise<Record<ProductShellWorkflowName, ProductShellWorkflowPlan>> {
  const detected = await detectProductShellContext(context);

  return {
    login: buildLoginPlan(detected),
    link: buildLinkPlan(detected),
    environment: buildEnvironmentPlan(detected),
    init: buildInitPlan(detected),
    protect: buildProtectPlan(detected),
  };
}

export async function runLoginWorkflow(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildLoginPlan(detected);
  if (!isHostedOrchestrationConfigured()) {
    const authUrl = buildAuthUrl(detected.projectName, detected.env);
    return {
      plan,
      status: 'blocked',
      summary: 'Login requires hosted orchestration.',
      nextAction: getHostedOrchestrationHint(),
      authUrl,
    };
  }

  const sessionPath = getSessionPath(detected.cwd);
  let start: Awaited<ReturnType<typeof hostedLoginStart>>;
  try {
    start = await hostedLoginStart({
      project_name: detected.projectName,
      env: detected.env,
      framework: detected.framework,
    });
  } catch (error) {
    const msg =
      error instanceof HostedOrchestrationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to start hosted login.';
    return {
      plan,
      status: 'blocked',
      summary: 'Hosted login start failed.',
      nextAction: msg,
    };
  }

  // Poll for completion. We do NOT persist any token/poll identifier.
  const timeoutMs = Number(process.env.ECHELON_LOGIN_TIMEOUT_MS || 120_000);
  const intervalMs = Number(process.env.ECHELON_LOGIN_POLL_MS || 2_000);
  const startAt = Date.now();
  let userId: string | undefined;

  for (;;) {
    if (Date.now() - startAt > timeoutMs) {
      return {
        plan,
        status: 'blocked',
        summary: 'Timed out waiting for hosted login to complete.',
        nextAction:
          'Complete the browser auth step and re-run `echelon login`. (This CLI does not persist poll IDs; each run starts a fresh login handshake.)',
        authUrl: start.auth_url,
      };
    }

    let poll: Awaited<ReturnType<typeof hostedLoginPoll>>;
    try {
      poll = await hostedLoginPoll({ poll_id: start.poll_id });
    } catch (error) {
      const msg =
        error instanceof HostedOrchestrationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to poll hosted login.';
      return {
        plan,
        status: 'blocked',
        summary: 'Hosted login poll failed.',
        nextAction: msg,
        authUrl: start.auth_url,
      };
    }
    if (poll.status === 'pending') {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (poll.status === 'failed') {
      return {
        plan,
        status: 'blocked',
        summary: 'Hosted login failed.',
        nextAction: poll.error ? `Resolve: ${poll.error}` : 'Retry `echelon login`.',
        authUrl: start.auth_url,
      };
    }
    userId = poll.user_id;
    break;
  }

  if (!userId) {
    return {
      plan,
      status: 'blocked',
      summary: 'Hosted login did not return a user id.',
      nextAction: 'Retry `echelon login` or contact support.',
      authUrl: start.auth_url,
    };
  }

  await ensureStateDir(detected.cwd);
  await ensureGitignoreContains(detected.cwd);
  await writeJsonState(sessionPath, {
    kind: 'session',
    status: 'authenticated',
    userId,
    authUrl: start.auth_url,
    createdAt: new Date().toISOString(),
  } satisfies ProductShellSessionState);

  return {
    plan,
    status: 'ready',
    summary: `Authenticated hosted session for ${userId}.`,
    nextAction: `Run \`echelon link\` to attach ${detected.projectName} to a hosted Echelon project.`,
    stateFile: sessionPath,
    authUrl: start.auth_url,
    data: { userId },
  };
}

export async function runLinkWorkflow(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildLinkPlan(detected);
  if (!isHostedOrchestrationConfigured()) {
    return {
      plan,
      status: 'blocked',
      summary: 'Link requires hosted orchestration.',
      nextAction: getHostedOrchestrationHint(),
    };
  }

  const session = await readJsonState<ProductShellSessionState>(getSessionPath(detected.cwd));
  if (!session || session.kind !== 'session' || session.status !== 'authenticated') {
    return {
      plan,
      status: 'blocked',
      summary: 'Link requires an authenticated local Echelon session.',
      nextAction: 'Run `echelon login` first, then retry `echelon link`.',
    };
  }

  let linked: Awaited<ReturnType<typeof hostedLinkProject>>;
  try {
    linked = await hostedLinkProject({
      project_name: detected.projectName,
      env: detected.env,
      framework: detected.framework,
      user_id: session.userId,
    });
  } catch (error) {
    const msg = error instanceof HostedOrchestrationError ? error.message : 'Unable to link project.';
    return {
      plan,
      status: 'blocked',
      summary: 'Hosted project link failed.',
      nextAction: msg,
    };
  }

  const dashboardUrl = linked.dashboard_url || buildDashboardUrl(linked.project_slug, detected.env);
  const linkPath = getLinkPath(detected.cwd);

  await ensureStateDir(detected.cwd);
  await ensureGitignoreContains(detected.cwd);
  await writeJsonState(linkPath, {
    kind: 'project-link',
    projectName: detected.projectName,
    projectSlug: linked.project_slug,
    projectId: linked.project_id,
    framework: detected.framework,
    linkedAt: new Date().toISOString(),
    dashboardUrl,
  } satisfies ProductShellLinkState);

  return {
    plan,
    status: 'ready',
    summary: `Linked ${detected.projectName} to hosted project ${linked.project_id}.`,
    nextAction: `Run \`echelon env --env ${detected.env}\` to persist the active environment, then open ${dashboardUrl}.`,
    stateFile: linkPath,
    dashboardUrl,
    data: { projectId: linked.project_id, projectSlug: linked.project_slug },
  };
}

export async function runEnvironmentWorkflow(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildEnvironmentPlan(detected);
  if (!isHostedOrchestrationConfigured()) {
    return {
      plan,
      status: 'blocked',
      summary: 'Environment selection requires hosted orchestration.',
      nextAction: getHostedOrchestrationHint(),
    };
  }

  const session = await readJsonState<ProductShellSessionState>(getSessionPath(detected.cwd));
  if (!session || session.kind !== 'session' || session.status !== 'authenticated') {
    return {
      plan,
      status: 'blocked',
      summary: 'Environment selection requires an authenticated local Echelon session.',
      nextAction: 'Run `echelon login` first, then retry `echelon env`.',
    };
  }

  const link = await readJsonState<ProductShellLinkState>(getLinkPath(detected.cwd));
  if (!link || link.kind !== 'project-link') {
    return {
      plan,
      status: 'blocked',
      summary: 'Environment selection requires a linked Echelon project.',
      nextAction: 'Run `echelon link` first, then retry `echelon env`.',
    };
  }

  let envResult: Awaited<ReturnType<typeof hostedSelectEnvironment>>;
  try {
    envResult = await hostedSelectEnvironment({
      project_id: link.projectId,
      project_slug: link.projectSlug,
      env: detected.env,
      user_id: session.userId,
    });
  } catch (error) {
    const msg = error instanceof HostedOrchestrationError ? error.message : 'Unable to resolve environment.';
    return {
      plan,
      status: 'blocked',
      summary: 'Hosted environment resolution failed.',
      nextAction: msg,
    };
  }

  const dashboardUrl = envResult.dashboard_url || buildDashboardUrl(link.projectSlug, detected.env);
  const environmentPath = getEnvironmentPath(detected.cwd);

  await ensureStateDir(detected.cwd);
  await ensureGitignoreContains(detected.cwd);
  await writeJsonState(environmentPath, {
    kind: 'environment',
    env: detected.env,
    projectId: link.projectId,
    projectSlug: link.projectSlug,
    updatedAt: new Date().toISOString(),
    dashboardUrl,
  } satisfies ProductShellEnvironmentState);

  return {
    plan,
    status: 'ready',
    summary: `Selected ${detected.env} as the active Echelon environment for ${link.projectId}.`,
    nextAction: `Open ${dashboardUrl} or continue with \`echelon protect <connector>\`.`,
    stateFile: environmentPath,
    dashboardUrl,
    data: { env: detected.env, projectId: link.projectId },
  };
}
