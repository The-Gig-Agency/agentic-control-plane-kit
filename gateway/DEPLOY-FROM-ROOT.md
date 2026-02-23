# Deploy MCP Gateway from Repo Root

## Problem
The gateway imports from `../kernel/src/`, but Fly.io builds from the `gateway/` directory, so the kernel files aren't available.

## Solution
Deploy from the **repo root** directory, not from `gateway/`.

## Deployment Command

```bash
# Navigate to repo root
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Deploy from root (this sets build context to repo root)
fly deploy --config gateway/fly.toml
```

## Why This Works

- **Build context** = directory where you run `fly deploy`
- **Dockerfile** = `gateway/Dockerfile.fly` (specified in fly.toml)
- From repo root, Dockerfile can copy both `kernel/` and `gateway/` directories

## Verify After Deployment

```bash
# Check logs
fly logs -a mcp-gateway-autumn-sound-3168

# Should see:
# ✅ [GATEWAY] ✅ Loaded config for kernel: mcp-gateway
# ✅ ✅ Kernel "mcp-gateway" registered with Repo B
# ✅ No "Module not found" errors

# Test health endpoint
curl https://mcp-gateway-autumn-sound-3168.fly.dev/health
```

## Alternative: If Deploying from Gateway Directory

If you must deploy from `gateway/`, you'll need to copy kernel files first:

```bash
# From gateway directory
cd gateway

# Copy kernel files (one-time setup)
cp -r ../kernel ./kernel

# Deploy
fly deploy
```

But **deploying from repo root is recommended** as it's cleaner and doesn't require copying files.
