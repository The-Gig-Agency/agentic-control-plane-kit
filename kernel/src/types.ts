/**
 * Core types for the Agentic Control Plane Kernel
 * Framework-agnostic interfaces for DB, auth, tenant resolution
 */

export interface ManageRequest {
  action: string;
  params?: Record<string, any>;
  idempotency_key?: string;
  dry_run?: boolean;
}

export interface ManageResponse {
  ok: boolean;
  request_id: string;
  data?: any;
  error?: string;
  code?: string;
  dry_run?: boolean;
  constraints_applied?: string[];
}

export interface ActionDef {
  name: string;
  scope: string;
  description: string;
  params_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  supports_dry_run: boolean;
}

export interface ActionHandler {
  (params: Record<string, any>, ctx: ActionContext): Promise<any>;
}

export interface ActionContext {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
  dryRun: boolean;
  requestId: string;
  db: DbAdapter;
  audit: AuditAdapter;
  idempotency: IdempotencyAdapter;
  rateLimit: RateLimitAdapter;
  ceilings: CeilingsAdapter;
  bindings: Bindings;
  meta?: Record<string, any>;
}

export interface Bindings {
  integration: string;  // Integration/repo name (e.g., "ciq-automations", "lead-scoring")
  tenant: {
    table: string;
    id_column: string;
    get_tenant_fn: string;
    is_admin_fn: string;
  };
  auth: {
    keys_table: string;
    key_prefix: string;
    prefix_length: number;
    key_hash_column: string;
    key_prefix_column: string;
    scopes_column: string;
  };
  database: {
    adapter: 'supabase' | 'prisma' | 'drizzle' | 'custom';
    [key: string]: any;
  };
}

export interface DbAdapter {
  /**
   * Execute a query and return results
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  
  /**
   * Execute a query and return single row
   */
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  
  /**
   * Execute a query and return affected row count
   */
  execute(sql: string, params?: any[]): Promise<number>;
  
  /**
   * Begin a transaction
   */
  beginTransaction(): Promise<Transaction>;
  
  /**
   * Get tenant ID from API key ID
   */
  getTenantFromApiKey(apiKeyId: string): Promise<string | null>;
  
  /**
   * Check if tenant is platform admin
   */
  isPlatformAdmin(tenantId: string): Promise<boolean>;
  
  // IAM pack methods
  listApiKeys(tenantId: string): Promise<ApiKey[]>;
  getApiKey(tenantId: string, keyId: string): Promise<ApiKey | null>;
  createApiKey(tenantId: string, data: CreateApiKeyData): Promise<ApiKey>;
  updateApiKey(tenantId: string, keyId: string, data: UpdateApiKeyData): Promise<ApiKey>;
  revokeApiKey(tenantId: string, keyId: string): Promise<void>;
  listTeamMembers(tenantId: string): Promise<TeamMember[]>;
  inviteTeamMember(tenantId: string, data: InviteTeamMemberData): Promise<TeamMember>;
  
  // Webhooks pack methods
  listWebhooks(tenantId: string): Promise<Webhook[]>;
  getWebhook(tenantId: string, webhookId: string): Promise<Webhook | null>;
  createWebhook(tenantId: string, data: CreateWebhookData): Promise<Webhook>;
  updateWebhook(tenantId: string, webhookId: string, data: UpdateWebhookData): Promise<Webhook>;
  deleteWebhook(tenantId: string, webhookId: string): Promise<void>;
  listWebhookDeliveries(tenantId: string, webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
  
  // Settings pack methods
  getSettings(tenantId: string): Promise<Record<string, any>>;
  updateSettings(tenantId: string, data: Record<string, any>): Promise<Record<string, any>>;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  key_prefix: string;
  name?: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
  revoked_at?: string;
}

export interface CreateApiKeyData {
  name?: string;
  scopes: string[];
  expires_at?: string;
}

export interface UpdateApiKeyData {
  name?: string;
  scopes?: string[];
  expires_at?: string;
}

export interface TeamMember {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  invited_at: string;
  joined_at?: string;
}

export interface InviteTeamMemberData {
  email: string;
  role: string;
}

export interface Webhook {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookData {
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateWebhookData {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  tenant_id: string;
  event: string;
  status: 'pending' | 'success' | 'failed';
  status_code?: number;
  response_body?: string;
  attempted_at: string;
  completed_at?: string;
}

export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<number>;
}

export interface AuditEvent {
  // Required
  event_id: string;           // UUID v4 - unique event identifier
  event_version: number;      // Schema version (currently 1)
  schema_version: number;      // Event schema version (currently 1) - for future migrations
  ts: number;                  // Unix timestamp (milliseconds)
  tenant_id: string;          // Tenant identifier
  integration: string;         // Integration/repo name (e.g., "ciq-automations")
  pack: string;                // Pack name (e.g., "iam", "domain", "webhooks")
  action: string;              // Action name (e.g., "domain.publishers.create")
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;                // key_prefix for API keys, user_id for users
    api_key_id?: string;       // UUID if actor is API key
  };
  request_hash: string;       // SHA-256 hash of canonical JSON of sanitized request
  status: 'success' | 'error' | 'denied';
  
