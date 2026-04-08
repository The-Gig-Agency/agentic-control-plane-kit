import type {
  PublicAuditResponse,
  PublicAuditEntry,
  PublicConnectorSummary,
  PublicDiscoverResponse,
  PublicEvaluateResponse,
  PublicExecuteResponse,
  PublicRegisterRequest,
  PublicRegisterResponse,
} from './public-facade-types.ts';
import type { GatewayConfig } from './types.ts';

interface DiscoveryLike {
  gateway_version?: string;
  name?: string;
  docs_url?: string;
  available_servers?: Array<{
    server_id: string;
    name: string;
    tool_prefix: string;
    status: 'available' | 'unavailable' | 'requires_registration';
  }>;
}

interface AuthorizationDecisionLike {
  decision_id: string;
  decision: 'allow' | 'deny' | 'require_approval';
  reason?: string;
  policy_id?: string;
}

export function normalizePlatformBaseUrl(platformUrl?: string | null): string {
  return (platformUrl || 'https://governance-hub.supabase.co').replace(/\/functions\/v1\/?$/, '');
}

export function buildPublicCommandUrls() {
  return {
    discover: '/discover' as const,
    register: '/register' as const,
    evaluate: '/evaluate' as const,
    execute: '/execute' as const,
    audit: '/audit' as const,
  };
}

export function buildConnectorSummariesFromDiscovery(discovery: DiscoveryLike): PublicConnectorSummary[] {
  const servers = discovery.available_servers || [];
  return servers.map((server) => ({
    id: server.server_id,
    slug: server.tool_prefix.replace(/\.$/, ''),
    name: server.name,
    status: server.status === 'requires_registration' ? 'coming_soon' : 'available',
    capabilities: [server.tool_prefix],
  }));
}

export function buildConnectorSummariesFromConfig(config: GatewayConfig): PublicConnectorSummary[] {
  return Object.entries(config.servers).map(([serverId, serverConfig]) => ({
    id: serverId,
    slug: serverConfig.tool_prefix.replace(/\.$/, ''),
    name: serverId,
    status: 'available',
    capabilities: [serverConfig.tool_prefix],
  }));
}

export function buildPublicDiscoverResponse(input: {
  gatewayName: string;
  version: string;
  docsUrl?: string;
  connectors: PublicConnectorSummary[];
}): PublicDiscoverResponse {
  return {
    gateway: {
      name: input.gatewayName,
      version: input.version,
      docs_url: input.docsUrl,
    },
    commands: buildPublicCommandUrls(),
    auth: {
      login_required: true,
      approval_required_for_write: true,
    },
    connectors: input.connectors,
  };
}

export function buildPublicRegisterResponse(
  request: PublicRegisterRequest,
  registrationUrl?: string,
): PublicRegisterResponse {
  return {
    project_id: request.project,
    environment_id: `${request.project}:${request.env}`,
    connector_id: request.connector,
    dashboard_url: registrationUrl,
    next_action: registrationUrl
      ? 'Complete onboarding and retrieve a tenant-scoped API key before connector execution.'
      : 'Complete project onboarding before connector execution.',
  };
}

export function deriveToolName(connector: string, action: string): string {
  const normalizedConnector = connector.endsWith('.') ? connector : `${connector}.`;
  const normalizedAction = action.replace(/^\./, '');
  return `${normalizedConnector}${normalizedAction}`;
}

export function buildPublicEvaluateResponse(decision: AuthorizationDecisionLike): PublicEvaluateResponse {
  const approvalRequired = decision.decision === 'require_approval';
  return {
    decision: decision.decision,
    risk: decision.decision === 'deny' ? 'high' : approvalRequired ? 'medium' : 'low',
    decision_id: decision.decision_id,
    reason: decision.reason,
    approval: {
      required: approvalRequired,
      policy_label: decision.policy_id,
    },
  };
}

export function buildPublicExecuteSuccessResponse(input: {
  executionId: string;
  result?: Record<string, unknown>;
  decisionId?: string;
}): PublicExecuteResponse {
  return {
    status: 'completed',
    execution_id: input.executionId,
    result: input.result,
    audit_id: input.decisionId,
    approval: {
      required: false,
      state: 'approved',
    },
  };
}

export function buildPublicExecuteBlockedResponse(input: {
  executionId: string;
  approvalRequired: boolean;
  auditId?: string;
}): PublicExecuteResponse {
  return {
    status: input.approvalRequired ? 'pending_approval' : 'blocked',
    execution_id: input.executionId,
    audit_id: input.auditId,
    approval: {
      required: input.approvalRequired,
      state: input.approvalRequired ? 'pending' : undefined,
    },
  };
}

export function buildEmptyAuditResponse(): PublicAuditResponse {
  return { entries: [] };
}

export function buildPublicErrorResponse(code: string, message: string): { error: string; message: string } {
  return { error: code, message };
}

function requireStringField(
  row: Record<string, unknown>,
  keys: string[],
  label: string,
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Audit row missing required ${label} field (${keys.join(' | ')})`);
}

function requireEnumField<T extends string>(
  row: Record<string, unknown>,
  keys: string[],
  allowed: readonly T[],
  label: string,
): T {
  const raw = requireStringField(row, keys, label);
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new Error(`Audit row has invalid ${label} value "${raw}"`);
}

export function buildPublicAuditResponseFromRows(input: {
  project: string;
  env: 'development' | 'staging' | 'production';
  rows: Array<Record<string, unknown>>;
}): PublicAuditResponse {
  const entries: PublicAuditEntry[] = (input.rows || []).map((row) => {
    const auditId = requireStringField(row, ['audit_id', 'event_id', 'decision_id'], 'audit_id');
    const action = requireStringField(row, ['action', 'tool'], 'action');
    const createdAt = requireStringField(row, ['created_at', 'ts'], 'created_at');
    const actorId = requireStringField(row, ['actor_id', 'api_key_id'], 'actor_id');

    if (!action.includes('.')) {
      throw new Error(
        `Audit row action must be namespaced as "connector.action" (e.g. "shopify.products.update") for public facade mapping; got "${action}". Fix the audit-query row or the backend projection.`,
      );
    }
    const connector = action.split('.')[0];

    const decision = requireEnumField(row, ['decision'], ['allow', 'deny', 'require_approval'] as const, 'decision');
    const executionStatus = requireEnumField(
      row,
      ['execution_status'],
      ['blocked', 'pending_approval', 'running', 'completed', 'failed'] as const,
      'execution_status',
    );

    return {
      audit_id: auditId,
      project: input.project,
      env: input.env,
      connector,
      action,
      actor_id: actorId,
      decision,
      execution_status: executionStatus,
      created_at: createdAt,
    };
  });

  return { entries };
}
