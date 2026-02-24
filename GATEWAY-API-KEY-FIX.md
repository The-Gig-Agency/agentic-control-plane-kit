# Gateway API Key Validation Fix

**Issue:** Gateway returns `401 Invalid API key` even though the same key works with Repo B endpoints.

**Root Causes:**
1. Gateway was reading `data.tenant_id` but Repo B's api-keys-lookup returns `{ ok: true, data: { tenant_id: "..." } }`, so it should read `data.data.tenant_id`.
2. `ACP_BASE_URL` may already include `/functions/v1`; auth.ts was appending it again, producing invalid URLs.
3. **Wrong path:** Gateway called `/functions/v1/api-keys/lookup` (slash) but Supabase Edge Function is `api-keys-lookup` (hyphen) — wrong URL → 401.
4. Gateway must use the **same Repo B (Supabase project)** as signup — keys created at signup are stored there.

**Fixes Applied:**
- Handle nested response format: `data.data?.tenant_id || data.tenant_id`
- Normalize `platformUrl` before building lookup URL (strip trailing `/functions/v1`)
- **Fix path:** Use `api-keys-lookup` (Supabase function name) not `api-keys/lookup`

**Files Changed:**
- `gateway/auth.ts` - Response parsing + URL normalization

**Config Requirements:**
- `ACP_BASE_URL` must point to the same Supabase project as signup (e.g. `https://bomgupxaxyypkbwnlzxb.supabase.co`).
- `ACP_KERNEL_KEY` must be a valid `acp_kernel_xxx` key registered in the `kernels` table. The api-keys-lookup endpoint verifies the tenant belongs to the **same organization** as the kernel — signup-created tenants and the gateway kernel must share an organization.

**Testing:**
After deploying, test with:
```bash
curl -X POST "https://gateway.buyechelon.com/mcp" \
  -H "X-API-Key: mcp_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Expected:** Should now return tools list instead of 401.
