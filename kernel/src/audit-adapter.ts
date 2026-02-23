/**
 * AuditAdapter implementations for sending audit events to external services
 */

import { AuditAdapter, AuditEvent, AuditEntry } from './types.ts';
import { extractPack } from './audit-event.ts';

/**
 * HTTP implementation of AuditAdapter
 *
 * POSTs audit events to Repo B (governance-hub) audit-ingest endpoint.
 * Uses same auth as ControlPlaneAdapter (Bearer token - typically a Supabase JWT
 * or kernel API key that the platform trusts).
 *
 * Env vars: PLATFORM_URL, KERNEL_API_KEY (or equivalent)
 */
export class HttpAuditAdapter implements AuditAdapter {
  private platformUrl: string;
  private kernelApiKey: string;

  constructor(config: { platformUrl: string; kernelApiKey: string }) {
    this.platformUrl = config.platformUrl.replace(/\/$/, '');
    this.kernelApiKey = config.kernelApiKey;
  }

  async logEvent(event: AuditEvent): Promise<void> {
    const url = `${this.platformUrl}/functions/v1/audit-ingest`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.kernelApiKey}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      // Audit is best-effort; log but don't throw
      console.error('[HttpAuditAdapter] audit-ingest failed:', {
        status: response.status,
        statusText: response.statusText,
        event_id: event.event_id,
        action: event.action,
      });
    }
  }

  /**
   * @deprecated Use logEvent() instead. Converts legacy AuditEntry to AuditEvent and POSTs.
   */
  async log(entry: AuditEntry): Promise<void> {
    const event: AuditEvent = {
      event_id: crypto.randomUUID(),
      event_version: 1,
      schema_version: 1,
      ts: Date.now(),
      tenant_id: entry.tenantId,
      integration: 'unknown',
      pack: extractPack(entry.action),
      action: entry.action,
      actor: {
        type: entry.actorType,
        id: entry.actorId,
        ...(entry.apiKeyId && { api_key_id: entry.apiKeyId }),
      },
      request_hash: entry.payloadHash ?? '',
      status: entry.result,
      ...(entry.errorMessage && { error_message_redacted: entry.errorMessage }),
      ...(entry.ipAddress && { ip_address: entry.ipAddress }),
      ...(entry.idempotencyKey && { idempotency_key: entry.idempotencyKey }),
      dry_run: entry.dryRun,
    };
    await this.logEvent(event);
  }
}
