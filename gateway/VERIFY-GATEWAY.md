# Verify MCP Gateway Status

## Quick Check

### 1. Check Fly.io Status
```bash
cd gateway
fly status
```

**Expected output:**
- Status: `running` (not `suspended`)
- Machines: `1 running`

### 2. Test Health Endpoint
```bash
curl https://mcp-gateway-autumn-sound-3168.fly.dev/health
```

**Expected response:**
```json
{"status":"ok"}
```

### 3. Test Discovery Endpoint
```bash
curl https://mcp-gateway-autumn-sound-3168.fly.dev/meta.discover
```

**Expected response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "result": {
    "gateway": {
      "name": "Echelon MCP Gateway",
      "url": "https://gateway.buyechelon.com",
      "registration_required": true,
      "registration_url": "https://www.buyechelon.com/consumer"
    },
    "servers": [...],
    "capabilities": {...}
  }
}
```

### 4. Check Logs
```bash
fly logs
```

**Look for:**
- `[GATEWAY] ✅ Loaded config for kernel: mcp-gateway`
- `✅ Kernel "mcp-gateway" registered with Repo B`
- `[GATEWAY] ✅ Tenant ID: ...`
- `[GATEWAY] ✅ All servers started`

---

## If Gateway is Suspended

### Fix Steps:

1. **Start the machine:**
   ```bash
   fly machine start
   ```

2. **Set required secrets:**
   ```bash
   fly secrets set ACP_BASE_URL=https://YOUR_SUPABASE_URL.supabase.co
   fly secrets set ACP_KERNEL_KEY=your_kernel_key_here
   fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
   fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
   ```

3. **Restart:**
   ```bash
   fly apps restart mcp-gateway-autumn-sound-3168
   ```

---

## Kernel ID Configuration

**Important:** The kernel ID is `mcp-gateway` (not the Fly.io app name).

- **Kernel ID** (`mcp-gateway`): What gets registered with Repo B
- **Fly.io App Name** (`mcp-gateway-autumn-sound-3168`): Just the deployment identifier

**Where kernel ID is set:**
- `gateway/config.json` → `kernel.kernelId: "mcp-gateway"`

**This is correct and should NOT be changed to match the Fly.io app name.**

---

## Test Full MCP Request

```bash
curl -X POST https://mcp-gateway-autumn-sound-3168.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

**Expected response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

---

## Troubleshooting

### Gateway returns 401
- **Cause:** Missing or invalid API key
- **Fix:** Ensure `X-API-Key` header is set with a valid API key from Repo B

### Gateway returns 500
- **Cause:** Missing secrets or Repo B connection failure
- **Fix:** Check `fly logs` and ensure all secrets are set

### Gateway returns 404
- **Cause:** Wrong endpoint path
- **Fix:** Use `/mcp` for MCP requests, `/health` for health checks

### Kernel registration fails
- **Cause:** Invalid `ACP_KERNEL_KEY` or `ACP_BASE_URL`
- **Fix:** Verify secrets match your Repo B configuration
