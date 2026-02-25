# Signup Implementation Guide - Where API Keys Are Created

**Question:** Where is the API key created?  
**Answer:** API keys are **created in Repo B**, but the main website needs an **edge function/backend service** that **calls** Repo B to trigger the creation.

---

## API Key Creation Flow

### Where API Keys Are Actually Generated

**Repo B (Governance Hub)** generates the API key via:
- **Endpoint:** `POST /functions/v1/tenants-join`
- **Location:** `governance-hub/supabase/functions/tenants-join/index.ts`
- **Behavior:** Joins an existing tenant and issues a **per-tenant** API key for the agent.

**The API key is generated and stored in Repo B, not on your main website.**

---

## Signup API Request Format

**Endpoint:** `POST /api/consumer/signup`  
**Location:** Main website (www.buyechelon.com), not the gateway

**Request Body:**
```json
{
  "name": "Test Org",           // REQUIRED - Organization/company name
  "email": "test@example.com",  // REQUIRED - User email (used for agent identity)
  "company": "Optional Co",     // OPTIONAL - Additional company info
  "agent_id": "my-agent-001",   // OPTIONAL - Agent identifier
  "tenant_slug": "onsite-affiliate" // OPTIONAL - Join a specific tenant
}
```

**Important:** The API expects `name` (not `organization_name`). The edge function validates that both `name` and `email` are present.

### Idempotency Behavior

**Tenant join is idempotent** per `email + tenant_slug`:
- ✅ If the agent already joined the tenant, returns the existing key (or idempotent response)
- ✅ Safe to call multiple times (e.g., retry on network error)
- ✅ Prevents duplicate keys unless `force_new_key=true`

**Example:**
```typescript
// First call - joins tenant + issues key
POST /functions/v1/tenants-join
{ email: "user@example.com", tenant_slug: "onsite-affiliate" }
→ Returns: { tenant_id: "abc-123", api_key: "mcp_...", ... }

// Second call (same email + tenant) - returns existing
POST /functions/v1/tenants-join
{ email: "user@example.com", tenant_slug: "onsite-affiliate" }
→ Returns: { tenant_id: "abc-123", key_status: "existing", ... }
```

**Response:**
```json
{
  "ok": true,
  "tenant_id": "uuid",
  "tenant_slug": "onsite-affiliate",
  "api_key": "mcp_abc123...",
  "api_key_id": "uuid",
  "gateway_url": "https://gateway.buyechelon.com",
  "message": "Signup successful! Save your API key - it will not be shown again."
}
```

**Example curl:**
```bash
curl -X POST https://www.buyechelon.com/api/consumer/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Org","email":"test@example.com","tenant_slug":"onsite-affiliate"}'
```

---

## What Your Main Website Needs

### Option 1: Edge Function (Recommended for Supabase/Netlify/Vercel)

**If your main website is on Supabase/Netlify/Vercel:**

Create an edge function that calls Repo B:

> **Important:** Repo B now requires **HMAC-signed** requests (not bearer auth).  
> Use `SIGNUP_SERVICE_SECRET` to sign the body and send `X-Client-Id`, `X-Timestamp`, `X-Signature` headers.  
> See `echelon-control/supabase/functions/consumer-signup/index.ts` for a working reference.
>
> If you see `Authorization: Bearer ...` in the examples below, treat it as **legacy** and replace with the HMAC headers above.

**File:** `supabase/functions/consumer-signup/index.ts` (or similar)

