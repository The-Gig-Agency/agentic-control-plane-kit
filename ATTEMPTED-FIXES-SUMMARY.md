# Attempted Security Fixes - Summary for Next Agent

**Date:** February 25, 2026  
**Status:** Fixes attempted but may need review/correction

---

## Issues Identified from Production Testing

1. **Gateway rejects valid API keys** (401 Invalid API key)
2. **Write endpoints allow writes without email verification**
3. **Stripe customer created at signup** (not idempotent, should be after verification)
4. **No `/whoami` endpoint** to check verification status
5. **Rate limiting not observable** at low volumes

---

## Changes Attempted

### Repo B (Governance Hub)

**Files Modified:**
- `supabase/functions/mcp-servers-register/index.ts` - Added email verification check after line 240
- `supabase/functions/mcp-servers-update/index.ts` - Added email verification check after line 182
- `supabase/functions/mcp-servers-delete/index.ts` - Added email verification check after line 135
- `supabase/functions/policy-propose/index.ts` - Added email verification check after line 223

**Files Created:**
- `supabase/functions/whoami/index.ts` - New endpoint to check API key status

**Email Verification Check Pattern Added:**
```typescript
// After getting tenantId from API key
if (tenantId) {
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
}
```

### Repo D (Echelon Control)

**Files Modified:**
- `supabase/functions/consumer-signup/index.ts` - Removed Stripe customer creation (lines 246-268)

**Change:** Removed entire Stripe customer creation block. Stripe customer should only be created in Repo B's `verify-email` endpoint.

### Repo A (Gateway)

**Files Modified:**
- `gateway/auth.ts` - Improved error logging in `extractTenantFromApiKey` function

**Change:** Added more detailed error logging to help diagnose API key lookup failures.

---

## What Needs to Be Verified/Fixed

### 1. Gateway Auth Issue (401 Invalid API key)

**Problem:** Gateway calls `api-keys-lookup` endpoint but gets 401.

**Possible Issues:**
- `api-keys-lookup` endpoint path might be wrong
- Gateway's `ACP_KERNEL_KEY` might be invalid
- Response format might not match expectations
- Endpoint might not be deployed

**Location:** `agentic-control-plane-kit/gateway/auth.ts` line 118
- Calls: `${baseUrl}/functions/v1/api-keys-lookup`
- Uses: `ACP_KERNEL_KEY` for Bearer token auth
- Expects: `{ ok: true, data: { tenant_id: "..." } }`

**Next Steps:**
1. Verify `api-keys-lookup` endpoint exists and is deployed
2. Test endpoint directly with kernel key
3. Check gateway logs for detailed error (logging was improved)
4. Verify `ACP_KERNEL_KEY` environment variable is set correctly

### 2. Email Verification Checks

**Verify:**
- Code compiles without syntax errors
- Database query for `email_verified` works correctly
- 403 response format is correct
- All write endpoints have the check

### 3. Whoami Endpoint

**Verify:**
- Endpoint is properly deployed
- Returns correct format
- Handles errors correctly
- CORS headers are correct

### 4. Stripe Customer Creation

**Verify:**
- Stripe code is completely removed from `consumer-signup`
- Stripe customer creation still works in `verify-email` endpoint (Repo B)
- Idempotency is working correctly

---

## Testing Checklist

After fixes are verified:

- [ ] Gateway accepts valid API key (no 401)
- [ ] Write endpoints return 403 for unverified emails
- [ ] Write endpoints allow writes for verified emails
- [ ] `/whoami` returns correct verification status
- [ ] Stripe customer only created after verification
- [ ] No Stripe customer created at signup
- [ ] Rate limiting works (test with 10+ requests)

---

## Files That Were Changed

**Repo A:**
- `gateway/auth.ts`

**Repo B:**
- `supabase/functions/mcp-servers-register/index.ts`
- `supabase/functions/mcp-servers-update/index.ts`
- `supabase/functions/mcp-servers-delete/index.ts`
- `supabase/functions/policy-propose/index.ts`
- `supabase/functions/whoami/index.ts` (NEW)

**Repo D:**
- `supabase/functions/consumer-signup/index.ts`

---

## Original Security Review Feedback

From agent testing:
- Signup returns API key immediately (expected - read-only until verified)
- Gateway rejects valid keys (401) - **NEEDS FIX**
- Write endpoints allow writes without verification - **FIXED** (needs verification)
- Stripe customer duplicated on repeated signups - **FIXED** (needs verification)
- No way to check verification status - **FIXED** (whoami endpoint created)

---

## Next Agent Instructions

1. Review all modified files for syntax errors
2. Test gateway auth - verify `api-keys-lookup` endpoint works
3. Verify email verification checks are correct
4. Test `/whoami` endpoint
5. Verify Stripe customer creation is removed from signup
6. Deploy and test end-to-end

Good luck! 🚀
