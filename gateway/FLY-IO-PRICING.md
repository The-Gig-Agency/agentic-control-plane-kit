# Fly.io Pricing Comparison - MCP Gateway

**Comparison:** Fly.io vs AWS ECS + Fargate  
**Service:** MCP Gateway (Deno, subprocess spawning, persistent connections)

---

## Fly.io Pricing (2024)

### Compute (VMs)

**Shared CPU (Recommended for Gateway):**
- **1x Shared CPU, 256MB RAM:** $1.94/month
- **1x Shared CPU, 512MB RAM:** $2.88/month
- **1x Shared CPU, 1GB RAM:** $4.76/month
- **1x Shared CPU, 2GB RAM:** $8.52/month

**Dedicated CPU (If needed):**
- **1x Dedicated CPU, 2GB RAM:** $12.00/month
- **2x Dedicated CPU, 4GB RAM:** $24.00/month

### Network

- **Outbound data:** $0.02/GB (first 160GB free/month)
- **Inbound data:** Free
- **IPv4 address:** $2.00/month (one included free)
- **IPv6 address:** Free

### Storage

- **Volumes (persistent storage):** $0.15/GB/month
- **Not needed for gateway** (stateless, config in env vars)

### Other

- **SSL certificates:** Free (automatic)
- **Custom domains:** Free
- **Logs:** Free (30-day retention)
- **Metrics:** Free

---

## MCP Gateway Resource Requirements

### Minimum (Development/Testing)
- **CPU:** 1x Shared
- **RAM:** 512MB (enough for gateway + 1-2 MCP servers)
- **Cost:** ~$2.88/month

### Recommended (Production)
- **CPU:** 1x Shared
- **RAM:** 1GB (enough for gateway + multiple MCP servers)
- **Cost:** ~$4.76/month

### High Traffic (Scaling)
- **CPU:** 1x Shared (or 2x if needed)
- **RAM:** 2GB (multiple concurrent requests)
- **Cost:** ~$8.52/month

---

## Cost Comparison: Fly.io vs ECS + Fargate

### Scenario 1: Low Traffic (1-10 requests/min)

**Fly.io:**
- Compute: 1GB RAM = $4.76/month
- Network: ~10GB outbound = $0.20/month
- **Total: ~$5/month**

**ECS + Fargate:**
- Fargate: 0.5 vCPU, 1GB = $29/month
- ALB: $16/month
- Data transfer: ~$0.85/month
- Route 53: $0.50/month
- **Total: ~$46/month**

**Savings with Fly.io: ~$41/month (89% cheaper)**

---

### Scenario 2: Medium Traffic (100 requests/min)

**Fly.io:**
- Compute: 1GB RAM = $4.76/month
- Network: ~100GB outbound = $2.00/month
- **Total: ~$7/month**

**ECS + Fargate:**
- Fargate: 0.5 vCPU, 1GB = $29/month
- ALB: $16/month
- Data transfer: ~$8.50/month
- Route 53: $0.50/month
- **Total: ~$54/month**

**Savings with Fly.io: ~$47/month (87% cheaper)**

---

### Scenario 3: High Traffic (1000 requests/min)

**Fly.io:**
- Compute: 2GB RAM = $8.52/month
- Network: ~500GB outbound = $10.00/month
- **Total: ~$19/month**

**ECS + Fargate:**
- Fargate: 1 vCPU, 2GB = $58/month
- ALB: $16/month
- Data transfer: ~$42.50/month
- Route 53: $0.50/month
- **Total: ~$117/month**

**Savings with Fly.io: ~$98/month (84% cheaper)**

---

## Fly.io Advantages for MCP Gateway

### ✅ Cost
- **9x cheaper** than ECS + Fargate
- No ALB cost (built-in load balancing)
- No Route 53 cost (DNS included)
- Free SSL certificates

### ✅ Simplicity
- **Single command deployment:** `fly deploy`
- **Automatic SSL:** Just add domain
- **Built-in metrics:** No CloudWatch setup
- **Simple scaling:** `fly scale count 2`