```typescript
// Main website edge function (www.buyechelon.com)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const REPO_B_URL = Deno.env.get('REPO_B_URL')!; // e.g., https://governance-hub.supabase.co
const SIGNUP_SERVICE_SECRET = Deno.env.get('SIGNUP_SERVICE_SECRET')!; // HMAC secret for signup service

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { name, email, company, agent_id } = await req.json();

    // Validate required fields
    if (!email || !name) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Name and email are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Join tenant in Repo B (idempotent on email + tenant_slug)
    // Note: If tenant with same email + tenant_slug exists, returns existing tenant
    const tenantResponse = await fetch(
      `${REPO_B_URL}/functions/v1/tenants-join`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SIGNUP_SERVICE_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, // Maps to email in Repo B (used for idempotency)
          organization_name: name, // Repo B expects organization_name
          agent_id: agent_id || `agent-${Date.now()}`,
          // Note: company field is not used by Repo B tenant join
        }),
      }
    );

    if (!tenantResponse.ok) {
      const error = await tenantResponse.json();
      return new Response(
        JSON.stringify({ error: `Failed to create tenant: ${error.error}` }),
        { status: tenantResponse.status }
      );
    }

    const { tenant_uuid } = await tenantResponse.json();

    // Step 2: Generate API key in Repo B
    const apiKeyResponse = await fetch(
      `${REPO_B_URL}/functions/v1/api-keys/create`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SIGNUP_SERVICE_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenant_uuid,
          prefix: 'mcp_',
          scopes: ['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling'],
          name: `${name} - Primary Key`,
        }),
      }
    );

    if (!apiKeyResponse.ok) {
      const error = await apiKeyResponse.json();
      return new Response(
        JSON.stringify({ error: `Failed to create API key: ${error.error}` }),
        { status: apiKeyResponse.status }
      );
    }

    const { api_key, api_key_id } = await apiKeyResponse.json();

    // Step 3: Send welcome email (optional)
    // await sendWelcomeEmail(email, { api_key, gateway_url: 'https://gateway.buyechelon.com' });

    // Step 4: Return credentials
    return new Response(
      JSON.stringify({
        ok: true,
        tenant_id: tenant_uuid,
        api_key, // Only returned once!
        api_key_id,
        gateway_url: 'https://gateway.buyechelon.com',
        message: 'Signup successful! Save your API key - it will not be shown again.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[Signup] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
});
```

**Deploy:**
```bash
# Supabase
supabase functions deploy consumer-signup

# Netlify
netlify functions:create consumer-signup

# Vercel
# Create api/consumer-signup.ts
```

---

### Option 2: Backend API Route (Django/Express/Next.js)

**If your main website is Django/Express/Next.js:**

**Django Example:**
```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import requests
import os

@csrf_exempt
def consumer_signup(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    data = json.loads(request.body)
    email = data.get('email')
    name = data.get('name')
    company = data.get('company')  # Optional
    agent_id = data.get('agent_id')  # Optional
    
    if not email or not name:
        return JsonResponse({'error': 'Name and email are required'}, status=400)
    
    repo_b_url = os.environ.get('REPO_B_URL')
    signup_service_key = os.environ.get('SIGNUP_SERVICE_SECRET')
    
    # Step 1: Join tenant in Repo B (idempotent on email + tenant_slug)
    # Note: If tenant with same email + tenant_slug exists, returns existing tenant
    tenant_response = requests.post(
        f'{repo_b_url}/functions/v1/tenants-join',
        headers={
            'Authorization': f'Bearer {signup_service_key}',
            'Content-Type': 'application/json',
        },
        json={
            'email': email,  # Maps to email in Repo B (used for idempotency)
            'organization_name': name,  # Repo B expects organization_name
            'agent_id': agent_id or f'agent-{int(time.time())}',
            # Note: company field is not used by Repo B tenant join
        },
    )
    
    if not tenant_response.ok:
        return JsonResponse(
            {'error': 'Failed to create tenant'},
            status=tenant_response.status_code
        )
    
    tenant_uuid = tenant_response.json()['tenant_uuid']
    
    # Step 2: Generate API key in Repo B
    api_key_response = requests.post(
        f'{repo_b_url}/functions/v1/api-keys/create',
        headers={
            'Authorization': f'Bearer {signup_service_key}',
            'Content-Type': 'application/json',
        },
        json={
            'tenant_id': tenant_uuid,
            'prefix': 'mcp_',
            'scopes': ['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling'],
        },
    )
    
    if not api_key_response.ok:
        return JsonResponse(
            {'error': 'Failed to create API key'},
            status=api_key_response.status_code
        )
    
    api_key_data = api_key_response.json()
    
    # Step 3: Send welcome email
    # send_welcome_email(email, api_key_data['api_key'])
    
    # Step 4: Return credentials
    return JsonResponse({
        'ok': True,
        'tenant_id': tenant_uuid,
        'api_key': api_key_data['api_key'],
        'api_key_id': api_key_data['api_key_id'],
        'gateway_url': 'https://gateway.buyechelon.com',
    })
```

