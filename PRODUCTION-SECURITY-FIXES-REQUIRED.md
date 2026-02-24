# Production Security Fixes Required

**Date:** February 25, 2026  
**Status:** Critical issues blocking production deployment

---

## Critical Issues Found

### 1. 🔴 Gateway Auth Failing (401 Invalid API key)

**Problem:** Gateway rejects valid API keys from Repo B.

**Root Cause:** Gateway calls `api-keys-lookup` endpoint but:
- Endpoint path might be incorrect
- Gateway needs to use kernel API key to authenticate the lookup request
- Response format might not match what gateway expects

**Location:** `agentic-control-plane-kit/gateway/auth.ts` (line 118)
- Calls: `${baseUrl}/functions/v1/api-keys-lookup`
- Uses: `ACP_KERNEL_KEY` for auth (correct)
- Expects: `{ ok: true, data: { tenant_id: "..." } }`

**Fix Required:**
1. Verify `api-keys-lookup` endpoint exists and is deployed
2. Ensure gateway's `ACP_KERNEL_KEY` is valid
3. Add better error logging to see what's actually failing
4. Verify response format matches expectations

---

### 2. 🔴 Write Endpoints Don't Check Email Verification

**Problem:** `mcp-servers-register` (and other write endpoints) allow writes even when email is not verified.

**Location:** `governance-hub/supabase/functions/mcp-servers-register/index.ts`

**Fix Required:**
Add email verification check before allowing writes:

```typescript
// After getting tenantId from API key (line 240)
// Check if tenant email is verified
const { data: tenant } = await supabase
  .from('tenants')
  .select('email_verified')
  .eq('id', tenantId)
  .single();

if (!tenant?.email_verified) {
  return new Response(
    JSON.stringify({ 
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email verification required before write operations. Please verify your email first.'
    }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Endpoints to Fix:**
- `mcp-servers-register` (POST)
- `mcp-servers-update` (PUT)
- `mcp-servers-delete` (DELETE)
- `policy-propose` (POST)
- Any other write endpoints

---

### 3. 🔴 Stripe Customer Created at Signup (Not Idempotent)

**Problem:** Stripe customer is created in `consumer-signup` function, not waiting for verification.

**Location:** `echelon-control/supabase/functions/consumer-signup/index.ts` (lines 246-248)

**Fix Required:**
Remove Stripe customer creation from signup. It should only happen in `verify-email` endpoint (Repo B).

**Current Code (WRONG):**
```typescript
// 4. Create Stripe customer (no charge)
let stripeCustomerId: string | null = null;
if (stripeKey) {
  try {
    // Creates customer at signup - WRONG
```

**Fix:**
Remove this entire section. Stripe customer creation is already handled in Repo B's `verify-email` endpoint.

---

### 4. 🔴 No `/whoami` Endpoint to Verify Status

**Problem:** Can't verify email verification status or key scopes from API.

**Fix Required:**
Create `GET /functions/v1/whoami` endpoint in Repo B:

```typescript
/**
 * GET /functions/v1/whoami
 * 
 * Returns current API key status and tenant info
 * Auth: X-API-Key header
 */
// Returns:
{
  ok: true,
  data: {
    tenant_id: "...",
    api_key_id: "...",
    email_verified: true/false,
    key_mode: "read_only" | "full",
    scopes: [...],
    tier: "free" | "pro" | ...
  }
}
```

---

### 5. 🟡 Rate Limiting Not Observable

**Problem:** Rate limiting might be working but not observable at low volumes.

**Fix Required:**
1. Add rate limit headers to responses:
   - `X-RateLimit-Limit: 3`
   - `X-RateLimit-Remaining: 2`
   - `X-RateLimit-Reset: <timestamp>`
2. Test with higher volume (10+ requests)
3. Verify `check_rate_limit` RPC function is working

---

## Implementation Priority

### Critical (Blocks Production)

1. **Fix Gateway Auth** - Gateway must accept valid API keys
2. **Add Email Verification Checks to Write Endpoints** - Prevent writes until verified
3. **Remove Stripe Customer Creation from Signup** - Only create after verification
4. **Add `/whoami` Endpoint** - Make verification status visible

### High Priority (Security Hardening)

5. **Add Rate Limit Headers** - Make rate limiting observable
6. **Add Better Error Messages** - Help debugging
7. **Add Audit Logging** - Track all write attempts

---

## Files to Modify

### Repo A (Gateway)
- `gateway/auth.ts` - Fix API key lookup error handling
- `gateway/http-server.ts` - Add better error logging

### Repo B (Governance Hub)
- `supabase/functions/mcp-servers-register/index.ts` - Add email verification check
- `supabase/functions/mcp-servers-update/index.ts` - Add email verification check
- `supabase/functions/mcp-servers-delete/index.ts` - Add email verification check
- `supabase/functions/policy-propose/index.ts` - Add email verification check
- `supabase/functions/whoami/index.ts` - **NEW** - Create whoami endpoint

### Repo D (Echelon Control)
- `supabase/functions/consumer-signup/index.ts` - Remove Stripe customer creation

---

## Testing Checklist

After fixes:

- [ ] Gateway accepts valid API key from signup
- [ ] Gateway rejects invalid API key (404)
- [ ] Write endpoints return 403 for unverified emails
- [ ] Write endpoints allow writes for verified emails
- [ ] `/whoami` returns correct verification status
- [ ] Stripe customer only created after verification
- [ ] Rate limiting triggers at 3+ requests per email
- [ ] Rate limiting triggers at 10+ requests per IP

---

## Quick Test Script

```bash
# 1. Signup (get unverified key)
curl -X POST https://www.buyechelon.com/api/consumer/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com"}'

# 2. Check status
curl -X GET https://governance-hub.supabase.co/functions/v1/whoami \
  -H "X-API-Key: <key_from_step_1>"

# 3. Try write (should fail 403)
curl -X POST https://governance-hub.supabase.co/functions/v1/mcp-servers-register \
  -H "X-API-Key: <key_from_step_1>" \
  -H "Content-Type: application/json" \
  -d '{"server_id":"test","name":"Test","tool_prefix":"test.","mode":"hosted","connector_id":"supabase"}'

# 4. Verify email (via link in email)

# 5. Try write again (should succeed 200)
curl -X POST https://governance-hub.supabase.co/functions/v1/mcp-servers-register \
  -H "X-API-Key: <key_from_step_1>" \
  -H "Content-Type: application/json" \
  -d '{"server_id":"test","name":"Test","tool_prefix":"test.","mode":"hosted","connector_id":"supabase"}'
```
