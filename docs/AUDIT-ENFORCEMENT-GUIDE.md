# Audit Event Enforcement Guide

## Cursor Enforcement Rules

This document defines what Cursor should enforce to prevent audit logging issues.

---

## Must Enforce

### 1. Use `emitAuditEvent()` - Single Source of Truth

**Rule**: All audit logging MUST use `emitAuditEvent()` helper.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Raw logging
console.log('Request:', req);
logger.info({ payload: req });
await db.insert('audit_log', { data: req });
await adapter.log({ ... });  // Old format

// ❌ FORBIDDEN: Direct adapter calls
await auditAdapter.log(event);  // Wrong method
```

**Required**:
```typescript
// ✅ REQUIRED: Use emitAuditEvent
import { emitAuditEvent } from './audit-event';

await emitAuditEvent(adapter, {
  tenant_id,
  integration: bindings.integration,
  actor: { type, id, api_key_id },
  action,
  request_payload: req,
  status,
  start_time,
}, options);
```

### 2. Never Persist `request_payload`

**Rule**: `request_payload` is ONLY used for hashing. It must NEVER be stored in the event or database.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Including payload in event
const event = {
  ...otherFields,
  request_payload: req,  // NEVER DO THIS
};

// ❌ FORBIDDEN: Storing payload in adapter
await db.insert('audit_log', {
  request_payload: req,  // NEVER DO THIS
});
```

**Required**:
```typescript
// ✅ REQUIRED: Only hash is persisted
const event: AuditEvent = {
  request_hash: await sha256(canonicalJson(sanitize(req))),
  // request_payload is NOT in AuditEvent interface
};
```

### 3. Never Log Headers/Body Directly

**Rule**: Headers and request bodies must be sanitized before any logging.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Logging headers/body
console.log('Headers:', req.headers);
logger.info({ body: req.body });
await db.insert('logs', { headers: req.headers });
```

**Required**:
```typescript
// ✅ REQUIRED: Sanitize first
import { sanitize } from './sanitize';
const sanitized = sanitize(req);
// Then log sanitized version
```

### 4. Use `crypto.randomUUID()` for Event IDs

**Rule**: Event IDs must use `crypto.randomUUID()`, not npm packages.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: npm uuid package
import { v4 as uuidv4 } from 'uuid';
const event_id = uuidv4();
```

**Required**:
```typescript
// ✅ REQUIRED: crypto.randomUUID()
const event_id = crypto.randomUUID();
```

### 5. Use Canonical JSON for Hashing

**Rule**: All hashing must use `canonicalJson()` for stable hashes.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Direct JSON.stringify
const hash = await sha256(JSON.stringify(obj));
```

**Required**:
```typescript
// ✅ REQUIRED: Canonical JSON
import { canonicalJson } from './sanitize';
const canonical = canonicalJson(sanitize(obj));
const hash = await sha256(canonical);
```

### 6. Use `redactString()` for Error Messages

**Rule**: Error messages must use `redactString()`, not `sanitize()`.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Sanitize error message as object
error_message_redacted: sanitize(errorMessage)
```

**Required**:
```typescript
// ✅ REQUIRED: Redact string
import { redactString } from './sanitize';
error_message_redacted: redactString(errorMessage)
```

### 7. Use `adapter.logEvent()`, Not `adapter.log()`

**Rule**: New code must use `logEvent()`. `log()` is legacy only.

**Forbidden**:
```typescript
// ❌ FORBIDDEN: Using old log() method
await adapter.log(event);
```

**Required**:
```typescript
// ✅ REQUIRED: Use logEvent()
await adapter.logEvent(event);
```

---

## ESLint Rules (Recommended)

Add to `.eslintrc.js`:

```javascript
module.exports = {
  rules: {
    // Forbid console.log in production code
    'no-console': ['error', { allow: ['warn', 'error'] }],
    
    // Custom rule: Forbid raw audit logging
    'no-raw-audit-logging': 'error',  // Would need custom plugin
  },
};
```

