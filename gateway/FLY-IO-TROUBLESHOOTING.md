# Fly.io Deployment Troubleshooting

**Common Issues and Fixes**

---

## Issue 1: "No Dockerfile found"

**Error:**
```
Error: No Dockerfile found
```

**Fix:**
```bash
# Rename Dockerfile.fly to Dockerfile
cd gateway
mv Dockerfile.fly Dockerfile

# Or specify explicitly
fly deploy --dockerfile Dockerfile.fly
```

---

## Issue 2: "Config file not found"

**Error:**
```
Config file not found: ./config.json
```

**Fix:**
```bash
# Create config.json from example
cd gateway
cp config.json.example config.json

# Edit config.json with your MCP servers
# Or set minimal config for testing:
cat > config.json <<EOF
{
  "servers": {},
  "kernel": {
    "kernelId": "mcp-gateway",
    "version": "1.0.0"
  }
}
EOF
```

**Or** modify `config.ts` to handle missing config (already done in http-server.ts for discovery endpoint).

---

## Issue 3: "Deno command not found"

**Error:**
```
/bin/sh: deno: command not found
```

**Fix:**
- Ensure Dockerfile uses `FROM denoland/deno:1.40.0`
- Check Dockerfile is in `gateway/` directory
- Verify Dockerfile is being used: `fly deploy --dockerfile Dockerfile`

---

## Issue 4: "Port binding failed"

**Error:**
```
Error: failed to bind to port 8000
```

**Fix:**
- Check `fly.toml` has `internal_port = 8000`
- Check `http-server.ts` reads `PORT` from environment
- Verify no other process uses port 8000

---

## Issue 5: "Build failed" or "Image build failed"

**Error:**
```
Error: build failed
```

**Debug Steps:**
```bash
# 1. Test Docker build locally
cd gateway
docker build -f Dockerfile.fly -t mcp-gateway:test .

# 2. Test container runs
docker run -p 8000:8000 \
  -e PORT=8000 \
  -e ACP_BASE_URL=https://test.com \
  -e ACP_KERNEL_KEY=test \
  mcp-gateway:test

# 3. Check build logs
fly logs --build

# 4. Deploy with verbose output
fly deploy --verbose
```

---

## Issue 6: "Secrets not found" or "Environment variable missing"

**Error:**
```
ACP_BASE_URL not set
```

**Fix:**
```bash
# Set all required secrets
fly secrets set ACP_BASE_URL=https://your-governance-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_kernel_api_key
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com

# Verify secrets are set
fly secrets list
```

---

## Issue 7: "App failed to start" or "Health check failed"

**Error:**
```
Health check failed
```

**Debug:**
```bash
# Check app logs
fly logs

# Check health endpoint manually
fly ssh console
# Then inside container:
curl http://localhost:8000/health

# Check app status
fly status

# View machine details
fly machine list
```

---

## Issue 8: "Cannot read config.json" (Filesystem issue)

**Error:**
```
Deno.errors.NotFound: Config file not found
```

**Fix:**
- Ensure `config.json` is in `gateway/` directory
- Check `.dockerignore` doesn't exclude `config.json`
- Or modify code to handle missing config gracefully

---

## Quick Diagnostic Commands

```bash
# 1. Check Fly CLI
fly version

# 2. Check login
fly auth whoami

# 3. Check app exists
fly apps list

# 4. Check app status
fly status

# 5. Check configuration
fly config show

# 6. Check secrets
fly secrets list

# 7. View logs
fly logs

# 8. View build logs
fly logs --build

# 9. SSH into machine
fly ssh console

# 10. Check machines
fly machine list
```

---

## Step-by-Step Debugging

### Step 1: Verify Local Build

```bash
cd gateway

# Build Docker image locally
docker build -f Dockerfile.fly -t mcp-gateway:test .

# Test it runs
docker run -p 8000:8000 \
  -e PORT=8000 \
  -e ACP_BASE_URL=https://test.com \
  -e ACP_KERNEL_KEY=test \
  mcp-gateway:test

# In another terminal, test health
curl http://localhost:8000/health
```

**If this fails:** Fix Dockerfile or code issues first.

### Step 2: Verify Fly.io Setup

```bash
# Check you're logged in
fly auth whoami

# Check app exists
fly apps list

# If app doesn't exist, create it
fly launch --no-deploy
```

### Step 3: Deploy with Verbose Output

```bash
# Deploy with full output
fly deploy --verbose

# Look for specific error messages
```

### Step 4: Check Runtime Logs

```bash
# After deployment, check logs
fly logs

# Look for:
# - Startup errors
# - Missing environment variables
# - Config file errors
# - Port binding errors
```

---

## Common Fixes

### Fix 1: Missing config.json

```bash
# Create minimal config
cd gateway
cat > config.json <<EOF
{
  "servers": {},
  "kernel": {
    "kernelId": "mcp-gateway",
    "version": "1.0.0"
  }
}
EOF

# Commit and redeploy
git add config.json
git commit -m "Add config.json"
fly deploy
```

### Fix 2: Wrong Dockerfile Name

```bash
# Rename Dockerfile.fly to Dockerfile
cd gateway
mv Dockerfile.fly Dockerfile

# Or update fly.toml to specify Dockerfile
# Add to fly.toml:
[build]
  dockerfile = "Dockerfile.fly"
```

### Fix 3: Missing Secrets

```bash
# Set all required secrets
fly secrets set ACP_BASE_URL=https://your-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_key
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com

# Redeploy
fly deploy
```

---

## What Error Did You See?

**Please share:**
1. The exact error message from `fly deploy`
2. Output from `fly logs --build`
3. Output from `fly status`

This will help me provide a specific fix!

---

**Last Updated:** February 2026
