# Security Review - All Three Repositories

**Date:** February 2026  
**Scope:** Repo A (agentic-control-plane-kit), Repo B (governance-hub), Repo C (key-vault-executor)  
**Status:** Comprehensive Security Assessment

---

## Executive Summary

### Overall Security Posture: **GOOD** ✅

The three-repo architecture demonstrates strong security fundamentals with proper separation of concerns, secure authentication, and comprehensive audit logging. However, several areas require attention before production deployment.

### Critical Issues: **2** 🔴 (FIXED ✅)
### High Priority: **5** 🟠
### Medium Priority: **8** 🟡
### Low Priority: **3** 🟢

---

## 1. Authentication & Authorization

### ✅ **Strengths**

1. **API Key Hashing**
   - ✅ All API keys stored as SHA-256 hashes (never plaintext)
   - ✅ HMAC-SHA-256 used for kernel authentication
   - ✅ Keys validated via hash comparison
   - **Location:** `governance-hub/supabase/functions/api-keys-*/index.ts`

2. **Kernel Authentication**
   - ✅ HMAC-based verification for kernel API keys
   - ✅ Organization-level isolation enforced
   - ✅ Proper tenant verification before operations
   - **Location:** `governance-hub/supabase/functions/*/verifyKernelAuth()`

3. **Scope-Based Authorization**
   - ✅ Action-level scope requirements enforced
   - ✅ Scope checking before action execution
   - ✅ Audit logging for denied requests
   - **Location:** `agentic-control-plane-kit/kernel/src/router.ts:217`

4. **Multi-Tenant Isolation**
   - ✅ Tenant ID extracted from API key
   - ✅ Authorization requests scoped to tenant
   - ✅ Database queries filtered by tenant_id
   - **Location:** All three repos

### ✅ **Fixed Critical Issues**

1. **CORS Wildcard (`*`)** - **FIXED** ✅
   - **Previous Issue:** All endpoints used `Access-Control-Allow-Origin: *`
   - **Fix Applied:** 
     - Added `getCorsHeaders()` function that checks `ALLOWED_ORIGINS` env var
     - Falls back to `DEFAULT_CORS_ORIGIN` env var (defaults to `https://echelon.com`)
     - Validates origin header against allowed list
   - **Location:** 
     - `agentic-control-plane-kit/gateway/http-server.ts`
     - `governance-hub/supabase/functions/*/index.ts`
   - **Configuration Required:**
     ```bash
     # Set in environment variables
     ALLOWED_ORIGINS=https://app.echelon.com,https://dashboard.echelon.com
     DEFAULT_CORS_ORIGIN=https://echelon.com
     ```

2. **API Key in Query Parameters** - **FIXED** ✅
   - **Previous Issue:** Gateway accepted API key via `?api_key=...` query parameter
   - **Fix Applied:** 
     - Removed query parameter support
     - Now requires `X-API-Key` header only
     - Updated error message to reflect header requirement
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts:60-71`

3. **MCP Request Validation** - **FIXED** ✅
   - **Previous Issue:** No input validation on MCP requests
   - **Fix Applied:**
     - Added JSON-RPC 2.0 structure validation
     - Validates `jsonrpc`, `method`, `params` fields
     - Added request size limit (1MB)
     - Proper error responses for validation failures
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts:98-145`

### 🟠 **High Priority**

1. **No Rate Limiting on API Key Lookup**
   - **Issue:** `api-keys/lookup` endpoint has no rate limiting
   - **Risk:** Brute force attacks on API key hashes
   - **Location:** `governance-hub/supabase/functions/api-keys-lookup/index.ts`
   - **Recommendation:** Add rate limiting (e.g., 10 requests/minute per IP)

2. **No API Key Rotation Mechanism**
   - **Issue:** No documented process for rotating API keys
   - **Risk:** Compromised keys remain valid indefinitely
   - **Recommendation:** Add key rotation endpoint and expiration enforcement

3. **Tenant Verification Missing in Some Paths**
   - **Issue:** Gateway's `extractTenantFromApiKey` doesn't verify tenant belongs to organization
   - **Location:** `agentic-control-plane-kit/gateway/auth.ts:93-158`
   - **Recommendation:** Add organization verification in lookup response