### ✅ Deno Support
- **First-class Deno runtime**
- **Native Deno.Command support** (subprocess spawning)
- **Full filesystem access**
- **No Docker needed** (optional)

### ✅ Performance
- **Global edge network** (low latency)
- **Fast cold starts** (~100ms)
- **Built-in load balancing**

---

## Fly.io Disadvantages

### ⚠️ AWS Integration
- **Not in AWS ecosystem** (if you need tight AWS integration)
- **Separate billing** (if you want everything in AWS)

### ⚠️ Enterprise Features
- **No VPC peering** (if you need private networking)
- **Less granular IAM** (if you need fine-grained access control)

### ⚠️ Scaling Limits
- **Max 20 VMs per app** (usually enough, but ECS can scale higher)

---

## Recommended Fly.io Configuration

### For MCP Gateway

**`fly.toml`:**
```toml
app = "mcp-gateway"
primary_region = "sfo"  # or your preferred region

[build]

[env]
  PORT = "8000"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = false  # Keep running for persistent connections
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "5s"
    interval = "30s"
    method = "GET"
    timeout = "2s"
    path = "/health"

[[vm]]
  memory_mb = 1024  # 1GB RAM
  cpu_kind = "shared"
  cpus = 1
```

**Cost:** ~$4.76/month + data transfer

---

## Deployment Comparison

### Fly.io Deployment

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (creates fly.toml)
cd gateway
fly launch

# Set secrets
fly secrets set ACP_BASE_URL=https://your-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_key
fly secrets set ALLOWED_ORIGINS=https://www.buyechelon.com
fly secrets set DEFAULT_CORS_ORIGIN=https://www.buyechelon.com

# Deploy
fly deploy

# Add custom domain
fly certs add gateway.buyechelon.com
```

**Time:** ~5 minutes

### ECS + Fargate Deployment

**Steps:** 14 steps (see `ECS-FARGATE-DEPLOYMENT.md`)  
**Time:** ~30-60 minutes  
**Complexity:** High (VPC, ALB, ACM, ECS, Route 53)

---

## Cost Summary

| Traffic Level | Fly.io | ECS + Fargate | Savings |
|--------------|--------|---------------|---------|
| Low (10 req/min) | $5/month | $46/month | $41/month (89%) |
| Medium (100 req/min) | $7/month | $54/month | $47/month (87%) |
| High (1000 req/min) | $19/month | $117/month | $98/month (84%) |

---

## Recommendation

### ✅ Use Fly.io If:
- ✅ Cost is a concern (9x cheaper)
- ✅ You want simple deployment
- ✅ You need Deno runtime
- ✅ You don't need tight AWS integration
- ✅ You want fast setup

### ⚠️ Use ECS + Fargate If:
- ⚠️ You need everything in AWS
- ⚠️ You need VPC peering
- ⚠️ You need fine-grained IAM
- ⚠️ You're already heavily invested in AWS

---

## For Your Use Case

**Recommendation: Fly.io**

**Why:**
1. **89% cost savings** ($5 vs $46/month)
2. **Simpler deployment** (5 min vs 60 min)
3. **Better Deno support** (first-class)
4. **Free SSL** (automatic)
5. **Built-in load balancing** (no ALB needed)

**Your architecture:**
- **Vercel:** Main website (`www.buyechelon.com`)
- **Fly.io:** MCP Gateway (`gateway.buyechelon.com`) ← **Recommended**
- **Supabase:** Governance Hub (Repo B)

All three platforms work together seamlessly.

---

## Next Steps

If you choose Fly.io:

1. **Create `gateway/fly.toml`** (I can create this)
2. **Deploy:** `fly launch && fly deploy`
3. **Add domain:** `fly certs add gateway.buyechelon.com`
4. **Set secrets:** `fly secrets set ...`
5. **Update Route 53:** Point to Fly.io IPs

**Total setup time:** ~10 minutes  
**Monthly cost:** ~$5-7/month

---

**Last Updated:** February 2026  
**Pricing Source:** Fly.io Pricing Page (2024)
