/**
 * Audit event emission to Repo B
 * 
 * Logs all execution attempts (allowed and denied)
 * Includes decision metadata
 */

import { Actor } from './types.ts';
import type { ControlPlaneAdapter, AuthorizationResponse, AuditEvent } from './kernel-bridge.ts';
import { HttpAuditAdapter, hashPayload, sanitize } from './kernel-bridge.ts';

/**
 * Create audit event for MCP operation
 * Converts gateway audit format to kernel AuditEvent format
 */
export async function createAuditEvent(
  tenantId: string,
  action: string,
  decision: 'allow' | 'deny' | 'require_approval',
  actor: Actor,
  metadata: {
    decision_id?: string;
    policy_id?: string;
    reason?: string;
    request_payload?: any;
    error_code?: string;
    error_message?: string;
  }
): Promise<AuditEvent> {
  const startTime = Date.now();
  const endTime = Date.now();
  
  // Hash request payload (sanitized)
  const request_hash = await hashPayload(metadata.request_payload || {});
  
  // Extract pack from action (e.g., "tool:amazon.order" -> "mcp")
  const pack = 'mcp';
  
  return {
    event_id: crypto.randomUUID(),
    event_version: 1,
    schema_version: 1,
    ts: endTime,
    tenant_id: tenantId,
    integration: 'mcp-gateway',
    pack,
    action,
    actor: {
      type: actor.type,
      id: actor.id,
      api_key_id: actor.api_key_id,
    },
    request_hash,
    status: decision === 'allow' ? 'success' : decision === 'deny' ? 'denied' : 'error',
    policy_decision_id: metadata.decision_id,
    policy_version: metadata.policy_id ? '1.0.0' : undefined,
    error_code: metadata.error_code,
    error_message_redacted: metadata.reason || metadata.error_message,
    latency_ms: endTime - startTime,
  };
}

/**
 * Emit audit event to Repo B
 * 
 * Uses HttpAuditAdapter to send events to Governance Hub
 * Fails silently if audit emission fails (don't block execution)
 */
export async function emitAuditEvent(
  event: AuditEvent,
  platformUrl: string,
  kernelApiKey: string
): Promise<void> {
  try {
    const auditAdapter = new HttpAuditAdapter({
      platformUrl,
      kernelApiKey,
    });
    
    await auditAdapter.logEvent(event);
  } catch (error) {
    // Fail silently - don't block execution if audit fails
    console.error('[AUDIT] Failed to emit audit event:', error);
  }
}

/**
 * Emit audit event for authorization decision
 */
export async function emitAuthorizationAudit(
  tenantId: string,
  action: string,
  decision: AuthorizationResponse,
  actor: Actor,
  platformUrl: string,
  kernelApiKey: string,
  requestPayload?: any
): Promise<void> {
  const event = await createAuditEvent(
    tenantId,
    action,
    decision.decision,
    actor,
    {
      decision_id: decision.decision_id,
      policy_id: decision.policy_id,
      reason: decision.reason,
      request_payload: requestPayload,
    }
  );

  await emitAuditEvent(event, platformUrl, kernelApiKey);
}
