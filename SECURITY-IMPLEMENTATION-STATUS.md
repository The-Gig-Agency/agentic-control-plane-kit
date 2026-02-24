# Security Implementation Status - Option B

**Date:** February 25, 2026  
**Approach:** Option B - Immediate API key with read-only scopes until email verified

---

## ✅ Completed (Repo B)

### 1. Database Migration
**File:** `governance-hub/supabase/migrations/20260225000000_add_email_verification.sql`

**Added:**
- `email_verified` column to `tenants` table
- `verification_tokens` table
- `signup_idempotency` table
- `signup_rate_limits` table
- `last_used_at` column to `api_keys` table

**Status:** ✅ Ready to deploy

### 2. Verify Email Endpoint
**File:** `governance-hub/supabase/functions/verify-email/index.ts`

**Features:**
- Validates verification token
- Marks email as verified
- Upgrades API key scopes to include write
- Creates Stripe customer (delayed until verification)
- Uses idempotent Stripe customer creation

**Status:** ✅ Ready to deploy

### 3. API Key Creation Updates
**File:** `governance-hub/supabase/functions/api-keys-create/index.ts`

**Changes:**
- Checks `tenant.email_verified` status
- Defaults to read-only scopes if email not verified: `['mcp.read', 'mcp.meta.discover']`
- Full scopes if verified: `['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling']`

**Status:** ✅ Updated

---

## 🔴 Still Needed (Repo B)

### tenants-create Endpoint Updates

**File:** `governance-hub/supabase/functions/tenants-create/index.ts`

**Required Changes:**

1. **Add Idempotency Key Support**
   - Require `Idempotency-Key` header
   - Check `signup_idempotency` table for duplicates
   - Return existing tenant if idempotency key matches

2. **Add Rate Limiting**
   - Per-email: Max 3 attempts per 24 hours
   - Per-IP: Max 10 attempts per hour
   - Per-IP: Max 1 attempt per 5 minutes (burst)
   - Store in `signup_rate_limits` table

3. **Create Verification Token**
   - Generate HMAC-signed token (expires in 24 hours)
   - Store in `verification_tokens` table
   - Include in response for email sending

4. **Set email_verified: false**
   - Add `email_verified: false` to tenant creation

5. **Remove Stripe Customer Creation**
   - Remove all Stripe code (moved to verify-email)

6. **Store Idempotency Key**
   - After tenant creation, store in `signup_idempotency` table

**Status:** ⚠️ Needs implementation

---

## 🔴 Still Needed (Main Website)

### Signup Service Updates

**Location:** `www.buyechelon.com/api/consumer/signup`

**Required Changes:**

1. **Add Idempotency-Key Header**
   - Generate from email + timestamp
   - Include in request to Repo B

2. **Extract Verification Token**
   - Get `verification_token` from Repo B response
   - Store for email sending

3. **Create API Key**
   - Call `api-keys/create` (will default to read-only)

4. **Send Welcome Email**
   - Include verification link: `https://www.buyechelon.com/verify-email?token={token}`
   - Include API key
   - Message: "Your API key is read-only until you verify your email"

5. **Return Response**
   - Include `api_key`, `verification_required: true`, `email_verified: false`

**Status:** ⚠️ Needs implementation

### Verification Page

**Location:** `www.buyechelon.com/verify-email`

**Required:**
- Extract token from URL
- Call `POST /functions/v1/verify-email` with token
- Show success/error message

**Status:** ⚠️ Needs implementation

---

## 📋 Deployment Checklist

### Repo B (Governance Hub)

- [ ] Run migration: `supabase db push`
- [ ] Deploy verify-email function: `supabase functions deploy verify-email`
- [ ] Update tenants-create function (add idempotency, rate limiting, verification token)
- [ ] Test verify-email endpoint
- [ ] Test API key creation with unverified tenant

### Main Website

- [ ] Update signup service to include Idempotency-Key
- [ ] Update signup service to extract verification token
- [ ] Update welcome email template with verification link
- [ ] Create verification page
- [ ] Test end-to-end signup flow

---

## 🧪 Testing Steps

1. **Signup Flow**
   ```bash
   curl -X POST https://www.buyechelon.com/api/consumer/signup \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: test-123" \
     -d '{"name":"Test Org","email":"test@example.com"}'
   ```
   - Should return API key with read-only scopes
   - Should return verification_token
   - Should NOT create Stripe customer

2. **Verify Email**
   ```bash
   curl -X POST https://governance-hub.supabase.co/functions/v1/verify-email \
     -H "Content-Type: application/json" \
     -d '{"verification_token":"..."}'
   ```
   - Should mark email as verified
   - Should upgrade API key scopes
   - Should create Stripe customer

3. **Test Read-Only Key**
   - Try to register MCP server with unverified key → should fail (no write scope)
   - Try to call meta.discover → should work (read scope)

4. **Test Verified Key**
   - After verification, try to register MCP server → should work (write scope)

---

## 📝 Next Steps

1. **Complete tenants-create updates** (Repo B)
2. **Update main website signup service**
3. **Create verification page**
4. **Test end-to-end**
5. **Deploy to production**

---

## 📦 Files Created/Modified

### Repo B (governance-hub)

**New Files:**
- `supabase/migrations/20260225000000_add_email_verification.sql`
- `supabase/functions/verify-email/index.ts`
- `supabase/functions/tenants-create/SECURITY-UPDATES.md`

**Modified Files:**
- `supabase/functions/api-keys-create/index.ts` (default scopes based on email_verified)

### Repo A (agentic-control-plane-kit)

**New Files:**
- `SIGNUP-SECURITY-IMPLEMENTATION.md`
- `SECURITY-IMPLEMENTATION-STATUS.md` (this file)

---

## 🚀 CLI Commands to Push

### Repo B (governance-hub)

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

git add supabase/migrations/20260225000000_add_email_verification.sql
git add supabase/functions/verify-email/
git add supabase/functions/api-keys-create/index.ts
git add supabase/functions/tenants-create/SECURITY-UPDATES.md

git commit -m "Add email verification support (Option B)

- Migration: Add email_verified, verification_tokens, signup_idempotency, signup_rate_limits
- Verify-email endpoint: Validates token, upgrades scopes, creates Stripe customer
- API key creation: Defaults to read-only scopes if email not verified
- Implements Option B: Immediate key with read-only until verified"

git push origin main
```

### Repo A (agentic-control-plane-kit)

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

git add SIGNUP-SECURITY-IMPLEMENTATION.md SECURITY-IMPLEMENTATION-STATUS.md

git commit -m "Add security implementation documentation

- Document Option B implementation (immediate key, read-only until verified)
- Status tracking for Repo B and main website updates
- Testing checklist and deployment steps"

git push origin main
```

---

**Note:** The `tenants-create` endpoint still needs to be updated with idempotency, rate limiting, and verification token creation. This is documented in `SIGNUP-SECURITY-IMPLEMENTATION.md`.