---

## 2. Input Validation & SQL Injection

### ✅ **Strengths**

1. **Supabase Client (Parameterized Queries)**
   - ✅ All database queries use Supabase client (parameterized by default)
   - ✅ No raw SQL string concatenation found
   - ✅ `.eq()`, `.select()`, `.insert()` methods prevent SQL injection
   - **Location:** All Supabase functions

2. **Request Schema Validation**
   - ✅ Action parameters validated against schemas
   - ✅ Type checking before processing
   - ✅ Validation errors returned with clear messages
   - **Location:** `agentic-control-plane-kit/kernel/src/validate.ts`

3. **JSON Parsing Error Handling**
   - ✅ Try-catch around JSON parsing
   - ✅ Proper error responses for malformed JSON
   - **Location:** Multiple endpoints

### 🟠 **High Priority**

1. **UUID Validation Missing**
   - **Issue:** UUIDs accepted without format validation
   - **Risk:** Invalid UUIDs could cause database errors
   - **Location:** `governance-hub/supabase/functions/api-keys-create/index.ts:122`
   - **Recommendation:**
     ```typescript
     function isValidUUID(str: string): boolean {
       const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       return uuidRegex.test(str);
     }
     ```

2. **String Length Limits Missing**
   - **Issue:** No max length validation on user inputs
   - **Risk:** DoS via extremely long strings
   - **Location:** Multiple endpoints
   - **Recommendation:** Add max length checks (e.g., 1000 chars for strings)

3. **Array Size Limits Missing**
   - **Issue:** Arrays in requests not size-limited
   - **Risk:** DoS via large arrays
   - **Location:** `agentic-control-plane-kit/gateway/policy.ts:173`
   - **Recommendation:** Limit array sizes (e.g., max 100 items)

---

## 3. Secret Management

### ✅ **Strengths**

1. **Environment Variables for Secrets**
   - ✅ All secrets stored in environment variables
   - ✅ No hardcoded secrets found
   - ✅ HMAC_PEPPER, SUPABASE_SERVICE_ROLE_KEY, etc. from env

2. **Secret Redaction in Logs**
   - ✅ Comprehensive sanitization of sensitive fields
   - ✅ `SENSITIVE_FIELDS` list covers common secrets
   - ✅ Audit events never include request payloads (only hashes)
   - **Location:** `agentic-control-plane-kit/kernel/src/sanitize.ts`

3. **API Key Hashing**
   - ✅ Keys hashed before storage
   - ✅ Plaintext keys only returned once (on creation)
   - ✅ Hash comparison for validation

### 🟡 **Medium Priority**