**Custom ESLint Rule** (if possible):
```javascript
// Forbid patterns like:
// - console.log with 'request', 'payload', 'headers'
// - Direct db.insert with audit-related tables
// - adapter.log() calls (use logEvent instead)
```

---

## TypeScript Enforcement

### Make `request_payload` Not Persistable

The `AuditEvent` interface does NOT include `request_payload`, so TypeScript will prevent accidental persistence:

```typescript
interface AuditEvent {
  // ... fields ...
  request_hash: string;  // Hash only
  // request_payload is NOT here - TypeScript will error if you try to add it
}
```

### Adapter Interface

```typescript
interface AuditAdapter {
  logEvent(event: AuditEvent): Promise<void>;  // Preferred
  log(entry: AuditEntry): Promise<void>;      // Legacy only
}
```

---

## Code Review Checklist

When reviewing PRs, check:

- [ ] All audit logging uses `emitAuditEvent()`
- [ ] No `console.log()` with request/payload/headers
- [ ] No direct `adapter.log()` calls (use `logEvent()`)
- [ ] No `request_payload` in event objects
- [ ] Error messages use `redactString()`, not `sanitize()`
- [ ] Event IDs use `crypto.randomUUID()`
- [ ] Hashing uses `canonicalJson()`
- [ ] Integration comes from bindings (not hardcoded)
- [ ] Pack is auto-derived (not manually passed)

---

## Migration Guide

### Step 1: Update Adapter

```typescript
class MyAuditAdapter implements AuditAdapter {
  async logEvent(event: AuditEvent): Promise<void> {
    // Store event (request_payload is NOT in event, so safe)
    await this.db.insert('audit_log', event);
  }
  
  // Legacy shim
  async log(entry: AuditEntry): Promise<void> {
    const event = convertAuditEntryToEvent(entry);
    await this.logEvent(event);
  }
}
```

### Step 2: Update Router

```typescript
// Old
await logAudit(auditAdapter, {
  tenantId,
  actorType: 'api_key',
  actorId: keyPrefix,
  action,
  requestId,
  result: 'success',
  // ...
});

// New
const startTime = Date.now();
await emitAuditEvent(auditAdapter, {
  tenant_id: tenantId,
  integration: bindings.integration,
  actor: {
    type: 'api_key',
    id: keyPrefix,
    api_key_id: apiKeyId,
  },
  action,
  request_payload: req,
  status: 'success',
  start_time: startTime,
}, {
  idempotency_key,
  policy_decision_id: decision?.decisionId,
});
```

---

## Testing

### Unit Test: Verify No Payload Persistence

```typescript
it('should not persist request_payload', async () => {
  const adapter = new TestAuditAdapter();
  const req = { action: 'test', params: { secret: 'key123' } };
  
  await emitAuditEvent(adapter, {
    tenant_id: 'tenant1',
    integration: 'test',
    actor: { type: 'api_key', id: 'test' },
    action: 'test.action',
    request_payload: req,
    status: 'success',
  });
  
  const stored = adapter.getLastEvent();
  expect(stored.request_payload).toBeUndefined();
  expect(stored.request_hash).toBeDefined();
});
```

### Integration Test: Verify Canonical Hashing

```typescript
it('should produce stable hashes', async () => {
  const payload1 = { a: 1, b: 2 };
  const payload2 = { b: 2, a: 1 };  // Different key order
  
  const hash1 = await hashPayload(payload1);
  const hash2 = await hashPayload(payload2);
  
  expect(hash1).toBe(hash2);  // Should be same (canonical)
});
```

---

## Summary

**Enforcement Rules:**
1. ✅ Use `emitAuditEvent()` - single source of truth
2. ✅ Never persist `request_payload` - only hash
3. ✅ Never log headers/body directly - sanitize first
4. ✅ Use `crypto.randomUUID()` for event IDs
5. ✅ Use `canonicalJson()` for hashing
6. ✅ Use `redactString()` for error messages
7. ✅ Use `adapter.logEvent()`, not `adapter.log()`

**These rules prevent 80% of future pain.**

---

*Last Updated: February 2026*
*Status: Enforcement Guide*
