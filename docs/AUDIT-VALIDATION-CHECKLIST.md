# Audit Layer Validation Checklist

## Pre-Commit Validation

Before committing, run these three validation checks to prove the audit layer is safe and deterministic.

---

## Check 1: Prove Secrets Cannot Leak (Grep Test)

**Run from Repo A root:**

```bash
cd /path/to/agentic-control-plane-kit
grep -R "authorization\|api_key\|access_token\|refresh_token\|client_secret" . \
  --include="*.ts" --include="*.js" \
  | grep -v node_modules \
  | grep -v ".git" \
  | grep -v "test" \
  | grep -v "spec"
```

### Expected Results ✅

**You SHOULD see:**
- `kernel/src/sanitize.ts` - Sanitization rules (SENSITIVE_FIELDS list)
- `kernel/src/types.ts` - Schema definitions (AuditEvent interface)
- `docs/` - Documentation mentioning these fields
- `config/` - Configuration schemas

**You should NOT see:**
- ❌ `db.insert('audit_log', { request_payload: ... })`
- ❌ `console.log('Request:', req)` with headers/payload
- ❌ `logger.info({ payload: req })`
- ❌ `queue.add('job', { request: req })`
- ❌ Any code that persists raw request bodies

### Manual Verification

**Check these files manually:**

1. **`kernel/src/audit-event.ts`**
   - ✅ `request_payload` is used for hashing only
   - ✅ Event does NOT include `request_payload` field
   - ✅ Only `request_hash` is in the event

2. **`kernel/src/router.ts`**
   - ✅ All audit calls use `emitAuditEvent()`
   - ✅ No direct `console.log()` with request data
   - ✅ No direct database inserts

3. **Adapter implementations** (in host repos)
   - ✅ `logEvent()` only stores fields from `AuditEvent` interface
   - ✅ No `request_payload` field in database schema

---

## Check 2: Emit One Real Event and Inspect DB Row

**Steps:**

1. **Trigger an action** (via CIQ, lead scoring, or test endpoint)
2. **Query audit table:**

```sql
SELECT 
  event_id,
  ts,
  tenant_id,
  integration,
  pack,
  action,
  actor,
  request_hash,
  status,
  result_meta,
  latency_ms
FROM audit_log
ORDER BY ts DESC
LIMIT 1;
```

### Expected Row Structure ✅

```json
{
  "event_id": "3f8b1234-5678-90ab-cdef-123456789abc",
  "event_version": 1,
  "ts": 1739702400123,
  "tenant_id": "tenant_abc",
  "integration": "ciq-automations",
  "pack": "domain",
  "action": "domain.publishers.create",
  "actor": {
    "type": "api_key",
    "id": "ciq_test1234",
    "api_key_id": "key_uuid_123"
  },
  "request_hash": "9a0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
  "status": "success",
  "result_meta": {
    "resource_type": "publisher",
    "resource_id": "pub_456"
  },
  "latency_ms": 45
}
```

### What Should NOT Be Present ❌

**Check these fields do NOT exist:**
- ❌ `request_payload` - Should not exist
- ❌ `request_body` - Should not exist
- ❌ `headers` - Should not exist
- ❌ `x_api_key` - Should not exist
- ❌ `authorization` - Should not exist
- ❌ `api_key` - Should not exist
- ❌ `token` - Should not exist
- ❌ Any field containing raw secrets

**If you see any of these → audit layer is leaking secrets.**

---

## Check 3: Verify Determinism

**Test:** Call the exact same action twice with identical inputs.

**Expected:** `request_hash` should be identical both times.

### Runtime Determinism (Critical for Production)

**Test across different runtimes:**

1. **Node.js vs Deno vs Edge Runtime**
   - Same payload should produce identical hash
   - Test in: Node.js, Deno, Supabase Edge Functions, Vercel Edge

2. **Edge Cases to Verify:**
   - ✅ **Floats**: `1` vs `1.0` → Should produce same hash
   - ✅ **Dates**: `new Date('2024-01-01')` → Should be ISO string, same hash
   - ✅ **undefined**: Should be omitted (not null), same hash
   - ✅ **BigInt**: Should be converted to string, same hash
   - ✅ **null**: Should be preserved, same hash

