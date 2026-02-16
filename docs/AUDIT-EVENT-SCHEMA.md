# Unified Audit Event Schema

## Overview

This document defines the unified audit event schema for the Agentic Control Plane Kit. All audit events must conform to this schema to ensure consistency, traceability, and security.

## Design Principles

1. **Single Source of Truth**: One `emitAuditEvent()` helper used everywhere
2. **No Raw Logging**: Forbid any "raw request logging" outside the helper
3. **Backward Compatible**: Extends existing `AuditEntry` interface
4. **Security First**: All sensitive data sanitized before logging

---

## Schema Definition

### Required Fields (v1)

```typescript
interface AuditEvent {
  // Identity & Timestamp
  event_id: string;           // UUID v4 - unique event identifier
  event_version: number;      // Schema version (currently 1)
  schema_version: number;     // Event schema version (currently 1) - for future migrations
  ts: number;                  // Unix timestamp (milliseconds)
  
  // Context
  tenant_id: string;          // Tenant identifier
  integration: string;         // Integration/repo name (e.g., "ciq-automations", "lead-scoring")
  pack: string;                // Pack name (e.g., "iam", "domain", "webhooks")
  action: string;              // Action name (e.g., "domain.publishers.create")
  
  // Actor
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;                // key_prefix for API keys, user_id for users
    api_key_id?: string;       // UUID if actor is API key
  };
  
  // Request
  request_hash: string;        // SHA-256 hash of sanitized request payload
  
  // Policy (if platform integrated)
  policy_decision_id?: string; // UUID from platform /authorize response
  
  // Outcome
  status: 'success' | 'error' | 'denied';
  result_meta?: {              // Structured result metadata
    resource_type?: string;    // e.g., "campaign", "order"
    resource_id?: string;    // e.g., "123", "campaign_abc"
    count?: number;            // For list operations
    ids_created?: string[];    // For create operations
    diff_hash?: string;        // SHA-256 of before/after diff
  };
}
```

### Optional Fields (High Leverage)

```typescript
interface AuditEvent {
  // ... required fields above ...
  
  // Correlation & Tracing
  run_id?: string;             // UUID for multi-step agent runs
  correlation_id?: string;     // Thread/trace ID across services
  node_id?: string;            // Executor identifier (repo instance/worker)
  
  // Performance
  latency_ms?: number;          // Request processing time
  
  // Error Details (only if status === 'error')
  error_code?: string;          // Error code (e.g., "VALIDATION_ERROR")
  error_message_redacted?: string; // Sanitized error message
  
  // Safety & Replay
  idempotency_key?: string;     // For safe retries
  policy_version?: string;      // Policy version/hash (for platform)
  
  // Additional Context
  ip_address?: string;          // Client IP
  dry_run?: boolean;            // Was this a dry-run?
}
```

---

## Migration from Current Schema

### Current `AuditEntry` → New `AuditEvent`

| Current Field | New Field | Notes |
|--------------|-----------|-------|
| `tenantId` | `tenant_id` | Snake case |
| `actorType` | `actor.type` | Nested in actor object |
| `actorId` | `actor.id` | Nested in actor object |
| `apiKeyId` | `actor.api_key_id` | Nested in actor object |
| `action` | `action` | Same |
| `requestId` | `event_id` | Renamed for clarity |
| `payloadHash` | `request_hash` | Renamed for clarity |
| `result` | `status` | Renamed for clarity |
| `errorMessage` | `error_message_redacted` | Must be sanitized |
| `idempotencyKey` | `idempotency_key` | Snake case |
| `dryRun` | `dry_run` | Snake case |
| `ipAddress` | `ip_address` | Snake case |
| - | `integration` | **NEW** - Required |
| - | `pack` | **NEW** - Required |
| - | `ts` | **NEW** - Required |
| - | `policy_decision_id` | **NEW** - Optional but recommended |
| - | `result_meta` | **NEW** - Optional but recommended |

---

## Implementation

### Single `emitAuditEvent()` Helper

```typescript
// kernel/src/audit.ts

import { v4 as uuidv4 } from 'uuid';
import { sanitize, canonicalJson } from './sanitize';
import { hashPayload } from './audit';

export interface AuditEvent {
  // Required
  event_id: string;
  ts: number;
  tenant_id: string;
  integration: string;
  pack: string;
  action: string;
  actor: {
    type: 'api_key' | 'user' | 'system';
    id: string;
    api_key_id?: string;
  };
  request_hash: string;
  status: 'success' | 'error' | 'denied';
  
  // Optional
  policy_decision_id?: string;
  result_meta?: {
    resource_type?: string;
    resource_id?: string;
    count?: number;
    ids_created?: string[];
    diff_hash?: string;
  };
  run_id?: string;
  correlation_id?: string;
  node_id?: string;
  latency_ms?: number;
  error_code?: string;
  error_message_redacted?: string;
  idempotency_key?: string;
  policy_version?: string;
  ip_address?: string;
  dry_run?: boolean;
}

export async function emitAuditEvent(
  adapter: AuditAdapter,
  ctx: AuditEventContext,
  options: AuditEventOptions = {}
): Promise<void> {
  // 1. Generate event_id using crypto.randomUUID() (works in modern runtimes)
  const event_id = crypto.randomUUID();
  
  // 2. Get timestamp
  const ts = Date.now();
  
  // 3. Derive pack if not provided
  const pack = options.pack || extractPack(ctx.action);
  
  // 4. Sanitize and hash request payload (canonical JSON)
  const sanitized_payload = sanitize(ctx.request_payload);
  const canonical_payload = canonicalJson(sanitized_payload);
  const request_hash = await sha256(canonical_payload);
  
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
    integration: ctx.integration,  // From bindings/context
    pack,
    action: ctx.action,
    actor: ctx.actor,
    request_hash,
    status: ctx.status,
    // ... optional fields
  };
  
  // 8. Emit via adapter (use logEvent, not log)
  // CRITICAL: Wrapped in try/catch - audit failures should not break requests
  try {
    await adapter.logEvent(event);
  } catch (error) {
    // Audit logging is "best effort" - log error but don't throw
    console.error('[Audit] Failed to emit audit event:', error);
  }
}
```

