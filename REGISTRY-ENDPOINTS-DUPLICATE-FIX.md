# Fix: Duplicate /functions/v1 in Registry Endpoints

**Issue:** Registry endpoint URLs were duplicating `/functions/v1`:
- Wrong: `https://xxx.supabase.co/functions/v1/functions/v1/mcp-servers-list`
- Correct: `https://xxx.supabase.co/functions/v1/mcp-servers-list`

**Root Cause:** `ACP_BASE_URL` environment variable might already include `/functions/v1`, and the code was appending it again.

**Fix:** Normalize the base URL by removing trailing `/functions/v1` before appending it.

---

## Changes Made

### 1. `gateway/discovery.ts`

**Before:**
```typescript
const platformUrl = Deno.env.get('ACP_BASE_URL') || 'https://governance-hub.supabase.co';
const registryBase = `${platformUrl}/functions/v1`;
```

**After:**
```typescript
let platformUrl = Deno.env.get('ACP_BASE_URL') || 'https://governance-hub.supabase.co';
// Normalize platform URL - remove trailing /functions/v1 if present
platformUrl = platformUrl.replace(/\/functions\/v1\/?$/, '');
const registryBase = `${platformUrl}/functions/v1`;
```

### 2. `gateway/http-server.ts`

**Before:**
```typescript
const platformUrl = Deno.env.get('ACP_BASE_URL') || 'https://governance-hub.supabase.co';
const registryBase = `${platformUrl}/functions/v1`;
```

**After:**
```typescript
let platformUrl = Deno.env.get('ACP_BASE_URL') || 'https://governance-hub.supabase.co';
// Normalize platform URL - remove trailing /functions/v1 if present
platformUrl = platformUrl.replace(/\/functions\/v1\/?$/, '');
const registryBase = `${platformUrl}/functions/v1`;
```

---

## How It Works

The regex `/\/functions\/v1\/?$/` matches:
- `/functions/v1` at the end of the string
- `/functions/v1/` at the end of the string (with trailing slash)

This ensures that regardless of whether `ACP_BASE_URL` is:
- `https://xxx.supabase.co` → becomes `https://xxx.supabase.co/functions/v1/mcp-servers-list` ✅
- `https://xxx.supabase.co/functions/v1` → becomes `https://xxx.supabase.co/functions/v1/mcp-servers-list` ✅
- `https://xxx.supabase.co/functions/v1/` → becomes `https://xxx.supabase.co/functions/v1/mcp-servers-list` ✅

---

## Testing

After deploying, test discovery endpoint:

```bash
curl -X GET "https://gateway.buyechelon.com/meta.discover" | jq '.result.gateway.registry_endpoints'
```

**Expected:**
```json
{
  "list_servers": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/mcp-servers-list",
  "register_server": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/mcp-servers-register",
  "update_server": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/mcp-servers-update",
  "delete_server": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/mcp-servers-delete",
  "list_connectors": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/connectors-list"
}
```

**Should NOT have:** `/functions/v1/functions/v1/` anywhere

---

## Files Changed

- ✅ `gateway/discovery.ts` - Normalize platform URL before building registry endpoints
- ✅ `gateway/http-server.ts` - Normalize platform URL in fallback discovery handler

---

## CLI Commands to Push

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

git add gateway/discovery.ts gateway/http-server.ts REGISTRY-ENDPOINTS-DUPLICATE-FIX.md

git commit -m "Fix duplicate /functions/v1 in registry endpoint URLs

- Normalize ACP_BASE_URL by removing trailing /functions/v1 before appending
- Fixes URLs like .../functions/v1/functions/v1/... to .../functions/v1/...
- Applied to both discovery.ts and http-server.ts fallback handler"

git push origin main
```
