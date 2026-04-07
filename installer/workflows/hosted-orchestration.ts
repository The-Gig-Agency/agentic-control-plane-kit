import type { Framework } from '../detect/index.js';

export type HostedEnv = 'development' | 'staging' | 'production';

export interface HostedLoginStartResponse {
  auth_url: string;
  poll_id: string;
}

export interface HostedLoginPollResponse {
  status: 'pending' | 'authenticated' | 'failed';
  user_id?: string;
  error?: string;
}

export interface HostedLinkResponse {
  project_id: string;
  project_slug: string;
  dashboard_url?: string;
}

export interface HostedEnvironmentResponse {
  env: HostedEnv;
  dashboard_url?: string;
}

export class HostedOrchestrationError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'HostedOrchestrationError';
    this.code = code;
    this.status = status;
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HostedOrchestrationError('invalid_response', `Expected ${label} to be a non-empty string`);
  }
}

function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new HostedOrchestrationError(
      'invalid_response',
      `Expected ${label} to be one of: ${allowed.join(', ')}`,
    );
  }
}

function validateLoginStartResponse(payload: any): HostedLoginStartResponse {
  assertString(payload?.auth_url, 'auth_url');
  assertString(payload?.poll_id, 'poll_id');
  return payload as HostedLoginStartResponse;
}

function validateLoginPollResponse(payload: any): HostedLoginPollResponse {
  assertOneOf(payload?.status, ['pending', 'authenticated', 'failed'] as const, 'status');
  if (payload.status === 'authenticated') {
    assertString(payload?.user_id, 'user_id');
  }
  if (payload.status === 'failed' && payload?.error !== undefined && typeof payload.error !== 'string') {
    throw new HostedOrchestrationError('invalid_response', 'Expected error to be a string when provided');
  }
  return payload as HostedLoginPollResponse;
}

function validateLinkResponse(payload: any): HostedLinkResponse {
  assertString(payload?.project_id, 'project_id');
  assertString(payload?.project_slug, 'project_slug');
  if (payload?.dashboard_url !== undefined && typeof payload.dashboard_url !== 'string') {
    throw new HostedOrchestrationError('invalid_response', 'Expected dashboard_url to be a string when provided');
  }
  return payload as HostedLinkResponse;
}

function validateEnvironmentResponse(payload: any): HostedEnvironmentResponse {
  assertOneOf(payload?.env, ['development', 'staging', 'production'] as const, 'env');
  if (payload?.dashboard_url !== undefined && typeof payload.dashboard_url !== 'string') {
    throw new HostedOrchestrationError('invalid_response', 'Expected dashboard_url to be a string when provided');
  }
  return payload as HostedEnvironmentResponse;
}

function getOrchestratorBaseUrl(): string | null {
  const raw = process.env.ECHELON_ORCHESTRATOR_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload?.message || payload?.error || `Request failed: ${res.status}`;
    throw new HostedOrchestrationError('remote_error', message, res.status);
  }
  return payload as T;
}

export function isHostedOrchestrationConfigured(): boolean {
  return !!getOrchestratorBaseUrl();
}

export function getHostedOrchestrationHint(): string {
  return 'Set `ECHELON_ORCHESTRATOR_BASE_URL` to enable hosted login/link/env orchestration.';
}

export async function hostedLoginStart(input: {
  project_name: string;
  env: HostedEnv;
  framework: Framework;
}): Promise<HostedLoginStartResponse> {
  const base = getOrchestratorBaseUrl();
  if (!base) {
    throw new HostedOrchestrationError('not_configured', getHostedOrchestrationHint());
  }
  return validateLoginStartResponse(await postJson(`${base}/cli/login/start`, input));
}

export async function hostedLoginPoll(input: {
  poll_id: string;
}): Promise<HostedLoginPollResponse> {
  const base = getOrchestratorBaseUrl();
  if (!base) {
    throw new HostedOrchestrationError('not_configured', getHostedOrchestrationHint());
  }
  return validateLoginPollResponse(await postJson(`${base}/cli/login/poll`, input));
}

export async function hostedLinkProject(input: {
  project_name: string;
  env: HostedEnv;
  framework: Framework;
  user_id: string;
}): Promise<HostedLinkResponse> {
  const base = getOrchestratorBaseUrl();
  if (!base) {
    throw new HostedOrchestrationError('not_configured', getHostedOrchestrationHint());
  }
  return validateLinkResponse(await postJson(`${base}/cli/projects/link`, input));
}

export async function hostedSelectEnvironment(input: {
  project_id: string;
  project_slug: string;
  env: HostedEnv;
  user_id: string;
}): Promise<HostedEnvironmentResponse> {
  const base = getOrchestratorBaseUrl();
  if (!base) {
    throw new HostedOrchestrationError('not_configured', getHostedOrchestrationHint());
  }
  return validateEnvironmentResponse(await postJson(`${base}/cli/environments/select`, input));
}

