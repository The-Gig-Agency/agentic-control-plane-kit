# Signup Implementation Guide - Where API Keys Are Created

**Question:** Where is the API key created?  
**Answer:** API keys are **created in Repo B**, but the main website needs an **edge function/backend service** that **calls** Repo B to trigger the creation.

---

## API Key Creation Flow

### Where API Keys Are Actually Generated

**Repo B (Governance Hub)** generates the API key via:
- **Endpoint:** `POST /functions/v1/api-keys/create`
- **Location:** `governance-hub/supabase/functions/api-keys-create/index.ts`
- **Line 170:** `const apiKey = generateApiKey(prefix, 32);`

**The API key is generated and stored in Repo B, not on your main website.**

---

## Signup API Request Format

**Endpoint:** `POST /api/consumer/signup`  
**Location:** Main website (www.buyechelon.com), not the gateway

**Request Body:**
```json
{
  "name": "Test Org",           // REQUIRED - Organization/company name
  "email": "test@example.com",  // REQUIRED - User email (maps to billing_email for idempotency)
  "company": "Optional Co",    // OPTIONAL - Additional company info (not used by Repo B)
  "agent_id": "my-agent-001"    // OPTIONAL - Agent identifier
}
```

**Important:** The API expects `name` (not `organization_name`). The edge function validates that both `name` and `email` are present.

### Idempotency Behavior

**Tenant creation is idempotent** based on `billing_email` + `name`:
- ✅ If a tenant with the same `billing_email` and `name` already exists, **returns the existing tenant**
- ✅ Safe to call multiple times (e.g., retry on network error)
- ✅ Prevents duplicate tenants from multiple signup attempts
- ✅ `email` from signup request maps to `billing_email` in Repo B

**Example:**
```typescript
// First call - creates tenant
POST /functions/v1/tenants/create
{ email: "user@example.com", organization_name: "Test Org" }
→ Returns: { tenant_uuid: "abc-123", ... }

// Second call (same email + name) - returns existing
POST /functions/v1/tenants/create
{ email: "user@example.com", organization_name: "Test Org" }
→ Returns: { tenant_uuid: "abc-123", ... }  // Same tenant!
```

**Response:**
```json
{
  "ok": true,
  "tenant_id": "uuid",
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
  -d '{"name":"Test Org","email":"test@example.com"}'
```

---

## What Your Main Website Needs

### Option 1: Edge Function (Recommended for Supabase/Netlify/Vercel)

**If your main website is on Supabase/Netlify/Vercel:**

Create an edge function that calls Repo B:

**File:** `supabase/functions/consumer-signup/index.ts` (or similar)

```typescript
// Main website edge function (www.buyechelon.com)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const REPO_B_URL = Deno.env.get('REPO_B_URL')!; // e.g., https://governance-hub.supabase.co
const SIGNUP_SERVICE_KEY = Deno.env.get('SIGNUP_SERVICE_KEY')!; // Kernel API key for signup service

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

    // Step 1: Create tenant in Repo B (idempotent on billing_email + name)
    // Note: If tenant with same billing_email + name exists, returns existing tenant
    const tenantResponse = await fetch(
      `${REPO_B_URL}/functions/v1/tenants/create`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SIGNUP_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, // Maps to billing_email in Repo B (used for idempotency)
          organization_name: name, // Repo B expects organization_name
          agent_id: agent_id || `agent-${Date.now()}`,
          // Note: company field is not used by Repo B tenant creation
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
          'Authorization': `Bearer ${SIGNUP_SERVICE_KEY}`,
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
    signup_service_key = os.environ.get('SIGNUP_SERVICE_KEY')
    
    # Step 1: Create tenant in Repo B (idempotent on billing_email + name)
    # Note: If tenant with same billing_email + name exists, returns existing tenant
    tenant_response = requests.post(
        f'{repo_b_url}/functions/v1/tenants/create',
        headers={
            'Authorization': f'Bearer {signup_service_key}',
            'Content-Type': 'application/json',
        },
        json={
            'email': email,  # Maps to billing_email in Repo B (used for idempotency)
            'organization_name': name,  # Repo B expects organization_name
            'agent_id': agent_id or f'agent-{int(time.time())}',
            # Note: company field is not used by Repo B tenant creation
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
  const signupServiceKey = process.env.SIGNUP_SERVICE_KEY;

  try {
    // Step 1: Create tenant (idempotent on billing_email + name)
    // Note: If tenant with same billing_email + name exists, returns existing tenant
    const tenantRes = await fetch(`${repoBUrl}/functions/v1/tenants/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${signupServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,  // Maps to billing_email in Repo B (used for idempotency)
        organization_name: name,  // Repo B expects organization_name
        agent_id: agent_id || `agent-${Date.now()}`,
        // Note: company field is not used by Repo B tenant creation
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
│  POST /tenants/create                   │
│    → Creates tenant record (idempotent) │
│    → Returns tenant_uuid                 │
│    → If exists (same billing_email+name)│
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

### ✅ Tenant Creation Idempotency
- **Unique constraint:** Tenants are unique on `(billing_email, name)`
- **Idempotent behavior:** Calling `POST /tenants/create` multiple times with the same `billing_email` and `name` returns the existing tenant
- **Field mapping:** `email` from signup request maps to `billing_email` in Repo B
- **Safe retries:** Network errors can be safely retried without creating duplicates

---

## Environment Variables Needed

**On Main Website (Edge Function/API):**
```bash
REPO_B_URL=https://governance-hub.supabase.co
SIGNUP_SERVICE_KEY=acp_kernel_xxx  # Kernel API key for signup service
```

**Note:** The `SIGNUP_SERVICE_KEY` should be a kernel API key registered in Repo B with permissions to:
- Create tenants
- Create API keys

---

## Implementation Checklist

### Main Website
- [ ] Create edge function/API route: `/api/consumer-signup`
- [ ] Implement tenant creation (calls Repo B)
- [ ] Implement API key generation (calls Repo B)
- [ ] Add error handling
- [ ] Add input validation
- [ ] (Optional) Add email service integration
- [ ] Set environment variables
- [ ] Test signup flow

### Repo B (Already Implemented ✅)
- [x] `POST /tenants/create` endpoint
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