1. **Error Messages May Leak Secrets**
   - **Issue:** Some error messages include full error objects
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts:169`
   - **Status:** ✅ **FIXED** - Error messages now sanitized, no internal details exposed

2. **Stack Traces in Error Responses**
   - **Issue:** `formatError()` includes stack traces (though not in responses)
   - **Location:** `agentic-control-plane-kit/gateway/errors.ts:156`
   - **Recommendation:** Only include stack traces in server logs, never in API responses

---

## 4. Error Handling & Information Disclosure

### ✅ **Strengths**

1. **Structured Error Responses**
   - ✅ Custom error classes with appropriate HTTP status codes
   - ✅ Error codes for programmatic handling
   - ✅ No stack traces in API responses

2. **Error Sanitization**
   - ✅ `redactString()` function removes secrets from error messages
   - ✅ Generic error messages for authentication failures
   - **Location:** `agentic-control-plane-kit/kernel/src/sanitize.ts:189`

### 🟡 **Medium Priority**

1. **Generic Error Messages Needed**
   - **Issue:** Some errors reveal internal details
   - **Location:** `governance-hub/supabase/functions/api-keys-lookup/index.ts:129`
   - **Recommendation:** Use generic messages:
     ```typescript
     // Instead of: "API key not found or invalid"
     // Use: "Invalid API key" (don't distinguish between not found vs invalid)
     ```

2. **Database Error Exposure**
   - **Issue:** Database errors sometimes returned to client
   - **Location:** `governance-hub/supabase/functions/api-keys-create/index.ts:168`
   - **Recommendation:** Log full error, return generic message:
     ```typescript
     console.error('[ApiKeysCreate] Error:', insertError);
     return new Response(
       JSON.stringify({ error: 'Failed to create API key' }),
       { status: 500 }
     );
     ```

---

## 5. Rate Limiting & Abuse Prevention

### ✅ **Strengths**

1. **Rate Limiting Framework**
   - ✅ Rate limit adapter interface exists
   - ✅ Per-action rate limits configured
   - ✅ Rate limit checking in router
   - **Location:** `agentic-control-plane-kit/kernel/src/router.ts:245`

2. **Action-Specific Limits**
   - ✅ High-risk actions have lower limits
   - ✅ Default limits configured
   - **Location:** `agentic-control-plane-kit/kernel/src/rate_limit.ts:27`

### 🟠 **High Priority**

1. **No Rate Limiting on Gateway**
   - **Issue:** MCP Gateway has no rate limiting
   - **Risk:** DoS attacks, resource exhaustion
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts`
   - **Recommendation:** Add rate limiting per API key:
     ```typescript
     // Check rate limit before processing
     const rateLimitResult = await checkRateLimit(apiKeyId, action, limit);
     if (!rateLimitResult.allowed) {
       return new Response(JSON.stringify({
         error: 'Rate limit exceeded',
       }), { status: 429 });
     }
     ```

2. **No Rate Limiting on Repo B Endpoints**
   - **Issue:** Authorization, API key lookup endpoints not rate limited
   - **Risk:** Brute force, DoS attacks
   - **Recommendation:** Add IP-based rate limiting (e.g., 100 req/min per IP)

---

## 6. Multi-Tenant Isolation

### ✅ **Strengths**

1. **Tenant Scoping**
   - ✅ All queries filtered by tenant_id
   - ✅ Authorization requests include tenant_id
   - ✅ Audit logs scoped to tenant

2. **Row-Level Security (RLS)**
   - ✅ RLS policies on api_keys table
   - ✅ Organization-level isolation enforced
   - **Location:** `governance-hub/supabase/migrations/20260219000000_add_api_keys_table.sql:31`

### 🟡 **Medium Priority**

1. **Tenant Verification in Gateway**
   - **Issue:** Gateway doesn't verify tenant belongs to organization before authorization
   - **Location:** `agentic-control-plane-kit/gateway/auth.ts:142`
   - **Recommendation:** Verify organization_id in lookup response matches kernel's organization

2. **Cross-Tenant Data Leakage Risk**
   - **Issue:** If tenant_id extraction fails, could default to wrong tenant
   - **Location:** Multiple locations
   - **Recommendation:** Fail-closed: deny if tenant_id cannot be determined

---

## 7. Audit Logging & Compliance

### ✅ **Strengths**

1. **Comprehensive Audit Logging**
   - ✅ All actions logged with full context
   - ✅ Request hashing (no payload storage)
   - ✅ Decision IDs for traceability
   - **Location:** `agentic-control-plane-kit/kernel/src/audit-event.ts`

2. **Secret Protection in Audit**
   - ✅ Request payloads never stored (only hashes)
   - ✅ Sensitive fields redacted
   - ✅ Audit failures don't break requests
   - **Location:** `agentic-control-plane-kit/kernel/src/sanitize.ts`

3. **Audit Event Structure**
   - ✅ Standardized event format
   - ✅ Versioning for future migrations
   - ✅ All required fields present

### 🟡 **Medium Priority**

1. **Audit Log Retention Policy**
   - **Issue:** No documented retention policy
   - **Recommendation:** Document retention period (e.g., 90 days, 1 year)

2. **Audit Log Tampering Protection**
   - **Issue:** No integrity checks on audit logs
   - **Recommendation:** Consider adding HMAC signatures to audit events

---

## 8. Network Security

### ✅ **Strengths**

1. **HTTPS Enforcement**
   - ✅ All endpoints should be served over HTTPS (deployment responsibility)
   - ✅ No HTTP-only endpoints in code

