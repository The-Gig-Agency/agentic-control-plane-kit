# Audit Event Schema: Fixes Applied

## Summary

All must-fix issues and recommended tweaks have been implemented.

---

## Must-Fix Issues (Fixed ✅)

### 1. ✅ Canonical JSON for Hashing

**Fixed**: `hashPayload()` now uses `canonicalJson()` for stable hashes.

```typescript
// kernel/src/audit.ts
export async function hashPayload(payload: any): Promise<string> {
  const sanitized = sanitize(payload);
  const canonical = canonicalJson(sanitized);  // ✅ Canonical JSON
  const hash = await sha256(canonical);
  return hash;
}
```

**Also fixed in**: `kernel/src/audit-event.ts` - uses `canonicalJson(sanitize(request_payload))`

---

### 2. ✅ String Redaction for Error Messages

**Fixed**: Created `redactString()` function for error messages.

```typescript
// kernel/src/sanitize.ts
export function redactString(str: string | undefined | null, maxLength: number = 500): string | undefined {
  // Redacts patterns like api_key, token, secret, etc.
  // Truncates if too long
}
```

**Usage**:
```typescript
// ✅ CORRECT: Redact string
error_message_redacted: redactString(errorMessage)

// ❌ WRONG: Don't sanitize error message as object
error_message_redacted: sanitize(errorMessage)
```

---

### 3. ✅ crypto.randomUUID() for Event IDs

**Fixed**: Uses `crypto.randomUUID()` instead of npm uuid package.

```typescript
// kernel/src/audit-event.ts
const event_id = crypto.randomUUID();  // ✅ Works in modern runtimes
```

**No dependency needed** - works in Node.js 19+, Deno, Edge Functions, browsers.

---

### 4. ✅ Adapter Interface Consistency

**Fixed**: Adapter now uses `logEvent()` as primary method.

```typescript
// kernel/src/types.ts
interface AuditAdapter {
  logEvent(event: AuditEvent): Promise<void>;  // ✅ Primary method
  log(entry: AuditEntry): Promise<void>;      // Legacy shim only
}
```

**Usage**:
```typescript
// ✅ CORRECT: Use logEvent()
await adapter.logEvent(event);

// ❌ WRONG: Don't use log() for new events
await adapter.log(event);
```

---

### 5. ✅ request_payload Never Persisted

**Fixed**: `request_payload` is NOT in `AuditEvent` interface, so it cannot be persisted.

```typescript
// kernel/src/types.ts
interface AuditEvent {
  request_hash: string;  // ✅ Only hash
  // request_payload is NOT here - TypeScript prevents persistence
}
```

**Implementation**:
```typescript
// kernel/src/audit-event.ts
// request_payload is used for hashing only, then discarded
const sanitized = sanitize(ctx.request_payload);
const canonical = canonicalJson(sanitized);
const request_hash = await sha256(canonical);

// Event only contains hash, not payload
const event: AuditEvent = {
  request_hash,  // ✅ Only hash
  // request_payload is NOT included
};
```

---

## Strongly Recommended Tweaks (Implemented ✅)

### 6. ✅ Integration from Bindings

**Fixed**: `integration` is now required in `Bindings` interface and automatically passed.

```typescript
// kernel/src/types.ts
export interface Bindings {
  integration: string;  // ✅ Required field
  // ... other bindings
}

// kernel/src/audit-event.ts
export interface AuditEventContext {
  integration: string;  // From bindings
  // ...
}
```

**Usage**:
```typescript
await emitAuditEvent(adapter, {
  integration: bindings.integration,  // ✅ Auto from bindings
  // ...
});
```

**Schema updated**: `config/bindings.schema.json` now requires `integration` field.

---

### 7. ✅ Pack Auto-Derived

**Fixed**: Pack is automatically extracted from action if not provided.

```typescript
// kernel/src/audit-event.ts
export function extractPack(action: string): string {
  const parts = action.split('.');
  return parts[0] || 'unknown';
}

// In emitAuditEvent():
const pack = options.pack || extractPack(ctx.action);  // ✅ Auto-derived
```

**Usage**:
```typescript
// Pack is auto-derived, but can be overridden if needed
await emitAuditEvent(adapter, ctx, {
  pack: 'custom',  // Optional override
});
```

---

### 8. ✅ event_version Field

**Fixed**: Added `event_version: 1` to `AuditEvent` interface.

```typescript
// kernel/src/types.ts
interface AuditEvent {
  event_version: number;  // ✅ Schema version
  // ...
}

// kernel/src/audit-event.ts
const event: AuditEvent = {
  event_version: 1,  // ✅ Always set
  // ...
};
```

**Benefits**: Enables schema evolution without breaking existing code.

---

### 9. ✅ Footer Dates Updated

**Fixed**: All documentation footers updated to February 2026.

- `docs/AUDIT-EVENT-SCHEMA.md`
- `docs/AUDIT-SCHEMA-ADVISORY.md`
- `docs/AUDIT-ENFORCEMENT-GUIDE.md`

---

## Files Created/Modified

### New Files
1. `kernel/src/audit-event.ts` - Unified audit event emission
2. `docs/AUDIT-ENFORCEMENT-GUIDE.md` - Cursor enforcement rules
3. `docs/AUDIT-FIXES-SUMMARY.md` - This file

### Modified Files
1. `kernel/src/sanitize.ts` - Added `redactString()` and improved `canonicalJson()`
2. `kernel/src/types.ts` - Added `AuditEvent` interface, updated `AuditAdapter`, added `integration` to `Bindings`
3. `kernel/src/audit.ts` - Updated comments to emphasize canonical JSON
4. `config/bindings.schema.json` - Added `integration` as required field
5. `docs/AUDIT-EVENT-SCHEMA.md` - Updated implementation examples
6. `docs/AUDIT-SCHEMA-ADVISORY.md` - Updated footer date

---

## Cursor Enforcement Checklist

All items are ready for Cursor to enforce:

- [x] ✅ `sanitize(obj)` - Implemented
- [x] ✅ `canonicalJson(obj)` - Implemented (handles nested objects, arrays)
- [x] ✅ `sha256(str)` - Implemented (real SHA-256)
- [x] ✅ `emitAuditEvent()` - Uses `crypto.randomUUID()` + canonical hash
- [x] ✅ Adapters expose `logEvent(AuditEvent)` - Interface updated
- [x] ✅ Ban raw request logging - Documented in enforcement guide
- [x] ✅ Ban persisting headers/body - TypeScript prevents via interface

---

## Next Steps

1. **Update router.ts** - Migrate all `logAudit()` calls to `emitAuditEvent()`
2. **Update adapters** - Implement `logEvent()` method
3. **Add ESLint rules** - Enforce no raw logging
4. **Update tests** - Test new audit event schema
5. **Update host repos** - Migrate CIQ, Lead Scoring to new schema

---

## Testing

### Verify Canonical Hashing
```typescript
const payload1 = { a: 1, b: 2 };
const payload2 = { b: 2, a: 1 };
const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);
expect(hash1).toBe(hash2);  // Should be same
```

### Verify No Payload Persistence
```typescript
const event = await emitAuditEvent(...);
expect(event.request_payload).toBeUndefined();  // Should not exist
expect(event.request_hash).toBeDefined();  // Hash should exist
```

---

*Last Updated: February 2026*
*Status: All Fixes Applied - Ready for Implementation*
