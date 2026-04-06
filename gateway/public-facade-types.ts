export type PublicDecision = 'allow' | 'deny' | 'require_approval';
export type PublicRiskLevel = 'low' | 'medium' | 'high';
export type PublicExecutionStatus = 'completed' | 'blocked' | 'pending_approval';

export interface PublicGatewayInfo {
  name: string;
  version: string;
  docs_url?: string;
  dashboard_url?: string;
}

export interface PublicGatewayCommandUrls {
  discover: '/discover';
  register: '/register';
  evaluate: '/evaluate';
  execute: '/execute';
  audit: '/audit';
}

export interface PublicConnectorSummary {
  id: string;
  slug: string;
  name: string;
  status: 'available' | 'coming_soon';
  capabilities: string[];
}

export interface PublicDiscoverResponse {
  gateway: PublicGatewayInfo;
  commands: PublicGatewayCommandUrls;
  auth: {
    login_required: boolean;
    approval_required_for_write: boolean;
  };
  connectors: PublicConnectorSummary[];
}

export interface PublicRegisterRequest {
  project: string;
  env: 'development' | 'staging' | 'production';
  connector?: string;
  actor_id?: string;
}

export interface PublicRegisterResponse {
  project_id: string;
  environment_id: string;
  connector_id?: string;
  dashboard_url?: string;
  next_action: string;
}

export interface PublicEvaluateRequest {
  project: string;
  env: 'development' | 'staging' | 'production';
  connector: string;
  action: string;
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
  };
  input?: Record<string, unknown>;
}

export interface PublicEvaluateResponse {
  decision: PublicDecision;
  risk: PublicRiskLevel;
  decision_id: string;
  reason?: string;
  approval: {
    required: boolean;
    policy_label?: string;
  };
}

export interface PublicExecuteRequest {
  project: string;
  env: 'development' | 'staging' | 'production';
  connector: string;
  action: string;
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
  };
  decision_id?: string;
  input?: Record<string, unknown>;
}

export interface PublicExecuteResponse {
  status: PublicExecutionStatus;
  execution_id: string;
  result?: Record<string, unknown>;
  audit_id?: string;
  approval: {
    required: boolean;
    state?: 'pending' | 'approved' | 'rejected';
  };
}

export interface PublicAuditRequest {
  project: string;
  env?: 'development' | 'staging' | 'production';
  connector?: string;
  action?: string;
  actor_id?: string;
  decision_id?: string;
}

export interface PublicAuditEntry {
  audit_id: string;
  project: string;
  env: 'development' | 'staging' | 'production';
  connector: string;
  action: string;
  actor_id: string;
  decision: PublicDecision;
  execution_status: PublicExecutionStatus;
  created_at: string;
}

export interface PublicAuditResponse {
  entries: PublicAuditEntry[];
}
