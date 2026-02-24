# Gateway API Key Validation Fix

**Issue:** Gateway returns `401 Invalid API key` even though the same key works with Repo B endpoints.

**Root Cause:** Gateway was reading `data.tenant_id` but Repo B's `/api-keys/lookup` returns `{ ok: true, data: { tenant_id: "..." } }`, so it should read `data.data.tenant_id`.

**Fix Applied:**
- Updated `gateway/auth.ts` line 144 to handle nested response format
- Changed from: `const tenantId = data.tenant_id;`
- Changed to: `const tenantId = data.data?.tenant_id || data.tenant_id;`
- Added error logging for debugging

**Files Changed:**
- `gateway/auth.ts` - Fixed response parsing

**Testing:**
After deploying, test with:
```bash
curl -X POST "https://gateway.buyechelon.com/mcp" \
  -H "X-API-Key: mcp_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Expected:** Should now return tools list instead of 401.
