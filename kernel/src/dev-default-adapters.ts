/**
 * In-memory default adapters for installer/bootstrap (TGA-192).
 * Safe for local smoke tests; replace with real persistence before production.
 */

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
} from './types';

function newId(prefix: string): string {
  const u = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${prefix}_${u}`;
}

export class DevDefaultDbAdapter implements DbAdapter {
  private apiKeysById = new Map<string, ApiKey>();
  private webhooksById = new Map<string, Webhook>();
  private teamById = new Map<string, TeamMember>();
  private settingsByTenant = new Map<string, Record<string, unknown>>();

  async query<T = any>(_sql: string, _params?: any[]): Promise<T[]> {
    return [] as T[];
  }

  async queryOne<T = any>(_sql: string, _params?: any[]): Promise<T | null> {
    return null;
  }

  async execute(_sql: string, _params?: any[]): Promise<number> {
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
    const row = this.apiKeysById.get(apiKeyId);
    return row?.tenant_id ?? null;
  }

  async isPlatformAdmin(_tenantId: string): Promise<boolean> {
    return false;
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    return [...this.apiKeysById.values()].filter((k) => k.tenant_id === tenantId && !k.revoked_at);
  }

  async getApiKey(tenantId: string, keyId: string): Promise<ApiKey | null> {
    const k = this.apiKeysById.get(keyId);
    if (!k || k.tenant_id !== tenantId) return null;
    return k;
  }

  async createApiKey(tenantId: string, data: CreateApiKeyData): Promise<ApiKey> {
    const id = newId('key');
    const row: ApiKey = {
      id,
      tenant_id: tenantId,
      key_prefix: 'dev_',
      name: data.name,
      scopes: data.scopes,
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
    };
    this.apiKeysById.set(id, row);
    return row;
  }

  async updateApiKey(tenantId: string, keyId: string, data: UpdateApiKeyData): Promise<ApiKey> {
    const existing = await this.getApiKey(tenantId, keyId);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    const next: ApiKey = {
      ...existing,
      name: data.name ?? existing.name,
      scopes: data.scopes ?? existing.scopes,
      expires_at: data.expires_at ?? existing.expires_at,
    };
    this.apiKeysById.set(keyId, next);
    return next;
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<void> {
    const existing = await this.getApiKey(tenantId, keyId);
    if (!existing) return;
    this.apiKeysById.set(keyId, {
      ...existing,
      revoked_at: new Date().toISOString(),
    });
  }

  async listTeamMembers(tenantId: string): Promise<TeamMember[]> {
    return [...this.teamById.values()].filter((m) => m.tenant_id === tenantId);
  }

  async inviteTeamMember(tenantId: string, data: InviteTeamMemberData): Promise<TeamMember> {
    const id = newId('member');
    const row: TeamMember = {
      id,
      tenant_id: tenantId,
      email: data.email,
      role: data.role,
      invited_at: new Date().toISOString(),
    };
    this.teamById.set(id, row);
    return row;
  }

  async listWebhooks(tenantId: string): Promise<Webhook[]> {
    return [...this.webhooksById.values()].filter((w) => w.tenant_id === tenantId);
  }

  async getWebhook(tenantId: string, webhookId: string): Promise<Webhook | null> {
    const w = this.webhooksById.get(webhookId);
    if (!w || w.tenant_id !== tenantId) return null;
    return w;
  }

  async createWebhook(tenantId: string, data: CreateWebhookData): Promise<Webhook> {
    const id = newId('wh');
    const now = new Date().toISOString();
    const row: Webhook = {
      id,
      tenant_id: tenantId,
      url: data.url,
      events: data.events,
      secret: data.secret,
      active: true,
      created_at: now,
      updated_at: now,
    };
    this.webhooksById.set(id, row);
    return row;
  }

  async updateWebhook(tenantId: string, webhookId: string, data: UpdateWebhookData): Promise<Webhook> {
    const existing = await this.getWebhook(tenantId, webhookId);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    const now = new Date().toISOString();
    const next: Webhook = {
      ...existing,
      url: data.url ?? existing.url,
      events: data.events ?? existing.events,
      secret: data.secret ?? existing.secret,
      active: data.active !== undefined ? data.active : existing.active,
      updated_at: now,
    };
    this.webhooksById.set(webhookId, next);
    return next;
  }

  async deleteWebhook(tenantId: string, webhookId: string): Promise<void> {
    const w = await this.getWebhook(tenantId, webhookId);
    if (w) this.webhooksById.delete(webhookId);
  }

  async listWebhookDeliveries(
    _tenantId: string,
    _webhookId: string,
    _limit?: number,
  ): Promise<WebhookDelivery[]> {
    return [];
  }

  async getSettings(tenantId: string): Promise<Record<string, any>> {
    return { ...(this.settingsByTenant.get(tenantId) ?? {}) };
  }

  async updateSettings(tenantId: string, data: Record<string, any>): Promise<Record<string, any>> {
    const prev = this.settingsByTenant.get(tenantId) ?? {};
    const next = { ...prev, ...data };
    this.settingsByTenant.set(tenantId, next);
    return next;
  }
}

export class DevDefaultAuditAdapter implements AuditAdapter {
  async logEvent(_event: AuditEvent): Promise<void> {}

  async log(_entry: AuditEntry): Promise<void> {}
}

export class DevDefaultIdempotencyAdapter implements IdempotencyAdapter {
  private readonly cache = new Map<string, unknown>();

  async getReplay(tenantId: string, action: string, idempotencyKey: string): Promise<any | null> {
    const key = `${tenantId}:${action}:${idempotencyKey}`;
    return this.cache.has(key) ? this.cache.get(key) : null;
  }

  async storeReplay(
    tenantId: string,
    action: string,
    idempotencyKey: string,
    response: any,
  ): Promise<void> {
    const key = `${tenantId}:${action}:${idempotencyKey}`;
    this.cache.set(key, response);
  }
}

export class DevDefaultRateLimitAdapter implements RateLimitAdapter {
  private readonly counts = new Map<string, number>();

  async check(
    apiKeyId: string,
    action: string,
    limit: number,
  ): Promise<{ allowed: boolean; limit: number; remaining: number }> {
    const key = `${apiKeyId}:${action}`;
    const current = this.counts.get(key) ?? 0;
    const allowed = current < limit;
    if (allowed) {
      this.counts.set(key, current + 1);
    }
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - current - (allowed ? 1 : 0)),
    };
  }
}

export class DevDefaultCeilingsAdapter implements CeilingsAdapter {
  async check(_action: string, _params: Record<string, any>, _tenantId: string): Promise<void> {}

  async getUsage(_ceilingName: string, _tenantId: string, _period?: string): Promise<number> {
    return 0;
  }
}
