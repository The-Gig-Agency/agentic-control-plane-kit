# Audit Event Schema: Advisory & Recommendations

## Executive Summary

**ChatGPT's suggestions are excellent and should be implemented.** The unified audit event schema will significantly improve traceability, security, and observability.

## Current State Analysis

### What We Have ✅
- Basic audit logging via `logAudit()`
- `AuditEntry` interface with core fields
- Payload hashing (now with real SHA-256)
- Sanitization (just implemented)

### What's Missing ❌
- Unified event schema (ChatGPT's list)
- Single `emitAuditEvent()` helper
- Integration/pack context
- Correlation IDs (run_id, correlation_id, node_id)
- Performance metrics (latency_ms)
- Policy integration fields (policy_decision_id, policy_version)
- Structured result metadata (resource_type, resource_id)

---

## Recommendations

### ✅ **Implement ChatGPT's Required v1 Fields**

**Priority: HIGH** - These are essential for basic audit functionality:

1. **`integration`** - Which repo/integration (e.g., "ciq-automations")
   - Add to `bindings.json` or auto-detect from environment
   
2. **`pack`** - Which pack handled the action (e.g., "domain", "iam")
   - Extract from action name: `action.split('.')[0]`
   
3. **`policy_decision_id`** - Link to platform authorization decision
   - Required for platform integration (Repo B)
   
4. **`ts`** - Timestamp (we have implicit via `created_at`, but explicit is better)
   - Use `Date.now()` for consistency

5. **`event_id`** - UUID for each event (we have `requestId` but should be UUID)
   - Generate with `uuidv4()`

6. **`result_meta`** - Structured result information
   - Enables "what changed" queries
   - Resource type/ID, counts, created IDs, diff hash

### ✅ **Add High-Leverage Optional Fields**

**Priority: MEDIUM** - Low cost, high value:

1. **`run_id`** - Multi-step agent runs
   - Pass from agent context
   
2. **`correlation_id`** - Cross-service tracing
   - Pass from request headers or generate
   
3. **`node_id`** - Executor identifier
   - Environment variable or bindings
   
4. **`latency_ms`** - Performance monitoring
   - Calculate: `Date.now() - startTime`
   
5. **`error_code`** - Structured error codes
   - Already have in responses, just need to capture
   
6. **`policy_version`** - Policy version/hash
   - From platform response

### ✅ **Create Single `emitAuditEvent()` Helper**

**Priority: CRITICAL** - This prevents 80% of future pain:

```typescript
// ✅ GOOD: Single helper, enforced everywhere
await emitAuditEvent(auditAdapter, {
  tenant_id,
  integration,
  pack,
  action,
  actor: { type, id, api_key_id },
  status,
  request_payload: req,  // Auto-sanitized
  // ... other fields
});

// ❌ BAD: Raw logging (forbid this)
console.log('Request:', req);
logger.info({ payload: req });
```

**Enforcement Strategy:**
1. Add ESLint rule: `no-console` + custom rule for raw audit logging
2. TypeScript: Make `emitAuditEvent()` the only way to log
3. Code review: Reject any PRs with raw logging

---

## Implementation Plan

### Phase 1: Schema Definition (Week 1)

- [ ] Create `AuditEvent` interface (see `docs/AUDIT-EVENT-SCHEMA.md`)
- [ ] Update `spec/audit-entry.json` with new schema
- [ ] Add `integration` to bindings schema
- [ ] Create `extractPack()` utility function

### Phase 2: Helper Implementation (Week 1)

- [ ] Implement `emitAuditEvent()` helper
- [ ] Add automatic sanitization
- [ ] Add automatic hashing
- [ ] Add UUID generation
- [ ] Add timestamp generation

### Phase 3: Migration (Week 2)

- [ ] Update all `logAudit()` calls to use `emitAuditEvent()`
- [ ] Update router.ts (9 call sites)
- [ ] Update adapter interface (backward compatible)
- [ ] Add latency tracking

### Phase 4: Enforcement (Week 2)

- [ ] Add ESLint rule to forbid raw logging
- [ ] Update documentation
- [ ] Add migration guide for host repos

---

## Key Decisions

### 1. Backward Compatibility

**Decision**: Support both old `AuditEntry` and new `AuditEvent` formats.

**Rationale**: Host repos may not migrate immediately. Adapter can convert.

### 2. Integration Field

**Decision**: Add to `bindings.json` as required field.

**Rationale**: Explicit is better than implicit. Easy to set.

### 3. Pack Extraction

**Decision**: Auto-extract from action name (`action.split('.')[0]`).

**Rationale**: No additional configuration needed. Works for all actions.

### 4. Policy Decision ID

**Decision**: Optional but strongly recommended.

**Rationale**: Required for platform integration, but kernel can work without platform.

---

## Benefits of Implementation

1. **Unified Schema**: All events have same shape → easier querying
2. **Better Traceability**: `event_id`, `correlation_id`, `run_id` enable full tracing
3. **Security**: Automatic sanitization prevents key exposure
4. **Performance**: `latency_ms` enables performance monitoring
5. **Policy Integration**: `policy_decision_id` links to platform decisions
6. **Resource Tracking**: `result_meta` enables "what changed" queries
7. **Single Source of Truth**: One helper prevents inconsistencies

---

## Do You Need Repo A Docs First?

**Answer: No.**

As ChatGPT said, you don't need Repo A docs to define/enforce this schema. You only need docs to:
1. Map where to emit (middleware vs pack router vs adapter) ✅ Already clear
2. Ensure you're not logging secrets ✅ Already handled with sanitize()

**The schema can be defined and enforced today.**

---

## Minimal Viable Implementation

**Smallest change that gives 80% value:**

1. Create `emitAuditEvent()` helper
2. Add required fields: `integration`, `pack`, `event_id`, `ts`
3. Forbid raw logging (ESLint rule)
4. Update router.ts to use new helper

**This alone prevents 80% of future pain.**

---

## Conclusion

**Recommendation: Implement ChatGPT's schema.**

- ✅ Required v1 fields are essential
- ✅ High-leverage optional fields are worth it
- ✅ Single `emitAuditEvent()` helper is critical
- ✅ Can be implemented today without Repo A docs
- ✅ Backward compatible migration path

**Priority**: High - This is foundational infrastructure that will pay dividends.

---

*Last Updated: February 2026*
*Status: Advisory - Ready for Implementation*