### Usage Example

```typescript
// Before (old way - multiple places, inconsistent)
await logAudit(auditAdapter, {
  tenantId: tenantId,
  actorType: 'api_key',
  actorId: keyPrefix,
  action: 'domain.publishers.create',
  requestId: requestId,
  result: 'success',
  // ... many fields
});

// After (new way - single helper, consistent)
const startTime = Date.now();
await emitAuditEvent(auditAdapter, {
  tenant_id: tenantId,
  integration: bindings.integration,  // From bindings (auto)
  actor: {
    type: 'api_key',
    id: keyPrefix,
    api_key_id: apiKeyId,
  },
  action: 'domain.publishers.create',
  request_payload: req,  // Will be sanitized and hashed, NOT persisted
  status: 'success',
  start_time: startTime,  // For latency calculation
}, {
  // Optional fields
  result_meta: {
    resource_type: 'publisher',
    resource_id: result.id,
  },
  idempotency_key: idempotency_key,
  policy_decision_id: decision?.decisionId,
});
```

---

## Enforcement Strategy

### 1. Forbid Raw Logging

Add ESLint rule or TypeScript check:

```typescript
// ❌ FORBIDDEN: Raw logging
console.log('Request:', req);
logger.info({ payload: req });
await db.insert('audit_log', { data: req });

// ✅ REQUIRED: Use emitAuditEvent
await emitAuditEvent(auditAdapter, { ... });
```

### 2. Extract Pack from Action

```typescript
function extractPack(action: string): string {
  // "domain.publishers.create" -> "domain"
  // "iam.keys.list" -> "iam"
  // "webhooks.create" -> "webhooks"
  const parts = action.split('.');
  return parts[0] || 'unknown';
}
```

### 3. Extract Integration from Bindings

```typescript
// Add to bindings.json
{
  "integration": "ciq-automations",  // Or auto-detect from repo name
  // ... other bindings
}
```

---

## Backward Compatibility

### Adapter Interface

```typescript
interface AuditAdapter {
  // New interface (preferred) - use this for all new code
  logEvent(event: AuditEvent): Promise<void>;
  
  // Legacy interface (deprecated) - only for backward compatibility
  log(entry: AuditEntry): Promise<void>;
}

// Adapter implementation
class MyAuditAdapter implements AuditAdapter {
  async logEvent(event: AuditEvent): Promise<void> {
    // IMPORTANT: Do NOT persist request_payload - only hash is in event
    // Store in database
    await this.db.insert('audit_log', {
      // Only persist fields from AuditEvent interface
      // request_payload is NOT in AuditEvent, so it won't be persisted
      event_id: event.event_id,
      event_version: event.event_version,
      ts: event.ts,
      tenant_id: event.tenant_id,
      integration: event.integration,
      pack: event.pack,
      action: event.action,
      actor: event.actor,
      request_hash: event.request_hash,  // Hash only, not payload
      status: event.status,
      // ... other fields
    });
  }
  
  // Legacy shim (for backward compatibility only)
  async log(entry: AuditEntry): Promise<void> {
    // Convert old format to new format
    const event = convertAuditEntryToEvent(entry);
    await this.logEvent(event);
  }
}
```

---

## Benefits

1. **Unified Schema**: All events have same shape
2. **Better Traceability**: `event_id`, `correlation_id`, `run_id` enable full tracing
3. **Security**: Automatic sanitization prevents key exposure
4. **Performance**: `latency_ms` enables performance monitoring
5. **Policy Integration**: `policy_decision_id` links to platform decisions
6. **Resource Tracking**: `result_meta` enables "what changed" queries

---

## Migration Checklist

- [ ] Create new `AuditEvent` interface
- [ ] Implement `emitAuditEvent()` helper
- [ ] Add `extractPack()` utility
- [ ] Add `integration` to bindings
- [ ] Update all `logAudit()` calls to use `emitAuditEvent()`
- [ ] Add ESLint rule to forbid raw logging
- [ ] Update adapter interface (backward compatible)
- [ ] Update spec/audit-entry.json
- [ ] Add migration guide for host repos

---

*Last Updated: February 2026*
*Status: Design - Ready for Implementation*
