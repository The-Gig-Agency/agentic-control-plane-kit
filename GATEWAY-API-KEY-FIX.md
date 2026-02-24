# Gateway API Key Validation Fix

**Issue:** Gateway returns `401 Invalid API key` even though the same key works with Repo B endpoints.

**Root Causes:**
1. Gateway was reading `data.tenant_id` but Repo B's `/api-keys/lookup` returns `{ ok: true, data: { tenant_id: "..." } }`, so it should read `data.data.tenant_id`.
2. `ACP_BASE_URL` may already include `/functions/v1`; auth.ts was appending it again, producing invalid URLs like `.../functions/v1/functions/v1/api-keys/lookup`.
3. Gateway must use the **same Repo B (Supabase project)** as signup — keys created at signup are stored there.

**Fixes Applied:**
- Handle nested response format: `data.data?.tenant_id || data.tenant_id`
- Normalize `platformUrl` before building lookup URL (strip trailing `/functions/v1`), same pattern as `discovery.ts` and `http-server.ts`
- Added comment: lookup must hit same Supabase project as signup

**Files Changed:**
- `gateway/auth.ts` - Response parsing + URL normalization

**Config Requirement:** `ACP_BASE_URL` must point to the same Supabase project that signup uses (e.g. `https://bomgupxaxyypkbwnlzxb.supabase.co` or with `/functions/v1`). If signup and gateway use different projects, keys will never match.

**Testing:**
After deploying, test with:
```bash
curl -X POST "https://gateway.buyechelon.com/mcp" \
  -H "X-API-Key: mcp_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Expected:** Should now return tools list instead of 401.