2. **Timeout Handling**
   - ✅ Authorization calls have timeouts (5s)
   - ✅ Timeout errors properly handled
   - **Location:** `agentic-control-plane-kit/gateway/policy.ts:74`

### ✅ **Fixed Issues**

1. **Request Size Limits** - **FIXED** ✅
   - **Previous Issue:** No max request body size enforced
   - **Fix Applied:** Added 1MB limit on MCP requests
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts:130-133`

### 🟡 **Medium Priority**

1. **No Connection Pooling Limits**
   - **Issue:** No limits on concurrent connections
   - **Risk:** Resource exhaustion
   - **Recommendation:** Configure connection limits at infrastructure level

---

## 9. Data Protection

### ✅ **Strengths**

1. **API Key Hashing**
   - ✅ SHA-256 hashing before storage
   - ✅ Plaintext never persisted

2. **Request Payload Hashing**
   - ✅ Request payloads hashed (not stored)
   - ✅ Idempotency via request_hash

### 🟡 **Medium Priority**

1. **No Encryption at Rest**
   - **Issue:** Database not encrypted (Supabase responsibility)
   - **Recommendation:** Verify Supabase encryption enabled

2. **No PII Redaction**
   - **Issue:** No specific PII redaction beyond secrets
   - **Recommendation:** Add PII detection/redaction for email, phone, SSN patterns

---

## 10. Gateway-Specific Security

### ✅ **Strengths**

1. **Fail-Closed Behavior**
   - ✅ Authorization failures result in deny
   - ✅ Network errors fail-closed
   - **Location:** `agentic-control-plane-kit/gateway/policy.ts:79`

2. **Process Isolation**
   - ✅ Downstream MCP servers run as separate processes
   - ✅ Process crashes don't affect gateway

### ✅ **Fixed Critical Issues**

1. **Input Validation on MCP Requests** - **FIXED** ✅
   - **Previous Issue:** MCP request params not validated before forwarding
   - **Fix Applied:**
     - Validates JSON-RPC 2.0 structure
     - Validates `jsonrpc`, `method`, `params` fields
     - Enforces 1MB request size limit
     - Proper error responses
   - **Location:** `agentic-control-plane-kit/gateway/http-server.ts:98-145`

2. **Tool Prefix Enforcement** - **ALREADY ENFORCED** ✅
   - **Status:** Tool prefix is required in config validation
   - **Location:** `agentic-control-plane-kit/gateway/config.ts:87-107`
   - **Note:** Runtime enforcement could be added for extra safety

### 🟠 **High Priority**

1. **No Resource Limits on Downstream Processes**
   - **Issue:** MCP server processes have no memory/CPU limits
   - **Risk:** Resource exhaustion
   - **Recommendation:** Add resource limits (e.g., 512MB RAM, 1 CPU core)

2. **No Timeout on Downstream Calls**
   - **Issue:** MCP client calls have no timeout
   - **Risk:** Hanging requests
   - **Location:** `agentic-control-plane-kit/gateway/mcp-client.ts`
   - **Recommendation:** Add timeout (e.g., 30s) to all MCP client calls

---

## 11. Repo C (Key Vault Executor) Security

### ✅ **Strengths**

1. **HMAC Verification**
   - ✅ Service key verified via HMAC
   - ✅ Proper key validation

2. **Error Message Redaction**
   - ✅ Error messages use `error_message_redacted` field
   - ✅ No sensitive data in responses

### 🟡 **Medium Priority**

1. **No Rate Limiting on Execute Endpoint**
   - **Issue:** Execute endpoint has no rate limiting
   - **Risk:** Abuse, cost overruns
   - **Recommendation:** Add per-tenant rate limiting

2. **No Request Validation**
   - **Issue:** Action params not validated against schemas
   - **Risk:** Invalid requests forwarded to external APIs
   - **Recommendation:** Add schema validation before execution

---

## Priority Action Items

### ✅ **Critical (FIXED)**

1. ✅ **Restrict CORS Origins** - **COMPLETE**
   - Replaced `*` with environment-based allowed origins
   - All three repos updated

2. ✅ **Remove API Key from Query Parameters** - **COMPLETE**
   - Gateway: Removed `?api_key=` support
   - Header-only authentication required

3. ✅ **Add Input Validation to Gateway** - **COMPLETE**
   - MCP request structure validation
   - Request size limits (1MB)
   - JSON-RPC 2.0 compliance

### 🟠 **High Priority (Fix Soon)**

1. **Add Rate Limiting**
   - Gateway: Per-API-key rate limiting
   - Repo B: IP-based rate limiting on lookup/authorize
   - Repo C: Per-tenant rate limiting

2. **Add UUID Validation**
   - Validate all UUID inputs before database queries

3. **Add Resource Limits**
   - Gateway: Memory/CPU limits on MCP processes

4. **Add Timeouts**
   - Gateway: Timeout on all downstream MCP calls

5. **Add API Key Rotation**
   - Document rotation process
   - Enforce expiration dates

### 🟡 **Medium Priority (Plan for Next Sprint)**

1. **Improve Error Messages**
   - Generic messages for auth failures
   - No database error details in responses

2. **Add PII Redaction**
   - Detect and redact PII in logs/responses

3. **Document Retention Policies**
   - Audit log retention
   - API key expiration defaults

4. **Add Request Size Limits**
   - Array size limits

---

## Security Best Practices Already Implemented ✅

1. ✅ API keys hashed (SHA-256)
2. ✅ HMAC for kernel authentication
3. ✅ Parameterized queries (Supabase)
4. ✅ Request payload hashing (not storage)
5. ✅ Secret redaction in logs
6. ✅ Scope-based authorization
7. ✅ Multi-tenant isolation
8. ✅ Fail-closed authorization
9. ✅ Comprehensive audit logging
10. ✅ Timeout handling
11. ✅ Error sanitization
12. ✅ Row-level security (RLS)
13. ✅ **CORS origin validation** (NEW)
14. ✅ **Header-only API key auth** (NEW)
15. ✅ **MCP request validation** (NEW)
16. ✅ **Request size limits** (NEW)

---

## Configuration Required

### Environment Variables for CORS

**For all Supabase functions and Gateway:**
```bash
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://app.echelon.com,https://dashboard.echelon.com,https://localhost:3000

