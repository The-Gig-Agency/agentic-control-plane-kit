# Fix: Dockerfile Path Issue

## Problem
When deploying from repo root with `--config gateway/fly.toml`, Fly.io looks for:
```
gateway/gateway/Dockerfile.fly  ❌ (wrong)
```

Instead of:
```
gateway/Dockerfile.fly  ✅ (correct)
```

## Solution

The dockerfile path in `fly.toml` should be relative to the **config file's directory** (gateway/), not the repo root.

**Updated fly.toml:**
```toml
[build]
  dockerfile = "Dockerfile.fly"  # Relative to gateway/ directory
```

## Deployment

**From repo root:**
```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit
fly deploy --config gateway/fly.toml
```

Fly.io will:
1. Use `gateway/fly.toml` as config
2. Set build context to repo root (where you run the command)
3. Look for Dockerfile at `gateway/Dockerfile.fly` (relative to build context)
4. Dockerfile copies both `kernel/` and `gateway/` directories

## Verify

After deployment:
```bash
fly logs -a mcp-gateway-autumn-sound-3168
```

Should see successful startup without "Module not found" errors.