  // Optional
  policy_decision_id?: string; // UUID from platform /authorize response
  result_meta?: {
    resource_type?: string;    // e.g., "campaign", "order"
    resource_id?: string;      // e.g., "123", "campaign_abc"
    count?: number;            // For list operations
    ids_created?: string[];    // For create operations
    diff_hash?: string;        // SHA-256 of before/after diff
  };
  run_id?: string;             // UUID for multi-step agent runs
  correlation_id?: string;     // Thread/trace ID across services
  node_id?: string;            // Executor identifier (repo instance/worker)
  latency_ms?: number;         // Request processing time
  error_code?: string;          // Error code (e.g., "VALIDATION_ERROR")
  error_message_redacted?: string; // Sanitized error message (string, not object)
  idempotency_key?: string;    // For safe retries
  policy_version?: string;     // Policy version/hash (for platform)
  ip_address?: string;         // Client IP
  dry_run?: boolean;           // Was this a dry-run?
}

export interface AuditAdapter {
  /**
   * Write an audit event (new unified format)
   * 
   * This is the preferred method. All new code should use this.
   */
  logEvent(event: AuditEvent): Promise<void>;
  
  /**
   * Write an audit log entry (legacy format)
   * 
   * @deprecated Use logEvent() instead. This is kept for backward compatibility.
   */
  log(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  tenantId: string;
  actorType: 'api_key' | 'user' | 'system';
  actorId: string;
  apiKeyId?: string;
  action: string;
  requestId: string;
  payloadHash?: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  impact?: ImpactShape;
  result: 'success' | 'denied' | 'error';
  errorMessage?: string;
  ipAddress?: string;
  idempotencyKey?: string;
  dryRun: boolean;
}

export interface IdempotencyAdapter {
  /**
   * Get cached response for idempotency key
   */
  getReplay(tenantId: string, action: string, idempotencyKey: string): Promise<any | null>;
  
  /**
   * Store response for idempotency key
   */
  storeReplay(tenantId: string, action: string, idempotencyKey: string, response: any): Promise<void>;
}

export interface RateLimitAdapter {
  /**
   * Check rate limit and increment counter
   * Returns whether request is allowed and current count
   */
  check(apiKeyId: string, action: string, limit: number): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
  }>;
}

export interface CeilingsAdapter {
  /**
   * Check if action would exceed hard ceiling
   * Throws if ceiling would be breached
   */
  check(action: string, params: Record<string, any>, tenantId: string): Promise<void>;
  
  /**
   * Get current usage for a ceiling
   */
  getUsage(ceilingName: string, tenantId: string, period?: string): Promise<number>;
}

export interface ImpactShape {
  creates: Array<{
    type: string;
    count: number;
    details?: Record<string, any>;
  }>;
  updates: Array<{
    type: string;
    id: string;
    fields: string[];
    details?: Record<string, any>;
  }>;
  deletes: Array<{
    type: string;
    count: number;
    details?: Record<string, any>;
  }>;
  side_effects: Array<{
    type: string;
    count: number;
    details?: Record<string, any>;
  }>;
  risk: 'low' | 'medium' | 'high';
  warnings: string[];
  estimated_cost?: number;
  requires_approval?: boolean;
}

export interface KernelConfig {
  dbAdapter: DbAdapter;
  auditAdapter: AuditAdapter;
  idempotencyAdapter: IdempotencyAdapter;
  rateLimitAdapter: RateLimitAdapter;
  ceilingsAdapter: CeilingsAdapter;
  bindings: Bindings;
  packs: string[];
  actionScopeMap: Record<string, string>;
  actionHandlers: Record<string, ActionHandler>;
}
