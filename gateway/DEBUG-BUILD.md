# Debug Build Issue

## Problem
The error shows `file:///app/policy.ts` but it should be `/app/gateway/policy.ts`. This suggests files are in the wrong location.

## Solution: Force Fresh Rebuild

The build might be using a cached image. Deploy with `--no-cache`:

```bash
fly deploy --no-cache
```

## Check Build Logs

After deployment, check if verification output appears:

```bash
fly logs -a mcp-gateway-autumn-sound-3168 | grep -i "verifying"
```

You should see:
- `=== Verifying file structure ===`
- `✅ /app/gateway/policy.ts found`
- `✅ /app/kernel/src/sanitize.ts found`

## If Verification Fails

If you see `❌ NOT found`, the build context is wrong. Check:

1. **Are you deploying from repo root?**
   ```bash
   pwd
   # Should be: /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit
   ```

2. **Does fly.toml exist in repo root?**
   ```bash
   ls -la fly.toml
   ```

3. **Does Dockerfile reference correct paths?**
   ```bash
   cat gateway/Dockerfile.fly | grep COPY
   ```

## Expected Structure After Build

```
/app
  /kernel
    /src
      sanitize.ts ✅
      control-plane-adapter.ts ✅
      ...
  /gateway
    policy.ts ✅
    http-server.ts ✅
    ...
```

From `/app/gateway/policy.ts`, the import `../kernel/src/sanitize.ts` should resolve to `/app/kernel/src/sanitize.ts`.
