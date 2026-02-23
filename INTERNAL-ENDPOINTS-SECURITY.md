# Internal Endpoints Security Model

**Date:** February 23, 2026  
**Purpose:** Remove service role keys from Repo C, use HMAC-based internal endpoints

---

## Problem

**Before:** Repo C (Key Vault Executor) used Supabase service role keys to call Repo B (Governance Hub), which:
- ❌ Exposes service role keys outside Repo B
- ❌ Bypasses RLS policies
- ❌ Violates least privilege principle
- ❌ Creates security risk if Repo C is compromised

**After:** Repo B exposes internal endpoints with HMAC authentication:
- ✅ No service role keys leave Repo B
- ✅ No RLS bypass (internal endpoints use service role only within Repo B)
- ✅ Least privilege (Repo C only needs `REPO_B_INTERNAL_SECRET`)
- ✅ Clean security story for enterprise

---

## Architecture

```
Repo C (Key Vault Executor)
  ↓
  Uses: REPO_B_URL + REPO_B_INTERNAL_SECRET
  ↓
  Calls: POST /functions/v1/internal/audit
  ↓
  HMAC Authentication (X-Timestamp + X-Signature)
  ↓
Repo B (Governance Hub)
  ↓
  Verifies HMAC
  ↓
  Uses service role internally (never exposed)
  ↓
  Inserts audit record
```

---

## Implementation

### Repo B: Internal Audit Endpoint

**File:** `governance-hub/supabase/functions/internal-audit/index.ts`

**Endpoint:** `POST /functions/v1/internal/audit`

**Authentication:**
- HMAC-SHA-256 signature
- `X-Timestamp` header (prevents replay attacks, 5-minute window)
- `X-Signature` header (HMAC of `timestamp:body`)

**Request:**
```json
{
  "event_type": "credential_deletion",
  "tenant_id": "uuid",
  "data": {
    "service": "shopify",
    "credential_type": "api_key",
    "actor_type": "system",
    "actor_id": "key-vault-executor"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Audit event recorded"
}
```

**Security:**
- ✅ HMAC verification with constant-time comparison
- ✅ Timestamp validation (5-minute window)
- ✅ Service role key only used internally (never exposed)
- ✅ No RLS bypass (service role is appropriate for internal operations)

---

### Repo C: Updated Credential Deletion

**File:** `key-vault-executor/supabase/functions/credentials-delete/index.ts`

**Changes:**
- ❌ Removed: `REPO_B_SERVICE_KEY` and `REPO_B_ANON_KEY` usage
- ✅ Added: HMAC signature generation
- ✅ Added: Call to `/internal/api-keys/lookup` endpoint (for tenant lookup)
- ✅ Added: Call to `/internal/audit` endpoint (for audit events)

**Environment Variables:**
```bash
REPO_B_URL=https://your-governance-hub.supabase.co
REPO_B_INTERNAL_SECRET=your_shared_secret_here  # Same secret as Repo B
```

**Removed Environment Variables:**
```bash
# ❌ No longer needed:
# REPO_B_SERVICE_KEY=...
# REPO_B_ANON_KEY=...
```

**HMAC Generation:**
```typescript
const message = `${timestamp}:${body}`;
const signature = HMAC-SHA-256(REPO_B_INTERNAL_SECRET, message);
```

**Headers:**
```
X-Timestamp: 1706123456789
X-Signature: abc123def456...
```

---

## Security Benefits

### 1. No Service Role Keys Outside Repo B

**Before:**
```typescript
// Repo C had this:
const supabase = createClient(REPO_B_URL, REPO_B_SERVICE_ROLE_KEY);
// ❌ Service role key exposed in Repo C
```

**After:**
```typescript
// Repo C only has:
const REPO_B_INTERNAL_SECRET = Deno.env.get('REPO_B_INTERNAL_SECRET');
// ✅ Shared secret, not a service role key
```

### 2. No RLS Bypass

**Before:**
- Repo C used service role key → bypassed all RLS policies
- Could read/write any tenant's data

**After:**
- Repo C calls internal endpoint → Repo B verifies HMAC
- Repo B uses service role internally (appropriate for internal operations)
- RLS is still enforced for external API calls

### 3. Least Privilege

**Before:**
- Repo C had full service role access
- Could do anything in Repo B

**After:**
- Repo C can only call `/internal/audit`
- Cannot read/write other data
- Cannot bypass policies

### 4. Replay Attack Prevention

- Timestamp validation (5-minute window)
- HMAC includes timestamp in signature
- Old requests cannot be replayed

---

## Deployment

### Repo B

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

# Add new internal endpoints
git add supabase/functions/internal-audit/index.ts
git add supabase/functions/internal-api-keys-lookup/index.ts

# Set environment variable in Supabase
# REPO_B_INTERNAL_SECRET=your_shared_secret_here

# Deploy
supabase functions deploy internal-audit
supabase functions deploy internal-api-keys-lookup

# Commit
git commit -m "Add internal endpoints with HMAC authentication

- Remove service role key dependency from Repo C
- Add POST /functions/v1/internal/audit endpoint
- Add POST /functions/v1/internal/api-keys/lookup endpoint
- HMAC-SHA-256 authentication with timestamp validation
- Prevents replay attacks (5-minute window)
- No service role keys leave Repo B"

git push origin main
```

### Repo C

```bash
cd /Users/rastakit/tga-workspace/repos/key-vault-executor

# Update credentials-delete endpoint
git add supabase/functions/credentials-delete/index.ts

# Set environment variables in Supabase
# REPO_B_URL=https://your-governance-hub.supabase.co
# REPO_B_INTERNAL_SECRET=your_shared_secret_here (same as Repo B)

# Remove old environment variables (no longer needed):
# REPO_B_SERVICE_KEY=... (DELETE)
# REPO_B_ANON_KEY=... (DELETE)

# Deploy
supabase functions deploy credentials-delete

# Commit
git commit -m "Use Repo B internal endpoints (HMAC auth)

- Remove REPO_B_SERVICE_KEY and REPO_B_ANON_KEY dependencies
- Use HMAC authentication for internal endpoints
- Generate X-Timestamp and X-Signature headers
- Call POST /functions/v1/internal/api-keys/lookup (tenant lookup)
- Call POST /functions/v1/internal/audit (audit events)
- No service role keys in Repo C"

git push origin main
```

---

## Future Internal Endpoints

**Implemented Internal Endpoints:**

- ✅ `POST /internal/api-keys/lookup` - For API key validation (used by Repo C)
- ✅ `POST /internal/audit` - For audit events (used by Repo C)

**Future Internal Endpoints (if needed):**

- `POST /internal/policy-check` - For policy evaluation (if needed)
- `GET /internal/tenant-status` - For tenant health checks (if needed)

**Pattern:**
- All use HMAC authentication
- All use `REPO_B_INTERNAL_SECRET`
- All are read-only or write-only (no mixed operations)
- All have clear purpose and minimal scope

---

## Security Checklist

- ✅ No service role keys in Repo C
- ✅ HMAC authentication with timestamp validation
- ✅ Replay attack prevention (5-minute window)
- ✅ Constant-time signature comparison
- ✅ Least privilege (Repo C can only call specific endpoints)
- ✅ Clear separation of concerns (Repo B handles internal operations)
- ✅ Audit trail (all internal calls are logged)

---

**Document Version:** 1.0  
**Last Updated:** February 23, 2026
