/**
 * Supabase (Deno Edge) — PostgREST-backed adapters aligned with Echelon SQL migrations.
 * Copied to control_plane/adapters/index.ts by the installer (do not edit in the kit; edit the template).
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with RLS policies).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type {
  ApiKey,
  AuditAdapter,
  AuditEntry,
  AuditEvent,
  CeilingsAdapter,
  CreateApiKeyData,
  CreateWebhookData,
  DbAdapter,
  IdempotencyAdapter,
  InviteTeamMemberData,
  RateLimitAdapter,
  TeamMember,
  Transaction,
  UpdateApiKeyData,
  UpdateWebhookData,
  Webhook,
  WebhookDelivery,
} from '../kernel/src/types.ts';

export const ECHELON_ADAPTER_SURFACE = 'supabase_postgrest_durable' as const;

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('Echelon Supabase adapters require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).');
  }
  _client = createClient(url, key);
  return _client;
}

function mapApiKey(row: Record<string, unknown>): ApiKey {
  const scopes = row.scopes;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    key_prefix: String(row.prefix ?? ''),
    name: row.name != null ? String(row.name) : undefined,
    scopes: Array.isArray(scopes) ? (scopes as string[]) : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
    expires_at: row.expires_at != null ? String(row.expires_at) : undefined,
    revoked_at: row.revoked_at != null ? String(row.revoked_at) : undefined,
    last_used_at: row.last_used_at != null ? String(row.last_used_at) : undefined,
  };
}

function mapWebhook(row: Record<string, unknown>): Webhook {
  const events = row.events;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    url: String(row.url),
    events: Array.isArray(events) ? (events as string[]) : [],
    secret: row.secret != null ? String(row.secret) : undefined,
    active: Boolean(row.active),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapTeam(row: Record<string, unknown>): TeamMember {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    email: String(row.email),
    role: String(row.role),
    invited_at: String(row.invited_at ?? new Date().toISOString()),
    joined_at: row.joined_at != null ? String(row.joined_at) : undefined,
  };
}

function placeholderKeyHash(): string {
  return `echelon_${crypto.randomUUID().replace(/-/g, '')}`;
}

function rateWindowBucket(): string {
  return new Date().toISOString().slice(0, 16);
}

export class SupabaseDbAdapter implements DbAdapter {
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getSupabase();
  }

  async query<T = unknown>(_sql: string, _params?: unknown[]): Promise<T[]> {
    console.warn(
      '[Echelon] SupabaseDbAdapter.query: arbitrary SQL is not supported via PostgREST; use pack methods or add a Postgres RPC.',
    );
    return [];
  }

  async queryOne<T = unknown>(_sql: string, _params?: unknown[]): Promise<T | null> {
    return null;
  }

  async execute(_sql: string, _params?: unknown[]): Promise<number> {
    console.warn('[Echelon] SupabaseDbAdapter.execute: not supported without a server-side RPC.');
    return 0;
  }

  async beginTransaction(): Promise<Transaction> {
    return {
      commit: async () => {},
      rollback: async () => {},
      query: async () => [],
      queryOne: async () => null,
      execute: async () => 0,
    };
  }

  async getTenantFromApiKey(apiKeyId: string): Promise<string | null> {
    const { data, error } = await this.sb.from('api_keys').select('tenant_id').eq('id', apiKeyId).maybeSingle();
    if (error) throw error;
    const row = data as Record<string, unknown> | null;
    return row?.tenant_id != null ? String(row.tenant_id) : null;
  }

  async isPlatformAdmin(_tenantId: string): Promise<boolean> {
    return false;
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    const { data, error } = await this.sb
      .from('api_keys')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('revoked_at', null);
    if (error) throw error;
    return (data as Record<string, unknown>[]).map(mapApiKey);
  }

  async getApiKey(tenantId: string, keyId: string): Promise<ApiKey | null> {
    const { data, error } = await this.sb
      .from('api_keys')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', keyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapApiKey(data as Record<string, unknown>);
  }

  async createApiKey(tenantId: string, data: CreateApiKeyData): Promise<ApiKey> {
    const row = {
      tenant_id: tenantId,
      prefix: 'dev_',
      key_hash: placeholderKeyHash(),
      name: data.name ?? null,
      scopes: data.scopes,
      expires_at: data.expires_at ?? null,
    };
    const { data: inserted, error } = await this.sb.from('api_keys').insert(row).select('*').single();
    if (error) throw error;
    return mapApiKey(inserted as Record<string, unknown>);
  }

  async updateApiKey(tenantId: string, keyId: string, data: UpdateApiKeyData): Promise<ApiKey> {
    const existing = await this.getApiKey(tenantId, keyId);
    if (!existing) throw new Error('NOT_FOUND');
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.scopes !== undefined) patch.scopes = data.scopes;
    if (data.expires_at !== undefined) patch.expires_at = data.expires_at;
    const { data: updated, error } = await this.sb
      .from('api_keys')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', keyId)
      .select('*')
      .single();
    if (error) throw error;
    return mapApiKey(updated as Record<string, unknown>);
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<void> {
    const { error } = await this.sb
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', keyId);
    if (error) throw error;
  }

  async listTeamMembers(tenantId: string): Promise<TeamMember[]> {
    const { data, error } = await this.sb.from('echelon_team_members').select('*').eq('tenant_id', tenantId);
    if (error) throw error;
    return (data as Record<string, unknown>[]).map(mapTeam);
  }

  async inviteTeamMember(tenantId: string, data: InviteTeamMemberData): Promise<TeamMember> {
    const row = {
      tenant_id: tenantId,
      email: data.email,
      role: data.role,
      invited_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await this.sb.from('echelon_team_members').insert(row).select('*').single();
    if (error) throw error;
    return mapTeam(inserted as Record<string, unknown>);
  }

  async listWebhooks(tenantId: string): Promise<Webhook[]> {
    const { data, error } = await this.sb.from('echelon_webhooks').select('*').eq('tenant_id', tenantId);
    if (error) throw error;
    return (data as Record<string, unknown>[]).map(mapWebhook);
  }

  async getWebhook(tenantId: string, webhookId: string): Promise<Webhook | null> {
    const { data, error } = await this.sb
      .from('echelon_webhooks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', webhookId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapWebhook(data as Record<string, unknown>);
  }

  async createWebhook(tenantId: string, data: CreateWebhookData): Promise<Webhook> {
    const now = new Date().toISOString();
    const row = {
      tenant_id: tenantId,
      url: data.url,
      events: data.events,
      secret: data.secret ?? null,
      active: true,
      created_at: now,
      updated_at: now,
    };
    const { data: inserted, error } = await this.sb.from('echelon_webhooks').insert(row).select('*').single();
    if (error) throw error;
    return mapWebhook(inserted as Record<string, unknown>);
  }

  async updateWebhook(tenantId: string, webhookId: string, data: UpdateWebhookData): Promise<Webhook> {
    const existing = await this.getWebhook(tenantId, webhookId);
    if (!existing) throw new Error('NOT_FOUND');
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (data.url !== undefined) patch.url = data.url;
    if (data.events !== undefined) patch.events = data.events;
    if (data.secret !== undefined) patch.secret = data.secret;
    if (data.active !== undefined) patch.active = data.active;
    const { data: updated, error } = await this.sb
      .from('echelon_webhooks')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', webhookId)
      .select('*')
      .single();
    if (error) throw error;
    return mapWebhook(updated as Record<string, unknown>);
  }

  async deleteWebhook(tenantId: string, webhookId: string): Promise<void> {
    const { error } = await this.sb.from('echelon_webhooks').delete().eq('tenant_id', tenantId).eq('id', webhookId);
    if (error) throw error;
  }

  async listWebhookDeliveries(
    _tenantId: string,
    _webhookId: string,
    _limit?: number,
  ): Promise<WebhookDelivery[]> {
    return [];
  }

  async getSettings(tenantId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.sb.from('echelon_tenant_settings').select('data').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    const row = data as { data?: Record<string, unknown> } | null;
    return row?.data && typeof row.data === 'object' ? { ...row.data } : {};
  }

  async updateSettings(tenantId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prev = await this.getSettings(tenantId);
    const next = { ...prev, ...data };
    const { error } = await this.sb.from('echelon_tenant_settings').upsert(
      { tenant_id: tenantId, data: next, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
    if (error) throw error;
    return next;
  }
}

export class SupabaseAuditAdapter implements AuditAdapter {
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getSupabase();
  }

  async logEvent(event: AuditEvent): Promise<void> {
    const { error } = await this.sb.from('audit_log').insert({
      tenant_id: event.tenant_id,
      actor_type: event.actor.type,
      actor_id: event.actor.id,
      action: event.action,
      request_id: event.event_id,
      result: event.status,
      dry_run: event.dry_run ?? false,
      error_message: event.error_message_redacted ?? null,
    });
    if (error) throw error;
  }

  async log(entry: AuditEntry): Promise<void> {
    const { error } = await this.sb.from('audit_log').insert({
      tenant_id: entry.tenantId,
      actor_type: entry.actorType,
      actor_id: entry.actorId,
      action: entry.action,
      request_id: entry.requestId,
      result: entry.result,
      dry_run: entry.dryRun,
      error_message: entry.errorMessage ?? null,
      ip_address: entry.ipAddress ?? null,
    });
    if (error) throw error;
  }
}

export class SupabaseIdempotencyAdapter implements IdempotencyAdapter {
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getSupabase();
  }

  async getReplay(tenantId: string, action: string, idempotencyKey: string): Promise<unknown | null> {
    const { data, error } = await this.sb
      .from('echelon_idempotency')
      .select('response')
      .eq('tenant_id', tenantId)
      .eq('action', action)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    const row = data as { response?: unknown } | null;
    return row?.response ?? null;
  }

  async storeReplay(
    tenantId: string,
    action: string,
    idempotencyKey: string,
    response: unknown,
  ): Promise<void> {
    const { error } = await this.sb.from('echelon_idempotency').upsert(
      {
        tenant_id: tenantId,
        action,
        idempotency_key: idempotencyKey,
        response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,action,idempotency_key' },
    );
    if (error) throw error;
  }
}

export class SupabaseRateLimitAdapter implements RateLimitAdapter {
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getSupabase();
  }

  async check(
    apiKeyId: string,
    action: string,
    limit: number,
  ): Promise<{ allowed: boolean; limit: number; remaining: number }> {
    const bucket = rateWindowBucket();
    const { data: row, error: selErr } = await this.sb
      .from('echelon_rate_counters')
      .select('count')
      .eq('api_key_id', apiKeyId)
      .eq('action', action)
      .eq('window_bucket', bucket)
      .maybeSingle();
    if (selErr) throw selErr;
    const current = (row as { count?: number } | null)?.count ?? 0;
    if (current >= limit) {
      return { allowed: false, limit, remaining: 0 };
    }
    const next = current + 1;
    const { error: upErr } = await this.sb.from('echelon_rate_counters').upsert(
      {
        api_key_id: apiKeyId,
        action,
        window_bucket: bucket,
        count: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'api_key_id,action,window_bucket' },
    );
    if (upErr) throw upErr;
    return { allowed: true, limit, remaining: Math.max(0, limit - next) };
  }
}

export class SupabaseCeilingsAdapter implements CeilingsAdapter {
  async check(_action: string, _params: Record<string, unknown>, _tenantId: string): Promise<void> {}

  async getUsage(_ceilingName: string, _tenantId: string, _period?: string): Promise<number> {
    return 0;
  }
}

export function createAdapters() {
  const sb = getSupabase();
  return {
    dbAdapter: new SupabaseDbAdapter(sb),
    auditAdapter: new SupabaseAuditAdapter(sb),
    idempotencyAdapter: new SupabaseIdempotencyAdapter(sb),
    rateLimitAdapter: new SupabaseRateLimitAdapter(sb),
    ceilingsAdapter: new SupabaseCeilingsAdapter(),
  };
}
