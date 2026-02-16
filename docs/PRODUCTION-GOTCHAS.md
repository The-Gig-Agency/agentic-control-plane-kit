# Production Gotchas: Runtime Determinism & Hash Usefulness

## Overview

Two critical production gotchas that must be validated before deploying to production.

---

## Gotcha 1: Hash Determinism Across Runtimes ⚠️

**Problem:** Your tests pass locally, but hashes might differ across runtimes.

**Critical:** Same payload must produce identical hash in:
- Node.js vs Deno
- Edge runtime vs server runtime
- Different Node.js versions

### Edge Cases to Watch

#### 1. Floats (1 vs 1.0)

**Issue:** `1` vs `1.0` might stringify differently.

**Solution:** `JSON.stringify()` normalizes `1.0` → `1` (consistent across runtimes).

**Test:**
```typescript
const payload1 = { count: 1 };
const payload2 = { count: 1.0 };
const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);
expect(hash1).toBe(hash2); // Should be identical
```

#### 2. Dates (Stringification)

**Issue:** `new Date()` might stringify differently.

**Solution:** Convert to ISO string before stringification.

**Test:**
```typescript
const date1 = new Date('2024-01-01T00:00:00Z');
const date2 = new Date('2024-01-01T00:00:00Z');
const payload1 = { created_at: date1 };
const payload2 = { created_at: date2 };
const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);
expect(hash1).toBe(hash2); // Should be identical
```

#### 3. undefined Handling

**Issue:** `undefined` might be handled differently.

**Solution:** Omit `undefined` from output (not `null`).

**Test:**
```typescript
const payload1 = { a: 1, b: undefined };
const payload2 = { a: 1 }; // b omitted
const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);
expect(hash1).toBe(hash2); // Should be identical
```

#### 4. BigInt

**Issue:** `JSON.stringify()` throws on BigInt.

**Solution:** Convert BigInt to string.

**Test:**
```typescript
const payload1 = { id: BigInt(123) };
const payload2 = { id: BigInt(123) };
const hash1 = await hashPayload(payload1);
const hash2 = await hashPayload(payload2);
expect(hash1).toBe(hash2); // Should be identical
```

### Runtime Testing Checklist

**Test in each runtime:**

- [ ] Node.js (v18+)
- [ ] Deno
- [ ] Supabase Edge Functions
- [ ] Vercel Edge Runtime
- [ ] Cloudflare Workers

**Expected:** Identical payloads produce identical hashes.

---

## Gotcha 2: Hash Usefulness (Not Too Aggressive) ⚠️

**Problem:** If redaction is too aggressive, different meaningful requests collide.

**Rule:** Redact credentials, keep business parameters.

### What Should Create Different Hashes ✅

**Business parameters should create different hashes:**

```typescript
// Different names → Different hashes
{ name: 'Publisher A' } → hash1
{ name: 'Publisher B' } → hash2
expect(hash1).not.toBe(hash2);

// Different types → Different hashes
{ type: 'influencer' } → hash1
{ type: 'brand' } → hash2
expect(hash1).not.toBe(hash2);

// Different counts → Different hashes
{ limit: 10 } → hash1
{ limit: 20 } → hash2
expect(hash1).not.toBe(hash2);
```

### What Should Create Same Hash ✅

**Different secrets should create same hash (redacted):**

```typescript
// Different API keys → Same hash
{ name: 'Test', api_key: 'secret_123' } → hash1
{ name: 'Test', api_key: 'secret_456' } → hash2
expect(hash1).toBe(hash2); // Secrets redacted

// Different tokens → Same hash
{ action: 'test', token: 'abc123' } → hash1
{ action: 'test', token: 'xyz789' } → hash2
expect(hash1).toBe(hash2); // Tokens redacted
```

### Current Redaction Rules

**Redacted fields (case-insensitive):**
- `authorization`, `cookie`, `x-api-key`, `api-key`, `apikey`, `api_key`
- `token`, `access_token`, `refresh_token`
- `client_secret`, `secret`, `password`, `passwd`, `pwd`
- `private_key`, `session_id`, `auth_token`, `bearer`, `credentials`

**Not redacted (business parameters):**
- `name`, `type`, `count`, `limit`, `offset`
- `status`, `created_at`, `updated_at`
- Any field not in sensitive list

**If hash collisions occur:**
- Check if business parameters are being redacted
- Verify sensitive field list is not too broad
- Add test to catch collisions

---

## Validation Tests

### Runtime Determinism Test

```typescript
describe('Runtime Determinism', () => {
  it('should produce identical hashes for floats', async () => {
    const hash1 = await hashPayload({ count: 1 });
    const hash2 = await hashPayload({ count: 1.0 });
    expect(hash1).toBe(hash2);
  });

  it('should produce identical hashes for dates', async () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const hash1 = await hashPayload({ created_at: date });
    const hash2 = await hashPayload({ created_at: date });
    expect(hash1).toBe(hash2);
  });

  it('should produce identical hashes with undefined', async () => {
    const hash1 = await hashPayload({ a: 1, b: undefined });
    const hash2 = await hashPayload({ a: 1 });
    expect(hash1).toBe(hash2);
  });

  it('should produce identical hashes for BigInt', async () => {
    const hash1 = await hashPayload({ id: BigInt(123) });
    const hash2 = await hashPayload({ id: BigInt(123) });
    expect(hash1).toBe(hash2);
  });
});
```

### Hash Usefulness Test

```typescript
describe('Hash Usefulness', () => {
  it('should produce different hashes for different business parameters', async () => {
    const hash1 = await hashPayload({ name: 'Publisher A' });
    const hash2 = await hashPayload({ name: 'Publisher B' });
    expect(hash1).not.toBe(hash2);
  });

  it('should produce same hash for different secrets', async () => {
    const hash1 = await hashPayload({ name: 'Test', api_key: 'secret_123' });
    const hash2 = await hashPayload({ name: 'Test', api_key: 'secret_456' });
    expect(hash1).toBe(hash2);
  });
});
```

---

## Pre-Production Checklist

- [ ] ✅ Runtime determinism tests pass locally
- [ ] ✅ Hash usefulness tests pass (business params create different hashes)
- [ ] ⏳ Test in Node.js runtime
- [ ] ⏳ Test in Deno runtime (if applicable)
- [ ] ⏳ Test in Edge runtime (Supabase/Vercel/Cloudflare)
- [ ] ⏳ Verify no hash collisions for different business requests
- [ ] ⏳ Verify secrets don't affect hash (same hash for different secrets)

---

## Implementation Status

**Current Implementation:**

- ✅ `canonicalJson()` handles floats, dates, undefined, BigInt
- ✅ `sanitize()` only redacts sensitive fields (not business params)
- ✅ Tests created for runtime determinism
- ✅ Tests created for hash usefulness

**Remaining:**

- ⏳ Runtime testing (Node/Deno/Edge)
- ⏳ Production validation (real requests)

---

*Last Updated: February 2026*
*Status: Implementation Complete - Runtime Testing Needed*
