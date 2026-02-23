/**
 * Unified audit event emission
 * 
 * Single source of truth for all audit logging.
 * Enforces schema, sanitization, and hashing.
 */

import { AuditAdapter, AuditEvent, Bindings } from './types.ts';
import { sanitize, canonicalJson, redactString } from './sanitize.ts';
import { hashPayload } from './audit.ts';

/**
 * Extract pack name from action
 * 
 * Examples:
 * - "domain.publishers.create" -> "domain"
 * - "iam.keys.list" -> "iam"
 * - "webhooks.create" -> "webhooks"
 */
export function extractPack(action: string): string {
  const parts = action.split('.');
  return parts[0] || 'unknown';
}

export interface AuditEventContext {
  tenant_id: string;
  integration: string;  // From bindings
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
    api_key_id?: string;
  };
  action: string;
  request_payload: any;  // Will be sanitized and hashed, NOT persisted
  status: 'success' | 'error' | 'denied';
  start_time?: number;  // For latency calculation
}

export interface AuditEventOptions {
  pack?: string;  // Auto-derived if not provided
  policy_decision_id?: string;
  result_meta?: AuditEvent['result_meta'];
  run_id?: string;
  correlation_id?: string;
  node_id?: string;
  error_code?: string;
  error_message?: string;  // Will be redacted
  idempotency_key?: string;
  policy_version?: string;
  ip_address?: string;
  dry_run?: boolean;
}

/**
 * Emit a unified audit event
 * 
 * This is the ONLY way to log audit events. All other logging is forbidden.
 * 
 * CRITICAL: Audit logging is "best effort" - failures should not break requests.
 * If the adapter fails, the error is logged but not thrown.
 * 
 * @param adapter - Audit adapter
 * @param ctx - Event context (tenant, integration, actor, action, etc.)
 * @param options - Optional fields
 */
export async function emitAuditEvent(
  adapter: AuditAdapter,
  ctx: AuditEventContext,
  options: AuditEventOptions = {}
): Promise<void> {
  try {
    // 1. Generate event_id using crypto.randomUUID() (works in modern runtimes)
    const event_id = crypto.randomUUID();
    
    // 2. Get timestamp
    const ts = Date.now();
    
    // 3. Derive pack if not provided
    const pack = options.pack || extractPack(ctx.action);
    
    // 4. Hash request payload using shared hashPayload function (sanitize + canonical JSON + SHA-256)
    const request_hash = await hashPayload(ctx.request_payload);
    
    // 5. Redact error message (string, not object)
    const error_message_redacted = ctx.status === 'error' && options.error_message
      ? redactString(options.error_message)
      : undefined;
    
    // 6. Calculate latency if start_time provided
    const latency_ms = ctx.start_time ? ts - ctx.start_time : undefined;
    
    // 7. Build complete event (DO NOT include request_payload - only hash)
    const event: AuditEvent = {
      event_id,
      event_version: 1,
      schema_version: 1,  // Event schema version (for future migrations)
      ts,
      tenant_id: ctx.tenant_id,
      integration: ctx.integration,
      pack,
      action: ctx.action,
      actor: ctx.actor,
      request_hash,
      status: ctx.status,
      ...(options.policy_decision_id && { policy_decision_id: options.policy_decision_id }),
      ...(options.result_meta && { result_meta: options.result_meta }),
      ...(options.run_id && { run_id: options.run_id }),
      ...(options.correlation_id && { correlation_id: options.correlation_id }),
      ...(options.node_id && { node_id: options.node_id }),
      ...(latency_ms !== undefined && { latency_ms }),
      ...(options.error_code && { error_code: options.error_code }),
      ...(error_message_redacted && { error_message_redacted }),
      ...(options.idempotency_key && { idempotency_key: options.idempotency_key }),
      ...(options.policy_version && { policy_version: options.policy_version }),
      ...(options.ip_address && { ip_address: options.ip_address }),
      ...(options.dry_run !== undefined && { dry_run: options.dry_run }),
    };
    
    // 8. Emit via adapter (use logEvent, not log)
    // CRITICAL: Wrap in try/catch - audit failures should not break requests
    await adapter.logEvent(event);
  } catch (error) {
    // Audit logging is "best effort" - log error but don't throw
    // This prevents audit adapter failures from breaking the request flow
    console.error('[Audit] Failed to emit audit event:', {
      error: error instanceof Error ? error.message : String(error),
      action: ctx.action,
      tenant_id: ctx.tenant_id,
      integration: ctx.integration,
    });
    
    // Optionally: Emit to error tracking service (Sentry, etc.) if available
    // This ensures audit failures are still visible for debugging
  }
}
