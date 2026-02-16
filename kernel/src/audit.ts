/**
 * Audit logging utilities
 */

import { AuditAdapter, AuditEntry } from './types';
import { sanitize, canonicalJson } from './sanitize';

export async function logAudit(
  adapter: AuditAdapter,
  entry: AuditEntry
): Promise<void> {
  await adapter.log(entry);
}

export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `req_${timestamp}_${random}`;
}

/**
 * Hash payload for audit trail (tamper-evident, dedupe, correlation)
 * 
 * Uses SHA-256 on canonical JSON of sanitized payload.
 * Sanitization removes sensitive fields (API keys, tokens, etc.) before hashing.
 * 
 * IMPORTANT: Uses canonical JSON (sorted keys) for stable hashes.
 * 
 * @param payload - Request payload to hash
 * @returns SHA-256 hash as hex string
 */
export async function hashPayload(payload: any): Promise<string> {
  // 1. Sanitize to remove sensitive fields
  const sanitized = sanitize(payload);
  
  // 2. Canonical JSON (deterministic, sorted keys) - CRITICAL for stable hashes
  const canonical = canonicalJson(sanitized);
  
  // 3. SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hash;
}
