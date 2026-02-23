# Domain Setup Guide - Gateway Subdomain

**Domain:** `buyechelon.com`  
**Gateway Subdomain:** `gateway.buyechelon.com`  
**Status:** Required for Production

---

## Subdomain Configuration

### Yes, You Need a Subdomain

**Required:** `gateway.buyechelon.com`

The gateway service needs its own subdomain to:
- ✅ Separate gateway traffic from main website
- ✅ Enable SSL/TLS certificates
- ✅ Allow independent scaling
- ✅ Support load balancing
- ✅ Enable CDN configuration

---

## DNS Configuration

### Step 1: Add DNS Record

**Add a CNAME or A record:**

**Option A: CNAME (Recommended for managed hosting)**
```
Type: CNAME
Name: gateway
Value: your-hosting-provider.com
TTL: 3600
```

**Option B: A Record (If you have a static IP)**
```
Type: A
Name: gateway
Value: 192.0.2.1 (your gateway server IP)
TTL: 3600
```

**Option C: A Record (For Deno Deploy)**
```
Type: A
Name: gateway
Value: [Deno Deploy IP addresses]
TTL: 3600
```

---

## Hosting Provider Setup

### Deno Deploy

1. **Deploy gateway:**
   ```bash
   deno deploy --project=gateway gateway/http-server.ts
   ```

2. **Add custom domain:**
   - Go to Deno Deploy dashboard
   - Project → Settings → Domains
   - Add: `gateway.buyechelon.com`
   - Follow DNS instructions

3. **SSL Certificate:**
   - Automatically provisioned by Deno Deploy
   - HTTPS enabled automatically

### Fly.io

1. **Deploy gateway:**
   ```bash
   fly deploy --app gateway
   ```

2. **Add domain:**
   ```bash
   fly certs add gateway.buyechelon.com
   ```

3. **Update DNS:**
   - Follow Fly.io DNS instructions
   - Add A record pointing to Fly.io IPs

### Railway

1. **Deploy gateway:**
   - Connect GitHub repo
   - Deploy `gateway/http-server.ts`

2. **Add custom domain:**
   - Project → Settings → Domains
   - Add: `gateway.buyechelon.com`
   - Update DNS as instructed

### Vercel / Netlify

1. **Deploy gateway:**
   - Connect repository
   - Configure build settings

2. **Add domain:**
   - Project → Domains
   - Add: `gateway.buyechelon.com`
   - Update DNS records

---

## SSL/TLS Certificate

### Automatic (Recommended)

Most hosting providers automatically provision SSL certificates:
- ✅ Deno Deploy - Automatic
- ✅ Fly.io - Automatic via `fly certs`
- ✅ Railway - Automatic
- ✅ Vercel - Automatic
- ✅ Netlify - Automatic

### Manual (If Needed)

If you need to manually configure SSL:

1. **Get certificate (Let's Encrypt):**
   ```bash
   certbot certonly --dns-cloudflare \
     -d gateway.buyechelon.com
   ```

2. **Configure in gateway:**
   - Update server to use certificate
   - Configure HTTPS redirect

---

## Environment Variables

### Gateway Service

Set these environment variables in your hosting provider:

```bash
# Gateway Configuration
PORT=8000
GATEWAY_URL=https://gateway.buyechelon.com

# Repo B (Governance Hub) Connection
ACP_BASE_URL=https://your-governance-hub.supabase.co
ACP_KERNEL_KEY=your_kernel_api_key

# CORS Configuration
ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

---

## Testing DNS

### Verify DNS Resolution

```bash
# Check DNS resolution
dig gateway.buyechelon.com
nslookup gateway.buyechelon.com

# Test HTTPS
curl -I https://gateway.buyechelon.com/health
```

### Expected Response

```http
HTTP/2 200
Content-Type: application/json

{"status":"ok"}
```

---

## Domain Architecture

### Recommended Structure

```
buyechelon.com (Main Website)
├── www.buyechelon.com (WWW redirect)
├── gateway.buyechelon.com (MCP Gateway Service)
├── api.buyechelon.com (Future: API endpoints)
└── dashboard.buyechelon.com (Future: Admin dashboard)
```

### Current Setup

```
buyechelon.com
├── www.buyechelon.com → Main website
└── gateway.buyechelon.com → MCP Gateway (NEW)
```

---

## CORS Configuration

### Update CORS Origins

Since your domain is `buyechelon.com`, update CORS configuration:

**In Gateway Environment Variables:**
```bash
ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com,https://gateway.buyechelon.com
DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

**In Repo B (Governance Hub) Functions:**
```bash
ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com,https://gateway.buyechelon.com
DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

---

## Verification Checklist

### Before Going Live

- [ ] DNS record added (`gateway.buyechelon.com`)
- [ ] DNS propagation verified (can take up to 48 hours)
- [ ] SSL certificate provisioned
- [ ] HTTPS working (`https://gateway.buyechelon.com/health`)
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Gateway service deployed
- [ ] Health check endpoint responding
- [ ] API key authentication working
- [ ] Test MCP request successful

---

## Troubleshooting

### DNS Not Resolving

**Issue:** `gateway.buyechelon.com` doesn't resolve

**Solutions:**
1. Check DNS record is correct
2. Wait for DNS propagation (up to 48 hours)
3. Clear DNS cache: `sudo dscacheutil -flushcache` (macOS)
4. Use different DNS server: `8.8.8.8` (Google DNS)

### SSL Certificate Issues

**Issue:** HTTPS not working

**Solutions:**
1. Verify DNS is pointing to correct server
2. Check hosting provider SSL status
3. Wait for certificate provisioning (can take minutes)
4. Verify certificate is valid: `openssl s_client -connect gateway.buyechelon.com:443`

### CORS Errors

**Issue:** CORS errors from browser

**Solutions:**
1. Verify `ALLOWED_ORIGINS` includes your domain
2. Check `Origin` header matches allowed origins
3. Verify `Access-Control-Allow-Credentials` header
4. Test with `curl` to isolate browser vs server issue

---

## Next Steps

1. **Add DNS record** for `gateway.buyechelon.com`
2. **Deploy gateway** to hosting provider
3. **Configure custom domain** in hosting dashboard
4. **Update environment variables** with correct URLs
5. **Test DNS resolution** and HTTPS
6. **Update documentation** with actual gateway URL
7. **Test end-to-end** with real API key

---

**Last Updated:** February 2026  
**Status:** Ready for Production Setup
