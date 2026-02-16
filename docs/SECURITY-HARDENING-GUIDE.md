# Security Hardening Guide: API Key Protection

## Executive Summary

**Repo A (agentic-control-plane-kit) does NOT persist API keys** - it only stores hashed keys in the database. However, API keys can still be exposed in several places unless explicitly hardened.

## Current State: What's Safe ✅

1. **Database Storage**: ✅ Only hashed keys stored (`key_hash` column)
2. **Audit Logs**: ✅ Uses `payloadHash` (hashed) not raw payload
3. **Actor ID in Logs**: ✅ Uses `keyPrefix` (e.g., `ciq_test1234`) not full key
4. **Auth Flow**: ✅ Keys are hashed immediately after extraction from headers

## Critical Exposure Points (Must Harden)

### 1. Process Environment Variables ⚠️

**Risk**: If Repo A runs as a service and API keys are injected via env vars, they persist in process memory and can be dumped.

**Current State**: 
- Kernel reads keys from `X-API-Key` header (not env vars) ✅
- But host repos (CIQ, Lead Scoring) might store keys in env vars

**Hardening Required**:
```bash
# Audit checklist:
- [ ] No API keys in environment variables
- [ ] Use secret management (AWS Secrets Manager, Vault, etc.)
- [ ] Rotate keys regularly
- [ ] Use different keys per environment (dev/staging/prod)
```

**Recommendation**: Document that host repos should use secret management, not env vars.

---

### 2. Request Logs (Headers/Payloads) ⚠️⚠️ **HIGH RISK**

**Risk**: If request logging captures headers or full payloads, API keys are exposed.

**Current State**:
- Kernel uses `hashPayload()` for audit logs ✅
- But `hashPayload()` is a **placeholder** - needs real implementation
- No evidence of request header logging in kernel ✅

**Hardening Required**:

**A. Fix `hashPayload()` Implementation**:
```typescript
// kernel/src/audit.ts - CURRENT (PLACEHOLDER)
export function hashPayload(body: string): string {
  return `hash_${body.length}`; // ❌ NOT A REAL HASH
}

// SHOULD BE:
export async function hashPayload(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**B. Ensure Headers Are Never Logged**:
```typescript
// ✅ GOOD: Only log key prefix
actorId: keyPrefix || 'unknown'  // e.g., "ciq_test1234"

// ❌ BAD: Never do this
actorId: apiKey  // Full key exposed!
```

**C. Audit Host Repo Logging**:
- Check Supabase Edge Functions for request logging
- Check Django middleware for request logging
- Check any application-level logging

**Recommendation**: Add explicit header filtering in all logging middleware.

---

### 3. Job Payloads (Queue Systems) ⚠️

**Risk**: If requests are enqueued (e.g., background jobs, retries), full payloads with API keys might be stored.

**Current State**:
- Kernel doesn't enqueue requests ✅
- But host repos might use queues (Supabase Queue, Bull, etc.)

**Hardening Required**:
```typescript
// ❌ BAD: Enqueue full request
await queue.add('process-action', {
  action: req.action,
  params: req.params,
  headers: req.headers  // API key exposed!
});

// ✅ GOOD: Strip headers before enqueueing
await queue.add('process-action', {
  action: req.action,
  params: req.params,
  apiKeyId: authResult.apiKeyId,  // Use ID, not key
  tenantId: authResult.tenantId
});
```

**Recommendation**: Document that host repos must strip headers before enqueueing.

---

### 4. Audit Events (Input Recording) ⚠️

**Risk**: If audit logs record inputs verbatim, API keys in params might be exposed.

**Current State**:
- Kernel uses `payloadHash` (hashed) ✅
- But `hashPayload()` is placeholder (see #2)
- `beforeSnapshot` and `afterSnapshot` might contain sensitive data

**Hardening Required**:

**A. Sanitize Snapshots**:
```typescript
// ❌ BAD: Log raw params
beforeSnapshot: params  // Might contain API keys

// ✅ GOOD: Sanitize before logging
beforeSnapshot: sanitizeForAudit(params)

function sanitizeForAudit(data: any): any {
  const sanitized = { ...data };
  // Remove common key fields
  delete sanitized.apiKey;
  delete sanitized.api_key;
  delete sanitized.token;
  delete sanitized.password;
  // Recursively sanitize nested objects
  return sanitized;
}
```

**B. Implement Real Payload Hashing** (see #2)

**Recommendation**: Add audit sanitization utility to kernel.

---

### 5. Edge Bot Logs / Terminal History ⚠️⚠️⚠️ **VERY HIGH RISK**

**Risk**: If agents use curl/terminal commands, API keys appear in:
- Terminal history (`.bash_history`, `.zsh_history`)
- Edge bot execution logs
- Screen recordings
- Clipboard history

**Current State**:
- Kernel doesn't control how agents call it ❌
- This is an **agent-side** problem

**Hardening Required**:

**A. Agent Documentation**:
```markdown
# ❌ BAD: API key in command
curl -H "X-API-Key: ciq_secret123456789" ...

