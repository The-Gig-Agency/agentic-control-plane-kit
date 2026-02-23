# Force Fresh Rebuild

## Problem
The gateway is still showing "Module not found" errors even after updating the Dockerfile. This is likely because Fly.io is using a cached build.

## Solution: Force Fresh Rebuild

Deploy with `--no-cache` to force a complete rebuild:

```bash
# From repo root
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Force fresh rebuild (no cache)
fly deploy --no-cache
```

## Verify Build

After deployment, check the build logs to see if the verification steps pass:

```bash
fly logs -a mcp-gateway-autumn-sound-3168
```

Look for:
- `=== Verifying kernel files ===`
- `✅ sanitize.ts found`
- `✅ control-plane-adapter.ts found`

If you see `❌ NOT found`, the build context is wrong.

## Alternative: Check Build Context

If `--no-cache` doesn't work, verify the build context:

```bash
# Check what files are in the build context
fly deploy --build-only --no-cache

# Or check the Dockerfile directly
docker build -f gateway/Dockerfile.fly -t test-build .
docker run --rm test-build ls -la /app/kernel/src/
```

## Expected Structure

After build, the container should have:
```
/app
  /kernel
    /src
      sanitize.ts ✅
      control-plane-adapter.ts ✅
      audit.ts ✅
      ...
  /gateway
    policy.ts ✅
    http-server.ts ✅
    ...
```

From `/app/gateway/policy.ts`, the import `../kernel/src/sanitize.ts` should resolve to `/app/kernel/src/sanitize.ts`.
