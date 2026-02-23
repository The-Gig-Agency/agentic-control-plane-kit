# Fix: Fly.io App Suspended - Machines Not Running

**Problem:** App is suspended, machines are stopped  
**Solution:** Start the machines and set secrets

---

## Quick Fix (3 Steps)

### Step 1: Start the Machines

**In Fly.io Dashboard:**
1. Go to **Machines** tab
2. Click on the machine
3. Click **Start** button

**Or via CLI:**
```bash
# Start all machines
fly machine start

# Or start specific machine
fly machine list
fly machine start <machine-id>
```

### Step 2: Set Secrets (Required)

**The app needs these secrets to run:**

```bash
# Set your Governance Hub URL
fly secrets set ACP_BASE_URL=https://YOUR_SUPABASE_URL.supabase.co

# Set your kernel API key
fly secrets set ACP_KERNEL_KEY=your_kernel_key_here

# Set CORS origins
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

**Where to find these:**
- **ACP_BASE_URL:** Supabase Dashboard → Settings → API → Project URL
- **ACP_KERNEL_KEY:** Supabase Dashboard → Settings → API → Service Role Key

### Step 3: Restart After Setting Secrets

```bash
# Restart the app
fly apps restart mcp-gateway-autumn-sound-3168

# Or restart specific machine
fly machine restart <machine-id>
```

---

## Alternative: Use Fly.io Dashboard

### Start Machines via Dashboard:

1. **Go to:** https://fly.io/dashboard
2. **Click:** Your app (`mcp-gateway-autumn-sound-3168`)
3. **Click:** **Machines** tab
4. **Click:** The machine (should show "stopped")
5. **Click:** **Start** button

### Set Secrets via Dashboard:

1. **Click:** **Secrets** tab
2. **Click:** **Add Secret** button
3. **Add each secret:**
   - Key: `ACP_BASE_URL`, Value: `https://your-hub.supabase.co`
   - Key: `ACP_KERNEL_KEY`, Value: `your_key`
   - Key: `ALLOWED_ORIGINS`, Value: `https://www.buyechelon.com,https://buyechelon.com`
   - Key: `DEFAULT_CORS_ORIGIN`, Value: `https://www.buyechelon.com`
4. **Click:** **Save**

### Restart After Secrets:

1. **Go to:** **Overview** tab
2. **Click:** **Restart** button

---

## Check if It's Working

```bash
# Check status
fly status

# Should show: "running" not "suspended"

# Check logs
fly logs

# Test health endpoint
curl https://mcp-gateway-autumn-sound-3168.fly.dev/health
# Should return: {"status":"ok"}
```

---

## Why This Happened

**Common reasons:**
1. **No secrets set** - App can't start without required environment variables
2. **Machines stopped** - Fly.io stopped machines to save resources
3. **Health check failed** - App crashed on startup

**Fix:** Set secrets → Start machines → App should run

---

## Step-by-Step (Dashboard Method)

### 1. Start Machine
- Dashboard → Machines → Click machine → Start

### 2. Set Secrets
- Dashboard → Secrets → Add Secret (for each one)

### 3. Restart
- Dashboard → Overview → Restart

### 4. Verify
- Dashboard → Logs → Should see app starting
- Test: `curl https://mcp-gateway-autumn-sound-3168.fly.dev/health`

---

**Need help?** Share what you see in the Logs tab after starting the machine.