# ✅ GOOD: Use environment variable
export ACP_API_KEY="ciq_secret123456789"
curl -H "X-API-Key: $ACP_API_KEY" ...

# ✅ BETTER: Use secret management
curl -H "X-API-Key: $(vault read -field=key secret/acp/api-key)" ...
```

**B. Provide SDK/Client Libraries**:
- SDK handles key management
- Keys stored in secure keychain (not terminal)
- No manual curl commands needed

**C. Rotate Keys After Exposure**:
- If key appears in logs, rotate immediately
- Implement key rotation API

**Recommendation**: 
1. Create SDK that handles key management securely
2. Document best practices for agent key storage
3. Add key rotation endpoints

---

## Additional Hardening Recommendations

### 6. Idempotency Cache ⚠️

**Risk**: If idempotency cache stores full responses, API keys might leak.

**Current State**:
- Kernel stores idempotency responses via adapter
- Adapter implementation is host-specific

**Hardening Required**:
- Ensure idempotency cache doesn't store headers
- Only store response body, not full HTTP response

---

### 7. Error Messages ⚠️

**Risk**: Error messages might leak API key prefixes or other sensitive info.

**Current State**:
- Kernel uses generic error messages ✅
- But `keyPrefix` is logged in audit (acceptable - it's public)

**Hardening Required**:
- Never include full API key in error messages
- Key prefix is acceptable (it's public identifier)

---

### 8. Platform Communication (Repo B) ⚠️

**Risk**: When kernel calls platform `/authorize`, API keys might be in request.

**Current State**:
- Kernel should use kernel API key (not user API key) ✅
- But implementation not yet done

**Hardening Required**:
```typescript
// ✅ GOOD: Kernel uses its own API key
Authorization: Bearer acp_kernel_xxx

// ❌ BAD: Forwarding user API key
Authorization: Bearer ${userApiKey}
```

---

## Implementation Checklist

### Immediate Actions (Critical)

- [ ] **Fix `hashPayload()` implementation** - Replace placeholder with real SHA-256
- [ ] **Audit all host repos** - Check for request logging, header logging
- [ ] **Add audit sanitization** - Strip sensitive fields from snapshots
- [ ] **Document agent key management** - Best practices guide

### Short-Term (High Priority)

- [ ] **Create SDK** - Secure key management for agents
- [ ] **Add key rotation API** - Allow immediate key revocation
- [ ] **Add header filtering middleware** - Prevent accidental header logging
- [ ] **Audit queue systems** - Ensure no keys in job payloads

### Long-Term (Best Practices)

- [ ] **Secret management integration** - Vault, AWS Secrets Manager
- [ ] **Key expiration policies** - Auto-rotate keys
- [ ] **Audit log encryption** - Encrypt sensitive audit fields
- [ ] **Key usage monitoring** - Alert on suspicious patterns

---

## Testing for Key Exposure

### Audit Script

```bash
# 1. Check for API keys in codebase
grep -r "api.*key.*=" --include="*.ts" --include="*.js" --include="*.py"

# 2. Check for keys in environment files
grep -r "API_KEY\|API-KEY" .env* 2>/dev/null

# 3. Check for keys in logs (if you have access)
grep -r "ciq_\|ock_\|sk_" logs/ 2>/dev/null

# 4. Check terminal history
grep "X-API-Key\|api.*key" ~/.bash_history ~/.zsh_history 2>/dev/null
```

### Code Review Checklist

- [ ] No API keys hardcoded in source
- [ ] No API keys in environment files (committed)
- [ ] Request logging strips headers
- [ ] Audit logs use hashed payloads
- [ ] Error messages don't leak keys
- [ ] Queue payloads don't include headers

---

## Summary

**Repo A (kernel) is relatively safe** - it hashes keys and doesn't log them directly. However:

1. **`hashPayload()` is a placeholder** - Must implement real hashing
2. **Host repos need auditing** - They might log headers/payloads
3. **Agent-side is highest risk** - Terminal history, edge bot logs
4. **Queue systems need review** - Ensure no keys in job payloads

**Priority**: Fix `hashPayload()` implementation first, then audit host repos.

---

*Last Updated: February 2026*
*Status: Security Hardening Guide*
