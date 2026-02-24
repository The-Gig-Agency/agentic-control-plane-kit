# Signup Security Implementation - Option B

**Status:** Implementation in Progress  
**Approach:** Option B - Immediate key with read-only scopes until email verified

---

## What's Been Implemented

### ✅ Repo B (Governance Hub)

1. **Database Migration** (`20260225000000_add_email_verification.sql`)
   - Added `email_verified` to `tenants` table
   - Created `verification_tokens` table
   - Created `signup_idempotency` table
   - Created `signup_rate_limits` table
   - Added `last_used_at` to `api_keys` table

2. **Verify Email Endpoint** (`verify-email/index.ts`)
   - Validates verification token
   - Marks email as verified
   - Upgrades API key scopes to include write
   - Creates Stripe customer (delayed until verification)

3. **API Key Creation Updates** (`api-keys-create/index.ts`)
   - Defaults to read-only scopes if email not verified
   - Read-only: `['mcp.read', 'mcp.meta.discover']`
   - Full scopes: `['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling']`

---

## What Still Needs Implementation

### 🔴 Critical: Repo B - tenants-create Endpoint

**File:** `governance-hub/supabase/functions/tenants-create/index.ts`

**Required Updates:**

1. **Idempotency Key Support**
   ```typescript
   // Require Idempotency-Key header
   const idempotencyKey = req.headers.get('Idempotency-Key');
   if (!idempotencyKey) {
     return new Response(JSON.stringify({ error: 'Idempotency-Key header required' }), { status: 400 });
   }
   
   // Check for duplicate
   const { data: existing } = await supabase
     .from('signup_idempotency')
     .select('tenant_id')
     .eq('idempotency_key', idempotencyKey)
     .gt('expires_at', new Date().toISOString())
     .single();
   
   if (existing) {
     // Return existing tenant
     return existing tenant;
   }
   ```

2. **Rate Limiting**
   ```typescript
   // Per-email: Max 3 attempts per 24 hours
   const emailAttempts = await checkRateLimit(email, 'email', 3, 24 * 60 * 60 * 1000);
   if (emailAttempts.exceeded) {
     return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 3 signups per email per 24 hours.' }), { status: 429 });
   }
   
   // Per-IP: Max 10 attempts per hour, 1 per 5 minutes
   const ipAddress = req.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown';
   const ipAttempts = await checkRateLimit(ipAddress, 'ip', 10, 60 * 60 * 1000);
   if (ipAttempts.exceeded) {
     return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 signups per IP per hour.' }), { status: 429 });
   }
   ```

3. **Verification Token Creation**
   ```typescript
   // Generate verification token
   const verificationToken = generateVerificationToken();
   const tokenHash = await hashToken(verificationToken);
   
   // Store in verification_tokens table
   await supabase.from('verification_tokens').insert({
     token: tokenHash,
     tenant_id: tenant.id,
     email: billing_email,
     expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
   });
   ```

4. **Remove Stripe Customer Creation**
   - Remove all Stripe customer creation code
   - Stripe customer will be created in `verify-email` endpoint

5. **Set email_verified: false**
   ```typescript
   // Create tenant with email_verified: false
   const { data: tenant } = await supabase.from('tenants').insert({
     // ... other fields
     email_verified: false,
   });
   ```

6. **Store Idempotency Key**
   ```typescript
   // After tenant creation, store idempotency key
   await supabase.from('signup_idempotency').insert({
     idempotency_key: idempotencyKey,
     email: billing_email,
     tenant_id: tenant.id,
     expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
   });
   ```

7. **Return Verification Token**
   ```typescript
   return new Response(JSON.stringify({
     ok: true,
     data: {
       tenant_id: tenant.id,
       verification_token: verificationToken, // Include in response for email sending
       email_verified: false,
       message: 'Tenant created. Check your email to verify and enable write scopes.',
     },
   }));
   ```

---

### 🔴 Critical: Main Website - Signup Service

**Location:** `www.buyechelon.com/api/consumer/signup` (Vercel edge function or similar)

**Required Updates:**

1. **Add Idempotency-Key Header**
   ```typescript
   // Generate idempotency key from email + timestamp
   const idempotencyKey = await sha256(`${email}-${Date.now()}`);
   
   // Include in request to Repo B
   const tenantRes = await fetch(`${repoBUrl}/functions/v1/tenants/create`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${signupServiceKey}`,
       'Content-Type': 'application/json',
       'Idempotency-Key': idempotencyKey, // NEW
     },
     body: JSON.stringify({ ... }),
   });
   ```

2. **Extract Verification Token from Response**
   ```typescript
   const { tenant_id, verification_token } = await tenantRes.json();
   
   // Store verification_token for email sending
   ```

3. **Create API Key with Read-Only Scopes**
   ```typescript
   // API key will automatically get read-only scopes (handled by api-keys-create)
   const apiKeyRes = await fetch(`${repoBUrl}/functions/v1/api-keys/create`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${signupServiceKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       tenant_id,
       prefix: 'mcp_',
       // scopes not specified - will default to read-only
     }),
   });
   ```

4. **Send Welcome Email with Verification Link**
   ```typescript
   const verificationUrl = `https://www.buyechelon.com/verify-email?token=${verification_token}`;
   
   await sendWelcomeEmail(email, {
     api_key: apiKeyData.api_key,
     verification_url: verificationUrl,
     message: 'Your API key is read-only until you verify your email. Click the link to enable write scopes.',
   });
   ```

5. **Return API Key + Verification Info**
   ```typescript
   return res.status(200).json({
     ok: true,
     tenant_id,
     api_key: apiKeyData.api_key,
     email_verified: false,
     verification_required: true,
     message: 'Check your email to verify and enable write scopes.',
   });
   ```

---

### 🟡 Important: Verification Page

**Location:** `www.buyechelon.com/verify-email`

**Required:**

1. **Extract Token from URL**
   ```typescript
   const urlParams = new URLSearchParams(window.location.search);
   const token = urlParams.get('token');
   ```

2. **Call Verify Email Endpoint**
   ```typescript
   const res = await fetch('https://governance-hub.supabase.co/functions/v1/verify-email', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ verification_token: token }),
   });
   ```

3. **Show Success/Error Message**
   - Success: "Email verified! Write scopes have been enabled."
   - Error: Show error message from API

---

## Testing Checklist

- [ ] Signup returns API key immediately
- [ ] API key has read-only scopes initially
- [ ] Verification email sent with link
- [ ] Clicking verification link enables write scopes
- [ ] Stripe customer created only after verification
- [ ] Idempotency key prevents duplicate signups
- [ ] Rate limiting prevents abuse
- [ ] Unverified keys can only call read endpoints

---

## Next Steps

1. Update `tenants-create` endpoint with idempotency + rate limiting
2. Update main website signup service
3. Create verification page
4. Test end-to-end flow
5. Deploy to production
