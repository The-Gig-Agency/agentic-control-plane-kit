import { detectFramework, type Framework } from '../detect/index.js';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  return {
    workflow: 'login',
    publicCommand: 'echelon login',
    status: 'ready',
    summary: 'Authenticate the operator and persist a product-shell session without exposing raw infrastructure details.',
    context,
    requiresInput: ['user credentials or browser auth handoff'],
    nextAction: 'Implement session persistence and hosted auth handoff for the public CLI.',
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
        description: 'Store the resulting org and user session locally for follow-on link and protect workflows.',
        integrationPoint: 'Future local session store for CLI auth state.',
      },
    ],
  };
}

function buildLinkPlan(context: ReturnType<typeof normalizeContext>): ProductShellWorkflowPlan {
  return {
    workflow: 'link',
    publicCommand: 'echelon link',
    status: 'ready',
    summary: 'Link the local app to an Echelon project using product nouns instead of Repo B project provisioning details.',
    context,
    requiresInput: ['target Echelon project selection'],
    nextAction: 'Implement project lookup, project creation, and dashboard URL resolution behind the public CLI.',
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
        description: 'Persist the linked project reference locally without exposing governance identifiers in user-facing config.',
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
  return {
    workflow: 'environment',
    publicCommand: 'echelon env',
    status: 'ready',
    summary: 'Select or create the product environment that downstream protect and deploy workflows should target.',
    context,
    requiresInput: ['environment selection or creation intent'],
    nextAction: 'Implement hosted environment lookup and local environment state persistence for public workflows.',
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
        description: 'Store the chosen environment locally so later commands can reuse it without requiring raw backend identifiers.',
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
  opts: { userId?: string } = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildLoginPlan(detected);
  const authUrl = buildAuthUrl(detected.projectName, detected.env);

  // TGA-184: Do not fabricate authenticated/link/environment state locally.
  // Until hosted orchestration exists, these workflows must clearly block.
  return {
    plan,
    status: 'blocked',
    summary: 'Login requires hosted orchestration and is not implemented in this repo yet.',
    nextAction: 'Use `echelon login --plan` to inspect the workflow; run hosted Echelon orchestration to complete login.',
    authUrl,
  };
}

export async function runLinkWorkflow(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildLinkPlan(detected);

  // TGA-184: no fake local link state.
  return {
    plan,
    status: 'blocked',
    summary: 'Link requires hosted orchestration and is not implemented in this repo yet.',
    nextAction: 'Use `echelon link --plan` to inspect the workflow; run hosted Echelon orchestration to complete linking.',
  };
}

export async function runEnvironmentWorkflow(
  context: ProductShellContext = {},
): Promise<ProductShellWorkflowExecution> {
  const detected = await detectProductShellContext(context);
  const plan = buildEnvironmentPlan(detected);

  // TGA-184: env selection must come from real hosted environment resolution.
  return {
    plan,
    status: 'blocked',
    summary: 'Environment selection requires hosted orchestration and is not implemented in this repo yet.',
    nextAction: 'Use `echelon env --plan` to inspect the workflow; run hosted Echelon orchestration to resolve environments.',
  };
}
