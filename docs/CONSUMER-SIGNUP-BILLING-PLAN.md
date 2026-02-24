# Consumer Signup & Billing Plan

**Last Updated:** February 24, 2026  
**Endpoint:** `POST /api/consumer/signup`  
**Location:** Main website (www.buyechelon.com)

---

## Signup API Request Format

### Required Fields

```json
{
  "name": "Test Org",           // REQUIRED - Organization/company name
  "email": "test@example.com"   // REQUIRED - User email
}
```

### Optional Fields

```json
{
  "company": "Optional Co",     // OPTIONAL - Additional company info
  "agent_id": "my-agent-001"    // OPTIONAL - Agent identifier
}
```

### Complete Request Example

```bash
curl -X POST https://www.buyechelon.com/api/consumer/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Org",
    "email": "test@example.com",
    "company": "Optional Company Name",
    "agent_id": "my-agent-001"
  }'
```

### Response

```json
{
  "ok": true,
  "tenant_id": "uuid",
  "api_key": "mcp_abc123def456...",
  "api_key_id": "uuid",
  "gateway_url": "https://gateway.buyechelon.com",
  "message": "Signup successful! Save your API key - it will not be shown again."
}
```

---

## Important Notes

### Field Name: `name` (not `organization_name`)

**The signup API expects `name`, not `organization_name`.**

The edge function (`consumer-signup/index.ts`) validates:
```typescript
const { name, email, company, agent_id } = await req.json();

if (!email || !name) {
  return new Response(
    JSON.stringify({ ok: false, error: "Name and email are required" }),
    { status: 400 }
  );
}
```

**Common Mistake:**
```json
// ❌ WRONG - This will fail validation
{
  "organization_name": "Test Org",
  "email": "test@example.com"
}
```

**Correct:**
```json
// ✅ CORRECT
{
  "name": "Test Org",
  "email": "test@example.com"
}
```

The edge function maps `name` to `organization_name` when calling Repo B's tenant creation endpoint, but the public API uses `name`.

---

## Billing Model

### Free Tier (No Charge at Signup)

**At Signup:**
- ✅ Consumer signs up → Gets free tier
- ✅ Stripe customer created (no charge, just customer record)
- ✅ API key generated
- ✅ Consumer can use service (with free tier limits)

**Free Tier Limits:**
- 1,000 requests/month
- Basic tools access
- Standard rate limits

### Upgrade to Paid (Usage-Based Billing)

**When Consumer Upgrades:**
1. Consumer clicks "Upgrade" → Redirected to Stripe Checkout
2. Stripe Checkout Session → Setup payment method (no charge yet)
3. Payment method added → Tier upgraded to "paid"
4. Consumer continues using → Usage tracked for billing

**Billing:** Pay-per-use (usage-based). No upfront payment required.

---

## Signup Flow

1. **Consumer visits:** `https://www.buyechelon.com/consumer`
2. **Submits signup form** with `name` and `email`
3. **Edge function** (`/api/consumer/signup`) processes request:
   - Validates `name` and `email` are present
   - Calls Repo B to create tenant (idempotent - returns existing if same `billing_email` + `name`)
   - Calls Repo B to generate API key
   - Returns API key in response
4. **Consumer receives** API key (save it - won't be shown again)
5. **Consumer can use** gateway immediately with free tier limits

### Idempotent Signup

The signup endpoint is **idempotent** - if a user signs up multiple times with the same email and name:
- ✅ Returns the **existing tenant** and API key (doesn't create duplicate)
- ✅ No duplicate tenants created
- ✅ Safe to retry on network errors
- ✅ Prevents duplicate signups from multiple form submissions

---

## Implementation Details

### Edge Function Location

The signup endpoint is implemented as a Vercel edge function (or similar) that:
- Accepts POST requests
- Validates `name` and `email` are required
- Calls Repo B (`governance-hub`) to create tenant and API key
- Returns credentials in response

### Repo B Integration

The edge function calls:
1. `POST /functions/v1/tenants/create` - Creates tenant (idempotent on `billing_email` + `name`)
   - Maps `email` → `billing_email` (used for idempotency)
   - Maps `name` → `organization_name`
   - If tenant with same `billing_email` + `name` exists, returns existing tenant
2. `POST /functions/v1/api-keys/create` - Generates API key

**Idempotency:** If a user signs up multiple times with the same email and name:
- ✅ Returns the **existing tenant** (doesn't create duplicate)
- ✅ Safe to retry on network errors
- ✅ Prevents duplicate tenants from multiple signup attempts

See `SIGNUP-IMPLEMENTATION-GUIDE.md` for complete implementation examples.

---

## Error Responses

### Missing Required Fields

```json
{
  "ok": false,
  "error": "Name and email are required"
}
```
**Status:** 400 Bad Request

### Invalid Request

```json
{
  "error": "Method not allowed"
}
```
**Status:** 405 Method Not Allowed (only POST is accepted)

### Server Error

```json
{
  "error": "Internal server error",
  "message": "Error details"
}
```
**Status:** 500 Internal Server Error

---

## Next Steps After Signup

1. **Save API key** - It won't be shown again
2. **Configure MCP client** with gateway URL and API key
3. **Start using** the gateway with free tier limits
4. **Upgrade** when ready for higher limits (usage-based billing)

---

**See Also:**
- `SIGNUP-IMPLEMENTATION-GUIDE.md` - Technical implementation guide
- `BILLING-ARCHITECTURE.md` - Complete billing model details