**Express.js Example:**
```javascript
// api/consumer-signup.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, company, agent_id } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const repoBUrl = process.env.REPO_B_URL;
  const signupServiceKey = process.env.SIGNUP_SERVICE_SECRET;

  try {
    // Step 1: Join tenant (idempotent on email + tenant_slug)
    // Note: If tenant with same email + tenant_slug exists, returns existing tenant
    const tenantRes = await fetch(`${repoBUrl}/functions/v1/tenants-join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${signupServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,  // Maps to email in Repo B (used for idempotency)
        organization_name: name,  // Repo B expects organization_name
        agent_id: agent_id || `agent-${Date.now()}`,
        // Note: company field is not used by Repo B tenant join
      }),
    });

    const { tenant_uuid } = await tenantRes.json();

    // Step 2: Generate API key
    const apiKeyRes = await fetch(`${repoBUrl}/functions/v1/api-keys/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${signupServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenant_uuid,
        prefix: 'mcp_',
        scopes: ['mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.sampling'],
      }),
    });

    const apiKeyData = await apiKeyRes.json();

    // Step 3: Send email (optional)
    // await sendWelcomeEmail(email, apiKeyData.api_key);

    // Step 4: Return credentials
    return res.status(200).json({
      ok: true,
      tenant_id: tenant_uuid,
      api_key: apiKeyData.api_key,
      api_key_id: apiKeyData.api_key_id,
      gateway_url: 'https://gateway.buyechelon.com',
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
```

---

## Complete Architecture

```
┌─────────────────────────────────────────┐
│  Consumer (visits signup page)          │
│  www.buyechelon.com/consumer            │
└──────────────┬──────────────────────────┘
               │
               │ 1. Submits signup form
               ▼
┌─────────────────────────────────────────┐
│  Main Website Edge Function/API          │
│  POST /api/consumer-signup               │
│  (www.buyechelon.com)                    │
│                                          │
│  - Validates input                       │
│  - Calls Repo B to create tenant         │
│  - Calls Repo B to generate API key     │
│  - Sends welcome email                   │
│  - Returns credentials                   │
└──────────────┬──────────────────────────┘
               │
               │ 2. Calls Repo B endpoints
               ▼
┌─────────────────────────────────────────┐
│  Repo B (Governance Hub)                │
│  governance-hub.supabase.co             │
│                                          │
│  POST /tenants-join                   │
│    → Creates tenant record (idempotent) │
│    → Returns tenant_uuid                 │
│    → If exists (same email+name)│
│       returns existing tenant           │
│                                          │
│  POST /api-keys/create                  │
│    → GENERATES API KEY HERE            │
│    → Stores hash in database             │
│    → Returns plaintext key (once!)      │
└─────────────────────────────────────────┘
```

---

## Key Points

### ✅ API Key Generation Happens In:
- **Repo B** (`governance-hub/supabase/functions/api-keys-create/index.ts`)
- Line 170: `const apiKey = generateApiKey(prefix, 32);`
- The key is generated, hashed, and stored in Repo B's database

### ✅ Main Website Needs:
- **Edge function or API route** that calls Repo B
- **Does NOT generate the API key itself**
- **Just orchestrates the signup flow** by calling Repo B

### ✅ Why This Architecture?
- **Single source of truth:** All API keys stored in Repo B
- **Security:** API key generation logic centralized
- **Consistency:** Same generation logic for all consumers
- **Audit:** All key creation logged in Repo B

### ✅ Tenant Join Idempotency
- **Idempotent behavior:** Calling `POST /tenants-join` multiple times with the same `email + tenant_slug` returns the existing key (or idempotent response)
- **Safe retries:** Network errors can be safely retried without creating duplicates

---

## Environment Variables Needed

**On Main Website (Edge Function/API):**
```bash
REPO_B_URL=https://governance-hub.supabase.co
SIGNUP_SERVICE_SECRET=your_hmac_secret  # HMAC secret for signup service
```

**Note:** The `SIGNUP_SERVICE_SECRET` is an HMAC secret that Repo B validates for `X-Client-Id: signup-service`.

---

## Implementation Checklist

### Main Website
- [ ] Create edge function/API route: `/api/consumer-signup`
- [ ] Implement tenant join (calls Repo B)
- [ ] Implement API key generation (calls Repo B)
- [ ] Add error handling
- [ ] Add input validation
- [ ] (Optional) Add email service integration
- [ ] Set environment variables
- [ ] Test signup flow

### Repo B (Already Implemented ✅)
- [x] `POST /tenants-join` endpoint
- [x] `POST /api-keys/create` endpoint
- [x] API key generation logic
- [x] Database schema

---

## Summary

**Question:** Where is the API key created?  
**Answer:** 
- **Generated in:** Repo B (`api-keys/create` endpoint)
- **Triggered by:** Main website edge function/API route
- **Main website role:** Orchestrates signup by calling Repo B endpoints

The main website **does not generate API keys** - it **calls Repo B** to generate them.

---

**Last Updated:** February 2026
