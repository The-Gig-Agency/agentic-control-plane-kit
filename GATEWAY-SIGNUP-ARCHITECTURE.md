# Gateway Signup Architecture - What Goes Where

**Domain:** `buyechelon.com`  
**Gateway Subdomain:** `gateway.buyechelon.com`  
**Main Website:** `www.buyechelon.com`

---

## Overview

The **signup page** and **gateway service** are on **different domains**:

- **`www.buyechelon.com/consumer`** → Signup page (web form)
- **`gateway.buyechelon.com`** → MCP Gateway service (API endpoints)

---

## What Goes on `gateway.buyechelon.com` (Gateway Subdomain)

### ✅ Required: MCP Gateway HTTP Server

**File:** `gateway/http-server.ts` (already implemented)

**Endpoints:**
1. **`GET /meta.discover`** - Discovery endpoint
   - Returns gateway capabilities
   - **Points to signup URL:** `https://www.buyechelon.com/consumer`
   - No authentication required (public)

2. **`POST /mcp`** - MCP protocol endpoint
   - Handles all MCP requests (tools, resources, prompts, sampling)
   - **Requires:** `X-API-Key` header
   - Main gateway functionality

3. **`GET /health`** - Health check
   - Returns `{"status": "ok"}`
   - Used for monitoring

### What the Gateway Does NOT Need

❌ **Signup form/page** - This is on the main website  
❌ **Tenant creation logic** - This is handled by signup service  
❌ **API key generation** - This is handled by Repo B  
❌ **User dashboard** - This is on the main website  

### Gateway Configuration

**Environment Variables:**
```bash
# Gateway service
PORT=8000
GATEWAY_URL=https://gateway.buyechelon.com

# Repo B connection
ACP_BASE_URL=https://your-governance-hub.supabase.co
ACP_KERNEL_KEY=your_kernel_api_key

# CORS (allow main website)
ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
```

**Discovery Response:**
```json
{
  "gateway": {
    "name": "Echelon MCP Gateway",
    "url": "https://gateway.buyechelon.com",
    "registration_required": true,
    "registration_url": "https://www.buyechelon.com/consumer"
  }
}
```

---

## What Goes on `www.buyechelon.com` (Main Website)

### ✅ Required: Signup Service

**Location:** `www.buyechelon.com/consumer` (signup page)

**What It Needs:**

1. **Signup Form/Page**
   - Email input
   - Organization name input
   - "Sign Up" button
   - Terms of service checkbox

2. **Signup API Endpoint**
   - **URL:** `POST /api/signup` or `/api/consumer/signup`
   - **Accepts:**
     ```json
     {
       "email": "consumer@example.com",
       "organization_name": "Consumer Corp",
       "agent_id": "consumer-001" // optional
     }
     ```

3. **Backend Signup Logic**
   - Calls Repo B to create tenant
   - Calls Repo B to generate API key
   - Sends welcome email with credentials
   - Returns API key to user (if programmatic)

### Signup Service Flow

```typescript
// Signup service (on www.buyechelon.com)
async function handleSignup(email: string, orgName: string) {
  // 1. Create tenant in Repo B
  const tenantResponse = await fetch(
    'https://governance-hub.supabase.co/functions/v1/tenants/create',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SIGNUP_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        organization_name: orgName,
        integration: 'mcp-gateway',
      }),
    }
  );
  
  const { tenant_uuid } = await tenantResponse.json();
  
  // 2. Generate API key in Repo B
  const apiKeyResponse = await fetch(
    'https://governance-hub.supabase.co/functions/v1/api-keys/create',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SIGNUP_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenant_uuid,
        prefix: 'mcp_',
        scopes: ['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling'],
      }),
    }
  );
  
  const { api_key } = await apiKeyResponse.json();
  
  // 3. Send welcome email
  await sendWelcomeEmail(email, {
    api_key,
    gateway_url: 'https://gateway.buyechelon.com',
  });
  
  // 4. Return credentials (or redirect to success page)
  return { api_key, tenant_uuid };
}
```

### Optional: Consumer Dashboard

**Location:** `www.buyechelon.com/dashboard` or `www.buyechelon.com/consumer/dashboard`

**Features:**
- View API key (masked)
- Regenerate API key
- View usage statistics
- Upgrade tier
- View audit logs
- Manage settings

---

## Complete Signup Flow

### Step 1: Consumer Discovers Gateway

**Consumer visits:**
```
GET https://gateway.buyechelon.com/meta.discover
```

**Gateway responds:**
```json
{
  "gateway": {
    "name": "Echelon MCP Gateway",
    "url": "https://gateway.buyechelon.com",
    "registration_required": true,
    "registration_url": "https://www.buyechelon.com/consumer"
  }
}
```

### Step 2: Consumer Visits Signup Page

**Consumer clicks link or visits:**
```
https://www.buyechelon.com/consumer
```

