# Fly.io Deployment Guide - MCP Gateway

**Platform:** Fly.io  
**Service:** MCP Gateway  
**Domain:** `gateway.buyechelon.com`

---

## Prerequisites

- ✅ Fly.io account (sign up at https://fly.io)
- ✅ Fly CLI installed
- ✅ Gateway code ready

---

## Step 1: Install Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Or via Homebrew
brew install flyctl

# Verify installation
fly version
```

---

## Step 2: Login to Fly.io

```bash
fly auth login
```

This will open a browser for authentication.

---

## Step 3: Initialize Fly App

```bash
cd gateway

# Initialize (creates fly.toml if it doesn't exist)
fly launch --no-deploy

# Or if fly.toml already exists, just verify it
fly config validate
```

**Note:** If `fly.toml` already exists, you can skip this step.

---

## Step 4: Set Secrets (Environment Variables)

```bash
# Set required secrets
fly secrets set ACP_BASE_URL=https://your-governance-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_kernel_api_key_here
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com

# Optional
fly secrets set ENVIRONMENT=production
```

**Important:** Secrets are encrypted and only available at runtime.

---

## Step 5: Deploy

```bash
# Deploy the app
fly deploy

# Or deploy with verbose output for debugging
fly deploy --verbose
```

---

## Step 6: Add Custom Domain

```bash
# Add your custom domain
fly certs add gateway.buyechelon.com

# This will show DNS records to add to Route 53
# Example output:
# Add the following DNS records:
#   A     gateway.buyechelon.com -> 123.45.67.89
#   AAAA  gateway.buyechelon.com -> 2001:db8::1
```

---

## Step 6: Update Route 53 DNS

In AWS Route 53:

1. **Go to Route 53 Console**
   - Hosted zones → `buyechelon.com`

2. **Add A Record:**
   - **Name:** `gateway`
   - **Type:** A
   - **Value:** IP address from `fly certs add` output
   - **TTL:** 3600

3. **Add AAAA Record (IPv6):**
   - **Name:** `gateway`
   - **Type:** AAAA
   - **Value:** IPv6 address from `fly certs add` output
   - **TTL:** 3600

**Or use CNAME (if Fly.io provides it):**
- **Name:** `gateway`
- **Type:** CNAME
- **Value:** `mcp-gateway.fly.dev` (or domain from Fly.io)

---

## Step 7: Verify Deployment

```bash
# Check app status
fly status

# View logs
fly logs

# Check health
fly checks list

# Test endpoints
curl https://gateway.buyechelon.com/health
curl https://gateway.buyechelon.com/meta.discover
```

---

## Common Deployment Issues

### Issue 1: "No Dockerfile found"

**Error:**
```
Error: No Dockerfile found
```

**Fix:**
```bash
# Create Dockerfile (already created as Dockerfile.fly)
# Or specify Dockerfile explicitly
fly deploy --dockerfile Dockerfile.fly
```

### Issue 2: "Deno not found" or "Command not found"

**Error:**
```
/bin/sh: deno: command not found
```

**Fix:**
- Ensure Dockerfile uses `denoland/deno:1.40.0` base image
- Check Dockerfile is in `gateway/` directory

### Issue 3: "Port binding failed"

**Error:**
```
Error: failed to bind to port 8000
```

**Fix:**
- Check `fly.toml` has `internal_port = 8000`
- Check `http-server.ts` uses `PORT` environment variable
- Verify no other process is using port 8000

### Issue 4: "Config file not found"

**Error:**
```
Config file not found: ./config.json
```

**Fix:**
- Create `config.json` from `config.json.example`
- Or modify `config.ts` to handle missing config gracefully
- Or set config via environment variables

### Issue 5: "Secrets not found"

**Error:**
```
ACP_BASE_URL not set
```

**Fix:**
```bash
# Set all required secrets
fly secrets set ACP_BASE_URL=https://your-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_key
```

### Issue 6: "Build failed"

**Error:**
```
Error: build failed
```

**Fix:**
```bash
# Check build logs
fly logs --build

# Try building locally first
docker build -f Dockerfile.fly -t mcp-gateway:test .
docker run -p 8000:8000 mcp-gateway:test
```

---

## Debugging Commands

```bash
# View app status
fly status

# View recent logs
fly logs

# View build logs
fly logs --build

# SSH into running machine
fly ssh console

# Check machine details
fly machine list

# View app configuration
fly config show

# Check secrets (names only, not values)
fly secrets list
```

---

## Scaling

```bash
# Scale to 2 instances
fly scale count 2

# Scale memory
fly scale memory 2048  # 2GB

# Scale CPU (requires dedicated)
fly scale vm shared-cpu-2x  # 2 shared CPUs
```

---

## Updating Deployment

```bash
# After code changes
git add .
git commit -m "Update gateway"
git push

# Fly.io auto-deploys on push (if connected to GitHub)
# Or deploy manually:
fly deploy
```

---

## Monitoring

```bash
# View metrics
fly metrics

# View logs in real-time
fly logs --follow

# Check app health
fly checks list
```

---

## Cost Monitoring

```bash
# View usage
fly dashboard

# Or check in Fly.io web dashboard
# https://fly.io/dashboard
```

---

## Troubleshooting Checklist

If deployment fails:

1. ✅ **Check Fly CLI is installed:** `fly version`
2. ✅ **Check you're logged in:** `fly auth whoami`
3. ✅ **Check `fly.toml` exists:** `ls fly.toml`
4. ✅ **Check Dockerfile exists:** `ls Dockerfile.fly`
5. ✅ **Check secrets are set:** `fly secrets list`
6. ✅ **Check build logs:** `fly logs --build`
7. ✅ **Check app logs:** `fly logs`
8. ✅ **Try verbose deploy:** `fly deploy --verbose`

---

## Quick Reference

```bash
# Deploy
fly deploy

# View logs
fly logs

# Set secrets
fly secrets set KEY=value

# Add domain
fly certs add gateway.buyechelon.com

# Scale
fly scale count 2

# SSH
fly ssh console

# Status
fly status
```

---

**Last Updated:** February 2026  
**Status:** Ready for Fly.io Deployment
