# Fix: Module not found "file:///kernel/src/sanitize.ts"

## Problem
Gateway fails to start with error:
```
error: Module not found "file:///kernel/src/sanitize.ts".
    at file:///app/policy.ts:16:41
```

## Root Cause
The Dockerfile was only copying the `gateway/` directory, but the gateway code imports from `../kernel/src/` which wasn't included in the container.

## Solution Applied

### 1. Updated Dockerfile (`gateway/Dockerfile.fly`)
- Changed build context to repo root
- Copy both `kernel/` and `gateway/` directories
- Set working directory to `/app/gateway`

### 2. Updated fly.toml
- Set `build_context = "."` to build from repo root
- Set `dockerfile = "gateway/Dockerfile.fly"` to use the updated Dockerfile

## Deployment Steps

### Option 1: Deploy from Repo Root (Recommended)
```bash
# From repo root directory
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Deploy with updated Dockerfile
fly deploy --config gateway/fly.toml
```

### Option 2: Deploy from Gateway Directory
```bash
# From gateway directory
cd gateway

# Fly.io will use the build_context from fly.toml
fly deploy
```

## Verify Fix

After deployment, check logs:
```bash
fly logs
```

**Expected output:**
- ✅ `[GATEWAY] ✅ Loaded config for kernel: mcp-gateway`
- ✅ `✅ Kernel "mcp-gateway" registered with Repo B`
- ✅ No "Module not found" errors

## If Still Failing

### Check Build Context
```bash
# Verify fly.toml has correct build context
cat gateway/fly.toml | grep -A 2 "\[build\]"
```

Should show:
```toml
[build]
  dockerfile = "gateway/Dockerfile.fly"
  build_context = "."
```

### Manual Build Test
```bash
# From repo root
docker build -f gateway/Dockerfile.fly -t mcp-gateway-test .
docker run --rm mcp-gateway-test ls -la /app/
# Should show both 'gateway' and 'kernel' directories
```

## Files Changed
- `gateway/Dockerfile.fly` - Updated to copy kernel directory
- `gateway/fly.toml` - Added build context configuration
