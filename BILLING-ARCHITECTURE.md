# Billing Architecture - When Do We Charge?

**Question:** Do we bill Stripe after signup or after they use the service?  
**Answer:** **After they use the service** (usage-based billing). No charge at signup.

---

## Billing Model: Pay-Per-Use (Usage-Based)

### Free Tier → Usage-Based Billing

**No upfront payment required.** Consumers are charged based on **actual usage** after they upgrade.

---

## Complete Billing Flow

### Phase 1: Signup (No Charge)

**At Signup:**
1. ✅ Consumer signs up → Gets free tier
2. ✅ Stripe customer created (no charge, just customer record)
3. ✅ API key generated
4. ✅ Consumer can use service (with free tier limits)

**What Happens:**
- Tenant created with `tier: "free"`
- Stripe customer created (for future billing)
- `stripe_customer_id` stored in Repo B
- **No payment method required**
- **No charge**

**Free Tier Limits:**
- 1,000 requests/month
- Basic tools access
- Standard rate limits

---

### Phase 2: Upgrade (Setup Payment Method)

**When Consumer Upgrades:**

1. **Consumer clicks "Upgrade"** → Redirected to Stripe Checkout
2. **Stripe Checkout Session** → Setup payment method (no charge yet)
3. **Payment method added** → Tier upgraded to "paid"
4. **Consumer continues using** → Usage tracked for billing

**What Happens:**
- Stripe Checkout in "setup" mode (not "payment" mode)
- Consumer adds credit card
- Payment method stored in Stripe
- Tier upgraded to "paid" or "pro"
- **Still no charge** - just payment method on file

**Code:**
```typescript
// Create Stripe Checkout Session (setup mode, not payment mode)
stripe.checkout.sessions.create({
  customer: stripe_customer_id, // Already exists from signup
  mode: 'setup', // Setup payment method, no charge
  success_url: 'https://www.buyechelon.com/upgrade/success',
  cancel_url: 'https://www.buyechelon.com/upgrade/cancel',
});
```

---

### Phase 3: Usage Tracking (No Charge Yet)

**While Consumer Uses Service:**

- Every MCP request is logged in `audit_logs`
- Usage tracked per tenant
- `billable` flag marks billable actions
- **No charges yet** - just tracking

**What Gets Tracked:**
- Number of requests
- Types of actions (tools, resources, prompts, sampling)
- Timestamps
- Tenant ID

---

### Phase 4: Monthly Billing (Charge Based on Usage)

**At End of Billing Period (Monthly):**

1. **Billing job runs** (scheduled monthly)
2. **Calculate usage** from `audit_logs` table
3. **Create Stripe invoice** with usage-based charges
4. **Charge customer** based on actual usage
5. **Send invoice** to customer

**Billing Calculation:**
```typescript
// Monthly billing job
async function processMonthlyBilling() {
  // 1. Get all tenants with active payment methods
  const tenants = await getTenantsWithPaymentMethods();
  
  for (const tenant of tenants) {
    // 2. Calculate usage for billing period
    const usage = await calculateUsage(tenant.id, {
      period_start: lastMonthStart,
      period_end: lastMonthEnd,
    });
    
    // 3. Calculate charges (e.g., $0.01 per request)
    const amount = usage.requests * 0.01;
    
    // 4. Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: tenant.stripe_customer_id,
      auto_advance: true, // Auto-charge payment method
    });
    
    // 5. Add invoice items (usage-based)
    await stripe.invoiceItems.create({
      customer: tenant.stripe_customer_id,
      invoice: invoice.id,
      amount: amount * 100, // Convert to cents
      description: `${usage.requests} MCP requests`,
    });
    
    // 6. Finalize and charge
    await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.pay(invoice.id);
  }
}
```

**Charges:**
- Based on actual usage (e.g., $0.01 per request)
- Minimum charge: $0 (if no usage, no charge)
- Maximum charge: Based on tier limits

---

## Billing Timeline Example

### Month 1: Signup

**Day 1:**
- Consumer signs up → Free tier
- Stripe customer created (no charge)
- Consumer gets API key
- Consumer makes 50 requests (free tier)

**Day 15:**
- Consumer upgrades → Adds payment method
- Tier upgraded to "paid"
- Consumer makes 200 more requests

**End of Month:**
- Billing job runs
- Calculates: 250 total requests
- Charges: 250 × $0.01 = $2.50
- Invoice sent

### Month 2: Usage

**Throughout Month:**
- Consumer makes 1,500 requests
- Usage tracked in `audit_logs`

**End of Month:**
- Billing job runs
- Calculates: 1,500 requests
- Charges: 1,500 × $0.01 = $15.00
- Invoice sent

---

## Architecture: Where Billing Happens

### Repo B (Governance Hub) - Billing Calculation

**Owns:**
- `audit_logs` table (usage data)
- `tenants` table (tier, stripe_customer_id)
- `billing_periods` table (billing records)

**Responsibility:**
- Calculate usage per tenant
- Create billing records
- Call Repo C to create Stripe invoices

