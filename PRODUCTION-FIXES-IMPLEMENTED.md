# Production Security Fixes - Implemented

**Date:** February 25, 2026  
**Status:** Critical fixes implemented, ready for deployment

---

## ✅ Fixes Implemented

### 1. ✅ Email Verification Checks Added to Write Endpoints

**Problem:** Write endpoints allowed operations even when email was not verified.

**Fixed Endpoints:**
- `mcp-servers-register` (POST)
- `mcp-servers-update` (PUT)
- `mcp-servers-delete` (DELETE)
- `policy-propose` (POST)

**Implementation:**
All write endpoints now check `email_verified` status before allowing writes. Returns `403 EMAIL_NOT_VERIFIED` if email is not verified.

**Files Modified:**
- `governance-hub/supabase/functions/mcp-servers-register/index.ts`
- `governance-hub/supabase/functions/mcp-servers-update/index.ts`
- `governance-hub/supabase/functions/mcp-servers-delete/index.ts`
- `governance-hub/supabase/functions/policy-propose/index.ts`

---

### 2. ✅ Stripe Customer Creation Removed from Signup

**Problem:** Stripe customer was created at signup, causing duplicate customers and denial-of-wallet attacks.

**Fix:** Removed Stripe customer creation from `consumer-signup` function. Stripe customer is now only created in Repo B's `verify-email` endpoint (after email verification), ensuring idempotent customer creation.

**File Modified:**
- `echelon-control/supabase/functions/consumer-signup/index.ts`

---

### 3. ✅ `/whoami` Endpoint Created

**Problem:** No way to verify email verification status or key scopes from API.

**Fix:** Created `GET /functions/v1/whoami` endpoint that returns:
- `tenant_id`
- `api_key_id`
- `email_verified` (true/false)
- `key_mode` ("read_only" | "full")
- `scopes` (array)
- `tier` (free/pro/etc.)

**File Created:**
- `governance-hub/supabase/functions/whoami/index.ts`

---

### 4. ✅ Gateway Auth Error Logging Improved

**Problem:** Gateway auth failures were hard to debug.

**Fix:** Added detailed error logging to `extractTenantFromApiKey` function to help diagnose API key lookup failures.

**File Modified:**
- `agentic-control-plane-kit/gateway/auth.ts`

---

## Testing Checklist

After deployment, verify:

- [ ] **Write endpoints block unverified emails:**
  ```bash
  # 1. Signup (get unverified key)
  curl -X POST https://www.buyechelon.com/api/consumer/signup \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"test@example.com"}'
  
  # 2. Try write (should fail 403)
  curl -X POST https://governance-hub.supabase.co/functions/v1/mcp-servers-register \
    -H "X-API-Key: <unverified_key>" \
    -H "Content-Type: application/json" \
    -d '{"server_id":"test","name":"Test","tool_prefix":"test.","mode":"hosted","connector_id":"supabase"}'
  # Expected: 403 {"error":"EMAIL_NOT_VERIFIED"}
  ```

- [ ] **Whoami endpoint works:**
  ```bash
  curl -X GET https://governance-hub.supabase.co/functions/v1/whoami \
    -H "X-API-Key: <key>"
  # Expected: 200 with email_verified: false, key_mode: "read_only"
  ```

- [ ] **Stripe customer only created after verification:**
  ```bash
  # Signup should NOT create Stripe customer
  # Verify email should create Stripe customer (idempotent)
  ```

- [ ] **Gateway accepts valid API keys:**
  ```bash
  # Check gateway logs for detailed error messages if auth fails
  # Verify ACP_KERNEL_KEY is set correctly
  # Verify api-keys-lookup endpoint is deployed
  ```

---

## Deployment Steps

### Repo B (Governance Hub)

1. **Deploy new/updated functions:**
   ```bash
   cd governance-hub
   supabase functions deploy mcp-servers-register
   supabase functions deploy mcp-servers-update
   supabase functions deploy mcp-servers-delete
   supabase functions deploy policy-propose
   supabase functions deploy whoami
   ```

2. **Verify deployment:**
   - Check function logs for errors
   - Test `/whoami` endpoint
   - Test write endpoint with unverified key (should return 403)

### Repo D (Echelon Control)

1. **Deploy updated signup function:**
   ```bash
   cd echelon-control
   supabase functions deploy consumer-signup
   ```

2. **Verify deployment:**
   - Test signup (should NOT create Stripe customer)
   - Verify email link works
   - Confirm Stripe customer created only after verification

### Repo A (Gateway)

1. **Redeploy gateway:**
   - Gateway code changes are minimal (just logging)
   - Redeploy to Railway/Fly.io/etc.

2. **Verify deployment:**
   - Check gateway logs for detailed auth errors
   - Test API key authentication
   - Verify `api-keys-lookup` endpoint is accessible

---

## Remaining Issues to Investigate

### Gateway Auth Still Failing (401)

**Possible Causes:**
1. `api-keys-lookup` endpoint not deployed
2. Gateway's `ACP_KERNEL_KEY` is invalid
3. Endpoint path mismatch
4. Response format mismatch

**Debug Steps:**
1. Check gateway logs for detailed error messages (now improved)
2. Verify `api-keys-lookup` endpoint exists and is deployed
3. Test `api-keys-lookup` directly with kernel key:
   ```bash
   curl -X POST https://governance-hub.supabase.co/functions/v1/api-keys-lookup \
     -H "Authorization: Bearer <ACP_KERNEL_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"api_key":"<test_key>"}'
   ```

### Rate Limiting Not Observable

**Possible Causes:**
1. Rate limiting works but needs higher volume to trigger
2. Rate limit headers not added to responses

**Next Steps:**
1. Test with 10+ rapid signup requests
2. Add rate limit headers to responses (future enhancement)

---

## Summary

**Critical fixes implemented:**
- ✅ Write endpoints now check email verification
- ✅ Stripe customer creation moved to verification step
- ✅ `/whoami` endpoint created for status checking
- ✅ Better error logging for gateway auth

**Ready for deployment and testing.**
