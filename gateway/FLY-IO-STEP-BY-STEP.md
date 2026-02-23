# Fly.io Deployment - Step-by-Step Guide (Beginner Friendly)

**Goal:** Deploy MCP Gateway to Fly.io  
**Time:** ~15 minutes  
**Difficulty:** Easy (I'll walk you through each step)

---

## What You Need Before Starting

### 1. Repo B (Governance Hub) Information

You need these from your Governance Hub (Supabase):

**Where to find them:**
- Go to your Supabase project dashboard
- Look for your project URL and API keys

**What you need:**
1. **ACP_BASE_URL** - Your Supabase project URL
   - Example: `https://bomgupxaxyypkbwnlzxb.supabase.co`
   - Found in: Supabase Dashboard → Settings → API → Project URL

2. **ACP_KERNEL_KEY** - Your kernel API key
   - This is the key that lets the gateway talk to Repo B
   - Found in: Supabase Dashboard → Settings → API → Service Role Key (or your kernel key)
   - **Important:** This is different from your Supabase anon key

3. **Kernel ID** - Already set in `fly.toml` as `mcp-gateway-autumn-sound-3168`
   - You can change this later if needed
   - For now, use what Fly.io generated

---

## Step 1: Wait for Deployment to Finish

**Current Status:** Fly.io is deploying your app

**What to do:**
1. **Wait** for the deployment to complete
2. You'll see output like:
   ```
   ✓ Image deployed
   ✓ App is running
   ```

**Don't worry about errors yet** - we'll fix secrets after deployment.

---

## Step 2: Set Secrets (Environment Variables)

**After deployment finishes**, set these secrets:

### Open Terminal and Run:

```bash
# Make sure you're in the gateway directory
cd gateway

# Set your Governance Hub URL (replace with YOUR actual URL)
fly secrets set ACP_BASE_URL=https://YOUR_SUPABASE_PROJECT.supabase.co

# Set your kernel API key (replace with YOUR actual key)
fly secrets set ACP_KERNEL_KEY=your_kernel_api_key_here

# Set CORS origins (for your main website)
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com

# Set default CORS origin
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

**Example (replace with YOUR values):**
```bash
fly secrets set ACP_BASE_URL=https://bomgupxaxyypkbwnlzxb.supabase.co
fly secrets set ACP_KERNEL_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

**Where to find these values:**
- **ACP_BASE_URL:** Supabase Dashboard → Settings → API → Project URL
- **ACP_KERNEL_KEY:** Supabase Dashboard → Settings → API → Service Role Key (or your kernel key from Repo B)

---

## Step 3: Verify Secrets Are Set

```bash
# List all secrets (names only, not values - for security)
fly secrets list
```

You should see:
- `ACP_BASE_URL`
- `ACP_KERNEL_KEY`
- `ALLOWED_ORIGINS`
- `DEFAULT_CORS_ORIGIN`

---

## Step 4: Redeploy After Setting Secrets

```bash
# Redeploy so the app picks up the new secrets
fly deploy
```

**Why:** The app needs to restart to load the new environment variables.

---

## Step 5: Test the Deployment

```bash
# Get your Fly.io app URL
fly status

# This will show something like:
# App: mcp-gateway-autumn-sound-3168
# URL: https://mcp-gateway-autumn-sound-3168.fly.dev

# Test health endpoint
curl https://mcp-gateway-autumn-sound-3168.fly.dev/health

# Should return: {"status":"ok"}
```

---

## Step 6: Add Custom Domain (gateway.buyechelon.com)

### Step 6a: Add Domain in Fly.io

```bash
# Add your custom domain
fly certs add gateway.buyechelon.com
```

**This will output something like:**
```
Add the following DNS records to your DNS provider:

A     gateway.buyechelon.com -> 123.45.67.89
AAAA  gateway.buyechelon.com -> 2001:db8::1
```

**Copy these IP addresses** - you'll need them for Route 53.

### Step 6b: Update Route 53 DNS

**In AWS Route 53 Console:**

1. **Go to:** https://console.aws.amazon.com/route53
2. **Click:** Hosted zones
3. **Click:** `buyechelon.com`
4. **Click:** Create record

**Create A Record:**
- **Record name:** `gateway`
- **Record type:** A
- **Value:** (paste the IPv4 address from Fly.io output)
- **TTL:** 3600
- **Click:** Create records

**Create AAAA Record (IPv6):**
- **Record name:** `gateway`
- **Record type:** AAAA
- **Value:** (paste the IPv6 address from Fly.io output)
- **TTL:** 3600
- **Click:** Create records

### Step 6c: Wait for DNS Propagation

- **Time:** 5-15 minutes (can take up to 48 hours)
- **Test:** `curl https://gateway.buyechelon.com/health`

---

## Step 7: Verify Everything Works

```bash
# Test health endpoint
curl https://gateway.buyechelon.com/health
# Should return: {"status":"ok"}

# Test discovery endpoint
curl https://gateway.buyechelon.com/meta.discover
# Should return: JSON with gateway info
```

---

## Common Questions

### Q: Do I need Kernel ID from Repo B?

**A:** Not necessarily. The gateway will use:
- **Kernel ID:** `mcp-gateway-autumn-sound-3168` (from your app name)
- **Or:** You can set it in `config.json` if you want a different name

**The kernel ID is just a name** - it identifies your gateway in Repo B. The important thing is that `ACP_KERNEL_KEY` matches a key registered in Repo B.

### Q: Where do I find ACP_KERNEL_KEY?

**A:** In your Supabase (Repo B) dashboard:
1. Go to Supabase Dashboard
2. Settings → API
3. Look for "Service Role Key" or check your kernels table
4. Use the API key that's registered for your kernel

**If you don't have one yet:**
- You may need to register the kernel in Repo B first
- Or use the Service Role Key temporarily (for testing)

### Q: What if I don't know my Supabase URL?

**A:** 
1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy the "Project URL" - that's your `ACP_BASE_URL`

### Q: How do I know if deployment succeeded?

**A:** Run:
```bash
fly status
```

You should see:
- **Status:** running
- **Machines:** 1/1 running
- **Health checks:** passing

### Q: How do I see logs if something fails?

**A:**
```bash
# View recent logs
fly logs

# View logs in real-time
fly logs --follow
```

---

## Troubleshooting

### Issue: "Secrets not found" error in logs

**Fix:**
```bash
# Set all secrets again
fly secrets set ACP_BASE_URL=https://your-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_key
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com

# Redeploy
fly deploy
```

### Issue: Health check failing

**Fix:**
```bash
# Check logs
fly logs

# Check status
fly status

# Restart app
fly apps restart mcp-gateway-autumn-sound-3168
```

### Issue: Domain not working

**Fix:**
1. Check DNS records in Route 53
2. Wait for DNS propagation (5-15 minutes)
3. Test with: `dig gateway.buyechelon.com`
4. Verify Fly.io cert status: `fly certs list`

---

## Quick Command Reference

```bash
# View app status
fly status

# Set a secret
fly secrets set KEY=value

# List secrets
fly secrets list

# View logs
fly logs

# Deploy
fly deploy

# Add domain
fly certs add gateway.buyechelon.com

# Check certificates
fly certs list
```

---

## Next Steps After Deployment

1. ✅ **Set secrets** (Step 2)
2. ✅ **Redeploy** (Step 4)
3. ✅ **Test endpoints** (Step 5)
4. ✅ **Add custom domain** (Step 6)
5. ✅ **Update Route 53** (Step 6b)
6. ✅ **Verify everything works** (Step 7)

---

**Need help?** Share the output of:
- `fly status`
- `fly logs` (last 20 lines)
- `fly secrets list`

And I can help troubleshoot!

---

**Last Updated:** February 2026