### Repo C (Key Vault Executor) - Stripe Execution

**Owns:**
- Stripe API keys (stored securely)
- Stripe API execution

**Responsibility:**
- Create Stripe invoices
- Add invoice items
- Charge payment methods
- Handle Stripe webhooks

### Repo A (Main Website) - Billing Initiation

**Responsibility:**
- Trigger monthly billing job
- Display billing dashboard
- Handle upgrade flow

---

## Database Schema

### Tenants Table

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  email VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'free', -- 'free' | 'paid' | 'pro' | 'enterprise'
  stripe_customer_id VARCHAR(255), -- Created at signup
  payment_method_status VARCHAR(20) DEFAULT 'none', -- 'none' | 'setup_pending' | 'active'
  onboarded_at TIMESTAMP,
  upgraded_at TIMESTAMP,
  billing_email VARCHAR(255)
);
```

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  action VARCHAR(255),
  status VARCHAR(20), -- 'success' | 'error' | 'denied'
  billable BOOLEAN DEFAULT TRUE, -- Mark billable actions
  ts TIMESTAMP,
  -- ... other fields
);
```

### Billing Periods Table

```sql
CREATE TABLE billing_periods (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  calls INTEGER, -- Number of billable requests
  amount DECIMAL(10, 3), -- Amount charged
  stripe_invoice_id TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'invoiced' | 'paid' | 'failed'
  created_at TIMESTAMP
);
```

---

## Pricing Model Options

### Option 1: Pure Pay-Per-Use (Recommended)

**Pricing:**
- Free tier: 1,000 requests/month (no charge)
- Paid tier: $0.01 per request (after free tier)

**Billing:**
- Charge only for usage above free tier
- Minimum charge: $0
- Maximum charge: Based on tier limits

**Example:**
- Consumer uses 5,000 requests
- Free tier: 1,000 requests (no charge)
- Billable: 4,000 requests
- Charge: 4,000 × $0.01 = $40.00

---

### Option 2: Tiered Pricing

**Pricing:**
- Free tier: 1,000 requests/month → $0
- Pro tier: 10,000 requests/month → $29/month + $0.005 per request over limit
- Enterprise tier: Unlimited → Custom pricing

**Billing:**
- Pro tier: Base fee + usage over limit
- Enterprise: Custom pricing

---

### Option 3: Hybrid (Recommended for Gateway)

**Pricing:**
- Free tier: 1,000 requests/month → $0
- Pro tier: 10,000 requests/month → $29/month flat
- Enterprise tier: Unlimited → Custom pricing

**Billing:**
- Free tier: No charge
- Pro tier: Flat monthly fee (no per-request charge)
- Enterprise: Custom pricing

---

## Implementation Checklist

### Signup Flow

- [x] Create tenant with `tier: "free"`
- [x] Create Stripe customer (no charge)
- [x] Store `stripe_customer_id` in Repo B
- [x] Generate API key
- [x] Return credentials to consumer

### Upgrade Flow

- [ ] Create Stripe Checkout Session (setup mode)
- [ ] Consumer adds payment method
- [ ] Stripe webhook: `checkout.session.completed`
- [ ] Update tenant: `tier = "paid"`, `payment_method_status = "active"`
- [ ] Send confirmation email

### Usage Tracking

- [x] Log all requests in `audit_logs`
- [x] Mark billable actions with `billable = true`
- [x] Track usage per tenant
- [ ] (Optional) Real-time usage dashboard

### Monthly Billing

- [ ] Scheduled job (cron/scheduler)
- [ ] Calculate usage from `audit_logs`
- [ ] Create billing records in `billing_periods`
- [ ] Call Repo C to create Stripe invoices
- [ ] Charge payment methods
- [ ] Send invoices to customers
- [ ] Handle failed payments

---

## Key Points

### ✅ No Charge at Signup
- Consumer signs up → Free tier
- Stripe customer created (just a record)
- No payment method required
- No charge

### ✅ Charge After Usage
- Consumer uses service → Usage tracked
- Monthly billing → Calculate usage
- Create invoice → Charge based on actual usage
- Send invoice → Customer pays

### ✅ Payment Method Setup
- Consumer upgrades → Adds payment method
- Payment method stored → Ready for billing
- Still no charge → Just payment method on file

### ✅ Usage-Based Billing
- Track every request → Log in `audit_logs`
- Calculate monthly → Sum billable actions
- Charge customer → Based on actual usage
- Send invoice → Monthly statement

---

## Summary

**Question:** Do we bill Stripe after signup or after they use the service?  
**Answer:** **After they use the service** (usage-based monthly billing)

**Flow:**
1. **Signup** → Free tier, Stripe customer created (no charge)
2. **Upgrade** → Payment method added (no charge)
3. **Usage** → Requests tracked in `audit_logs`
4. **Monthly Billing** → Calculate usage, create invoice, charge customer

**No upfront payment required.** Consumers only pay for what they use.

---

**Last Updated:** February 2026