**Signup page shows:**
- Email input
- Organization name input
- Sign up button
- Link to documentation

### Step 3: Consumer Submits Signup

**Form submission:**
```http
POST https://www.buyechelon.com/api/signup
Content-Type: application/json

{
  "email": "consumer@example.com",
  "organization_name": "Consumer Corp"
}
```

**Backend (on www.buyechelon.com):**
1. Validates input
2. Calls Repo B: `POST /tenants/create`
3. Calls Repo B: `POST /api-keys/create`
4. Sends welcome email
5. Returns/redirects to success page

### Step 4: Consumer Receives Credentials

**Email sent to consumer:**
```
Subject: Welcome to Echelon MCP Gateway

Your API Key: mcp_abc123def456...
Gateway URL: https://gateway.buyechelon.com

Configure your MCP client:
{
  "mcpServers": {
    "echelon": {
      "url": "https://gateway.buyechelon.com",
      "headers": {
        "X-API-Key": "mcp_abc123def456..."
      }
    }
  }
}
```

### Step 5: Consumer Uses Gateway

**Consumer makes MCP request:**
```http
POST https://gateway.buyechelon.com/mcp
X-API-Key: mcp_abc123def456...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│  Consumer (AI Agent)                    │
└──────────────┬──────────────────────────┘
               │
               │ 1. Discovers gateway
               ▼
┌─────────────────────────────────────────┐
│  gateway.buyechelon.com                 │
│  (MCP Gateway Service)                  │
│                                          │
│  GET /meta.discover                     │
│    → Returns signup URL                 │
│                                          │
│  POST /mcp                              │
│    → MCP protocol handler               │
│                                          │
│  GET /health                            │
│    → Health check                       │
└──────────────┬──────────────────────────┘
               │
               │ 2. Redirects to signup
               ▼
┌─────────────────────────────────────────┐
│  www.buyechelon.com/consumer            │
│  (Signup Page)                          │
│                                          │
│  GET /consumer                          │
│    → Signup form                        │
│                                          │
│  POST /api/signup                       │
│    → Creates tenant + API key           │
└──────────────┬──────────────────────────┘
               │
               │ 3. Calls Repo B
               ▼
┌─────────────────────────────────────────┐
│  governance-hub.supabase.co             │
│  (Repo B - Governance Hub)              │
│                                          │
│  POST /tenants/create                   │
│    → Creates tenant record              │
│                                          │
│  POST /api-keys/create                  │
│    → Generates API key                  │
│                                          │
│  POST /api-keys/lookup                  │
│    → Maps API key → tenant              │
└─────────────────────────────────────────┘
```

---

## Implementation Checklist

### Gateway Subdomain (`gateway.buyechelon.com`)

- [x] Deploy `gateway/http-server.ts` HTTP server
- [x] Configure `/meta.discover` endpoint
- [x] Configure `/mcp` endpoint (MCP protocol)
- [x] Configure `/health` endpoint
- [ ] Set up DNS: `gateway.buyechelon.com` → hosting provider
- [ ] Configure SSL certificate
- [ ] Set environment variables
- [ ] Test discovery endpoint
- [ ] Test MCP endpoint with API key

### Main Website (`www.buyechelon.com`)

- [ ] Create signup page: `/consumer`
- [ ] Create signup API: `/api/signup` or `/api/consumer/signup`
- [ ] Implement tenant creation (calls Repo B)
- [ ] Implement API key generation (calls Repo B)
- [ ] Set up email service (SendGrid, AWS SES, etc.)
- [ ] Create welcome email template
- [ ] Add success page after signup
- [ ] (Optional) Create consumer dashboard
- [ ] Test signup flow end-to-end

### Repo B (Governance Hub)

- [x] `POST /tenants/create` endpoint (may already exist)
- [x] `POST /api-keys/create` endpoint
- [x] `POST /api-keys/lookup` endpoint
- [x] `api_keys` table migration
- [ ] Test tenant creation
- [ ] Test API key generation
- [ ] Test API key lookup

---

## Key Points

### ✅ Gateway Subdomain Only Needs:
- MCP Gateway HTTP server
- Discovery endpoint (points to signup URL)
- MCP protocol handler
- Health check

### ✅ Main Website Needs:
- Signup page/form
- Signup API endpoint
- Backend logic to call Repo B
- Email service for welcome emails

### ✅ Repo B Needs:
- Tenant creation endpoint
- API key generation endpoint
- API key lookup endpoint

---

## Summary

**`gateway.buyechelon.com`** = MCP Gateway service only (no signup page)  
**`www.buyechelon.com/consumer`** = Signup page and signup API  
**`governance-hub.supabase.co`** = Backend services (tenant creation, API keys)

The gateway subdomain **does not need a signup page** - it only needs to point consumers to the signup URL on your main website.

---

**Last Updated:** February 2026