3. **Manual Test:**
   ```bash
   # Test in Node.js
   node -e "const {hashPayload} = require('./kernel/src/audit'); ..."
   
   # Test in Deno
   deno run --allow-all test-hash.ts
   
   # Test in Edge Function
   # Deploy and call same endpoint twice
   ```

**Expected:** Identical payloads produce identical hashes across all runtimes.

### Manual Test

```bash
# Call action twice with same payload
curl -X POST https://your-api.com/manage \
  -H "X-API-Key: ciq_test123456" \
  -H "Content-Type: application/json" \
  -d '{"action": "domain.publishers.list", "params": {"limit": 10}}'

# Wait a moment, then call again
curl -X POST https://your-api.com/manage \
  -H "X-API-Key: ciq_test123456" \
  -H "Content-Type: application/json" \
  -d '{"action": "domain.publishers.list", "params": {"limit": 10}}'
```

**Query both events:**

```sql
SELECT event_id, request_hash, ts
FROM audit_log
WHERE action = 'domain.publishers.list'
ORDER BY ts DESC
LIMIT 2;
```

### Expected Result ✅

Both rows should have:
- ✅ **Identical `request_hash`** (proves canonical JSON works)
- ✅ Different `event_id` (each event is unique)
- ✅ Different `ts` (different timestamps)

### What This Proves

1. **Canonical JSON works** - Key order doesn't affect hash
2. **Sanitize is stable** - Same input → same sanitized output
3. **Hashes are meaningful** - Can be used for deduplication/correlation
4. **Runtime consistency** - Same hash across Node/Deno/Edge runtimes

### Hash Usefulness Check

**Critical:** Ensure hash remains useful (not too aggressive redaction).

**Rule:** Redact credentials, keep business parameters.

**Test:**
```typescript
// Different business parameters should produce different hashes
const payload1 = {
  action: 'domain.publishers.create',
  params: { name: 'Publisher A', type: 'influencer' }
};

const payload2 = {
  action: 'domain.publishers.create',
  params: { name: 'Publisher B', type: 'influencer' } // Different name
};

const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);

// Should be DIFFERENT (business parameters matter)
expect(hash1).not.toBe(hash2);
```

**Expected:**
- ✅ Different business parameters → Different hashes
- ✅ Different secrets → Same hash (secrets redacted)
- ✅ Hash is useful for deduplication and correlation

### Automated Test

Run the test suite:

```bash
npm test -- tests/security/audit-validation.spec.ts
```

**Expected:** All tests pass, especially:
- ✅ "should produce identical hashes for identical inputs"
- ✅ "should produce stable hashes across multiple calls"
- ✅ "should sanitize before hashing (secrets don't affect hash)"

---

## Quick Validation Script

```bash
#!/bin/bash
# Run from repo root

echo "🔍 Check 1: Secrets Leak Test"
echo "=============================="
grep -R "authorization\|api_key\|access_token\|refresh_token\|client_secret" . \
  --include="*.ts" --include="*.js" \
  | grep -v node_modules \
  | grep -v ".git" \
  | grep -v "test" \
  | grep -v "spec" \
  | grep -v "docs" \
  | wc -l

echo ""
echo "Expected: Only sanitization rules, schemas, interfaces"
echo ""

echo "✅ Check 2: Run manual DB inspection"
echo "Query: SELECT * FROM audit_log ORDER BY ts DESC LIMIT 1;"
echo "Verify: No request_payload, headers, or secrets"
echo ""

echo "✅ Check 3: Run determinism test"
echo "npm test -- tests/security/audit-validation.spec.ts"
```

---

## Pass Criteria

**All checks must pass:**

1. ✅ **Grep test**: Only sanitization rules, schemas, interfaces (no raw logging/persistence)
2. ✅ **DB inspection**: Event has correct structure, no secrets present
3. ✅ **Determinism**: Identical inputs produce identical hashes
4. ✅ **Runtime consistency**: Same hash across Node/Deno/Edge runtimes
5. ✅ **Hash usefulness**: Different business parameters produce different hashes

**If all pass → audit layer is actually safe and production-ready.**

---

*Last Updated: February 2026*
*Status: Validation Checklist*
