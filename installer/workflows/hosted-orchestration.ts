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
  return await postJson<HostedLoginStartResponse>(`${base}/cli/login/start`, input);
}

export async function hostedLoginPoll(input: {
  poll_id: string;
}): Promise<HostedLoginPollResponse> {
  const base = getOrchestratorBaseUrl();
  if (!base) {
    throw new HostedOrchestrationError('not_configured', getHostedOrchestrationHint());
  }
  return await postJson<HostedLoginPollResponse>(`${base}/cli/login/poll`, input);
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
  return await postJson<HostedLinkResponse>(`${base}/cli/projects/link`, input);
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
  return await postJson<HostedEnvironmentResponse>(`${base}/cli/environments/select`, input);
}