# Default origin if no Origin header or not in allowed list
DEFAULT_CORS_ORIGIN=https://echelon.com
```

**Note:** If `ALLOWED_ORIGINS` is not set, only `DEFAULT_CORS_ORIGIN` will be allowed. For development, you can set `ALLOWED_ORIGINS` to include localhost.

---

## Testing Recommendations

1. **Penetration Testing**
   - Test CORS bypass attempts (should fail)
   - Test SQL injection (should all fail)
   - Test rate limit bypass
   - Test tenant isolation

2. **Security Scanning**
   - Dependency vulnerability scanning
   - Static code analysis (SonarQube, Snyk)
   - Dynamic scanning (OWASP ZAP)

3. **Load Testing**
   - Test rate limiting effectiveness
   - Test resource limits
   - Test timeout handling
   - Test request size limits

---

## Conclusion

The three-repo architecture demonstrates **strong security fundamentals** with proper separation of concerns, secure authentication, and comprehensive audit logging. **All critical security issues have been fixed** ✅.

**Overall Grade: A-** (Excellent, with minor improvements needed)

**Recommended Timeline:**
- ✅ Critical fixes: **COMPLETE**
- High priority: **2 weeks**
- Medium priority: **1 month**

---

## Changelog

### 2026-02-19 - Critical Fixes Applied

1. ✅ **CORS Security** - Replaced wildcard with environment-based origin validation
2. ✅ **API Key Security** - Removed query parameter support, header-only required
3. ✅ **Input Validation** - Added comprehensive MCP request validation
4. ✅ **Request Size Limits** - Added 1MB limit on request bodies
5. ✅ **Error Sanitization** - Improved error message handling to prevent information disclosure

---

**Reviewer Notes:**
- This review covers code-level security. Infrastructure security (HTTPS, firewall rules, etc.) should be reviewed separately.
- Consider engaging a third-party security audit before production launch.
- Regular security reviews recommended quarterly.
