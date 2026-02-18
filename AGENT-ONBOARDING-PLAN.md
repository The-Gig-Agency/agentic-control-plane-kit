# Agent Onboarding & Billing Plan

## ⚠️ Implementation Workflow - Read First

**IMPORTANT:** This document is currently in `api-docs-template` (deployed copy), but implementation must follow this order:

### Repositories and Work Order

1. **Agent Starter Kit** (True Repo A)
   - ✅ **Install features here FIRST**
   - This is the source template/kit
   - Location: Separate repository (not this folder)

2. **api-docs-template** (Deployed Copy of Repo A)
   - ✅ **Copy changes from Agent Starter Kit**
   - This is the deployed version for leadscoring
   - Location: Current folder (`/Users/rastakit/tga-workspace/repos/api-docs-template`)

3. **governance-hub** (Repo B)
   - ✅ **Make changes and push**
   - Location: Separate repository
   - Changes: Schema updates, billing endpoints, tenant creation

4. **key-vault** (Repo C)
   - ✅ **Make changes and push**
   - Location: Separate repository
   - Changes: Stripe integration endpoints

### Workflow Steps

```
1. Open Agent Starter Kit (Repo A)
   └─> Implement onboarding, usage limits, router changes
   └─> Test locally

2. Copy to api-docs-template (deployed Repo A)
   └─> Copy changes from Agent Starter Kit
   └─> Deploy to Railway

3. Open governance-hub (Repo B)
   └─> Add billing_periods table
   └─> Add billable flag to audit_logs
   └─> Create billing/run endpoint
   └─> Create tenants/create endpoint
   └─> Push and deploy

4. Open key-vault (Repo C)
   └─> Add Stripe integration endpoints
   └─> Store Stripe keys in vault
   └─> Push and deploy
```

**Note:** This document serves as the plan/reference. Actual code changes should be made in the repositories listed above, not necessarily in this folder.

---

## Overview

This document outlines the strategy for allowing agents (like OpenClaw) to self-discover, onboard, and use the Lead Scoring tool with a free tier (100 calls) followed by usage-based billing.

## Architecture Quality Assessment

**Rating: 9.3 / 10** (Production-grade with fixes below)

This architecture is:
- ✅ Multi-tenant correct
- ✅ Control-plane aligned
- ✅ Secure credential isolation (Repo C owns Stripe keys)
- ✅ Scalable billing model
- ✅ Agent-native onboarding

**With the 4 critical fixes, 3 structural upgrades, and 6 last-mile tweaks below, it becomes production-safe and installable as a kit.**

---

## 6 Last-Mile Tweaks (Production Hardening)

These tweaks prevent billing errors, security gaps, and operational pain:

1. **Remove Duplicated Sections** ✅
   - Document cleaned up (removed duplicate "Critical Fixes" and "Structural Upgrades" sections)

2. **Clarify "agent = tenant" vs "kernel = product"** ✅
   - See "Core Architecture Invariants" section below
   - `kernel_id` = SaaS product runtime (Repo A instance)
   - `tenant_id` = customer/agent (OpenClaw, etc.)
   - `api_key` = actor within a tenant

3. **Add Idempotency Keys for Billing** ✅
   - `billing_periods.idempotency_key` column added
   - `Idempotency-Key` header required on `POST /functions/v1/billing/run`
   - Idempotency keys in Stripe calls prevent double-charging
   - Retries become no-ops

4. **Define "billable" at Action Registry** ✅
   - `ActionDef` includes `billable: boolean` and optional `billing_unit`
   - Router writes `billable` into audit logs from action definition
   - No guessing later - deterministic billing behavior

5. **Upgrade Flow: Payment Method State Tracking** ✅
   - `tenants.payment_method_status` column: `'none' | 'setup_pending' | 'active'`
   - Prevents "paid tier but no usable payment method" edge cases
   - Updated on webhook events

6. **Security: Authentication Flow** ✅
   - Repo A → Repo B: Uses `ACP_KERNEL_KEY` (kernel authentication)
   - Repo B → Repo C: Uses platform key (platform authentication)
   - Repo C: Validates caller + tenant scope

---

## Core Architecture Invariants

**CRITICAL:** These invariants must be maintained across all implementations:

### Identity Model
- **`kernel_id`** identifies the SaaS product runtime (Repo A instance)
  - Example: `"leadscore-kernel"` (one kernel per Repo A deployment)
  - Shared across all tenants in that kernel
  
- **`tenant_id`** identifies the customer/agent (OpenClaw, etc.)
  - Example: `"be1b7614-60ad-4e77-8661-cb4fcba9b314"` (UUID from Repo B)
  - One tenant per agent/customer
  - All tenants belong to one organization in Repo B
  
- **`api_key`** identifies the actor within a tenant
  - Example: Django Token (one or more per tenant)
  - Used for authentication in Repo A

**Why this matters:** Prevents confusion when adding org-level billing or multi-kernel deployments.

### Authentication Flow (Security)
- **Repo A → Repo B:** Uses `ACP_KERNEL_KEY` (kernel authentication)
- **Repo B → Repo C:** Uses platform key (platform authentication)
- **Repo C:** Validates caller + tenant scope (prevents random tenants from invoking Stripe endpoints)

---

## Billing Strategy: V1 vs V2

### V1: Manual Invoicing (Current Plan)
- Repo B calculates usage from `audit_logs`
- Repo B calls Repo C to create Stripe invoice items + invoices
- Stripe invoices are created and charged manually
- **Keep `billing_periods` table for reconciliation**

### V2: Stripe Metered Billing (Future)
- Switch to Stripe subscription + metered usage records
- Repo B sends usage records to Stripe: `stripe.SubscriptionItem.create_usage_record()`
- Stripe handles invoicing automatically
- **Keep `billing_periods` table for reconciliation** (still needed)

**Migration Path:** V1 → V2 can be done without breaking changes. Both use `billing_periods` for audit trail.

---

## Critical Fixes Required (Must Address)

### Fix 1: Stripe Invoice Creation Flow
**Issue:** Direct `Invoice.create()` with `amount` will fail or create empty invoices.

**Solution:** Create invoice items first, then invoice.
- See "Step 5: Repo C Executes Stripe API" section below.

### Fix 2: Free Tier Enforcement Location
**Issue:** Usage checking via separate endpoint can be bypassed.

**Solution:** Enforce limits in Repo A router middleware, before action execution.
- See "Free Tier Enforcement in Router" section below.

### Fix 3: Billable Flag in audit_logs
**Issue:** Not every action should be billed (internal actions, retries, etc.).

**Solution:** Add `billable` boolean column to `audit_logs` table.
- See "Database Schema" section below.

### Fix 4: Onboarding Tenant Creation Order
**Issue:** Django creates tenant first, but Repo B should be source of truth.

**Solution:** Create tenant in Repo B first, then create Django API key.
- See "Phase 1: Instant Onboarding" section below.

---

## Structural Upgrades (Highly Recommended)

### Upgrade 1: Create Stripe Customer at Onboarding
**Benefit:** Easier billing transition, avoids migration logic later.

**Solution:** Create Stripe customer immediately when agent onboards, not at upgrade.
- See "Phase 1: Instant Onboarding" section below.

### Upgrade 2: Add billing_periods Table
**Benefit:** Auditability, retry capability, reconciliation with Stripe.

**Solution:** Store billing periods in dedicated table.
- See "Database Schema" section below.

### Upgrade 3: Move Billing Job to Repo B
**Benefit:** Repo B owns audit_logs → should own billing calculation.

**Solution:** Repo A initiates, Repo B calculates and executes.
- See "Automated Billing Job" section below.

---

## Optional Improvement

### Stripe Metered Billing
Instead of manual invoicing, use Stripe's metered billing with usage records. Stripe handles invoicing automatically, avoiding custom billing logic.
- See "Future Enhancements" section below.

---

## Quick Answers: Stripe & Billing Architecture

### Q1: Are Stripe credentials stored in Key Vault (Repo C)?

**Yes.** Stripe API keys are stored in Repo C (Key Vault Executor), not in Repo A. This is the correct architecture because:
- Repo C is designed for external service credentials (Stripe, Shopify, etc.)
- Keeps sensitive credentials out of Repo A
- Repo A never directly accesses Stripe API keys

### Q2: How does billing work/kick off?

**Billing Flow (Preferred Architecture - Repo B Owns Billing):**
1. **Repo A initiates billing** (monthly cron, calls Repo B endpoint)
2. **Repo B calculates billing**:
   - Queries `audit_logs` for usage (owns the data)
   - Filters: `status='success'`, `billable=TRUE`, `action LIKE 'domain.leadscoring.%'`
   - Calculates: `charge = successful_calls * $0.001`
3. **Repo B calls Repo C** to execute Stripe:
   - `executor.execute(endpoint="/api/tenants/{tenant_uuid}/stripe/invoices.create", ...)`
   - Repo C retrieves Stripe keys from Key Vault
   - Repo C creates invoice items, then invoice (correct Stripe flow)
   - Returns invoice_id to Repo B
4. **Repo B stores billing records** in `billing_periods` table (for audit trail)

**Key Principle:** Repo B (control plane) owns billing calculation and execution. Repo A only initiates the process.

### Q3: Can we roll up by Organization?

**Yes.** If you need org-level billing, Repo B can aggregate usage across all tenants in an organization:
```sql
SELECT organization_id, SUM(calls) FROM audit_logs 
WHERE organization_id = 'xxx' GROUP BY organization_id
```

**See detailed flow diagram below.**

---

## Architecture Assumptions

### Repo A (Django - Multi-tenant)
- **Single Django instance** serving all agents
- **One kernel_id**: `"leadscore-kernel"` (shared by all agents)
- **Multiple tenants**: One per agent
- Each agent gets their own Django Token (API key)

### Repo B (Governance Hub)
- **One organization**: Your leadscoring org
- **Multiple tenants**: One per agent (all under same org)
- **One kernel**: `"leadscore-kernel"` (registered once on Repo A startup)
- Policies can be global (all tenants) or tenant-specific

### Key Insight
- All agents are **tenants** in Repo B (not separate kernels)
- Same Django app serves all agents (multi-tenant)
- Kernel registration happens once, not per agent

**See "Core Architecture Invariants" section above for identity model details.**

---

## Onboarding Flow: Free Tier → Billing

### Phase 1: Instant Onboarding (No Payment Required)

#### Step 1: Agent Requests Access
```http
POST /api/onboard/leadscoring
Content-Type: application/json

{
  "agent_id": "openclaw-001",
  "email": "agent@example.com",
  "organization_name": "OpenClaw"  // Optional
}
```

#### Step 2: Create Tenant in Repo B First (Source of Truth)
**CRITICAL FIX #4:** Repo B must be source of truth for tenancy.

**Repo A → Repo B:**
```http
POST {ACP_BASE_URL}/functions/v1/tenants/create
Authorization: Bearer {ACP_KERNEL_KEY}

{
  "agent_id": "openclaw-001",
  "email": "agent@example.com",
  "organization_name": "OpenClaw"
}
```

**Repo B Response:**
```json
{
  "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "tier": "free",
  "created_at": "2026-02-17T21:00:00Z"
}
```

#### Step 3: Create Stripe Customer (At Onboarding)
**STRUCTURAL UPGRADE #1:** Create Stripe customer immediately, not at upgrade.

**Repo A → Repo C:**
```python
executor.execute(
    endpoint="/api/tenants/{tenant_uuid}/stripe/customers.create",
    params={
        "email": "agent@example.com",
        "metadata": {
            "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
            "agent_id": "openclaw-001"
        }
    },
    tenant_id=tenant_uuid
)
```

**Repo C → Stripe:**
```python
stripe.Customer.create(
    email="agent@example.com",
    metadata={"tenant_uuid": "...", "agent_id": "..."}
)
```

**Store `stripe_customer_id` in Repo B tenant record immediately.**

#### Step 4: Create Django API Key
**Repo A creates Django Token (API key) mapped to `tenant_uuid`.**

#### Step 5: Immediate Response (Free Tier)
```json
{
  "onboarded": true,
  "tier": "free",
  "api_key": "abc123def456...",
  "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "free_calls_remaining": 100,
  "instructions": {
    "setup_steps": [
      "1. Set ACP_TENANT_ID environment variable to the tenant_uuid above",
      "2. Use the api_key as X-API-Key header in requests",
      "3. Call /api/manage with action: domain.leadscoring.questions.upsert_bulk"
    ],
    "example_request": {
      "url": "https://your-domain.railway.app/api/manage",
      "headers": {
        "X-API-Key": "abc123...",
        "Content-Type": "application/json"
      },
      "body": {
        "action": "domain.leadscoring.questions.upsert_bulk",
        "params": {
          "questions": [...]
        }
      }
    },
    "documentation_url": "https://docs.example.com/leadscoring"
  },
  "upgrade_info": {
    "message": "First 100 calls are free. After that, add a payment method to continue.",
    "upgrade_url": "https://your-site.com/upgrade?tenant_uuid=be1b7614-60ad-4e77-8661-cb4fcba9b314"
  },
  "pricing": {
    "per_call": 0.001,
    "currency": "USD",
    "billing_period": "monthly"
  }
}
```

#### Step 3: Agent Starts Using Immediately
- No payment method required
- Can make up to 100 calls
- Usage tracked in Repo B `audit_logs` table

---

### Phase 2: Usage Tracking & Limits

#### How Usage is Tracked

**CRITICAL FIX #3:** Add `billable` flag to audit_logs.

**Repo B Schema Update:**
```sql
ALTER TABLE audit_logs ADD COLUMN billable BOOLEAN DEFAULT TRUE;
```

**Query Repo B audit_logs:**
```sql
SELECT COUNT(*) 
FROM audit_logs 
WHERE tenant_id = 'be1b7614-60ad-4e77-8661-cb4fcba9b314'
  AND status = 'success'
  AND billable = TRUE  -- Only billable actions
  AND action LIKE 'domain.leadscoring.%'
  AND ts >= DATE_TRUNC('month', NOW())
```

**Why `billable` flag?**
- Not every action should be billed (e.g., internal actions, retries, control plane calls)
- Prevents billing errors and incorrect charges

**TWEAK #4: Define "billable" at the action registry, not ad-hoc**

Instead of using `billable=TRUE` and action prefix matching, make it deterministic:

**In ActionDef (Repo A):**
```python
ActionDef(
    name="domain.leadscoring.questions.upsert_bulk",
    scope="manage.domain",
    billable=True,  # Add to ActionDef
    billing_unit="call",  # Optional: "call" | "token" | "row" | "sec"
    ...
)
```

**Router writes `billable` into audit logs from action definition:**
```python
_log_audit({
    "tenant_id": tenant_uuid,
    "action": action,
    "billable": action_def.billable,  # From action definition
    "billing_unit": action_def.billing_unit,  # Optional
    ...
})
```

**Benefits:**
- No guessing later - billable status is deterministic
- Can support different billing units (calls, tokens, rows, seconds)
- Action registry is source of truth for billing behavior

#### Free Tier Enforcement in Router (CRITICAL FIX #2)

**CRITICAL FIX #2:** Free tier enforcement must live in Repo A kernel/router, not separate endpoint.

**Add middleware in Repo A router (`backend/control_plane/acp/router.py`):**

```python
def enforce_usage_limit(tenant_uuid: str, action: str, control_plane) -> None:
    """
    Check usage before executing action.
    Raises UpgradeRequiredError if free tier limit reached.
    """
    if not tenant_uuid:
        return  # Skip if no tenant (will fail auth anyway)
    
    # Query Repo B for usage
    usage = control_plane.get_usage(
        tenant_id=tenant_uuid,
        period_start=DATE_TRUNC('month', NOW()),
        period_end=NOW()
    )
    
    if usage.tier == "free" and usage.calls_used >= 100:
        raise UpgradeRequiredError(
            message="Free tier limit reached (100 calls). Add a payment method to continue.",
            usage=usage,
            upgrade_url=f"https://checkout.stripe.com/...?tenant={tenant_uuid}"
        )
```

**In router function, before executing action:**
```python
# After authorization, before handler execution
if not dry_run:
    try:
        enforce_usage_limit(tenant_uuid, action, control_plane)
    except UpgradeRequiredError as e:
        _log_audit({
            "tenant_id": tenant_uuid,
            "action": action,
            "result": "denied",
            "error_message": str(e),
        })
        return {
            "ok": False,
            "code": "UPGRADE_REQUIRED",
            "error": e.message,
            "upgrade_url": e.upgrade_url,
            "usage": e.usage,
        }
```

**This prevents bypass** - limits are enforced at the router level, not via separate endpoint.

#### Approaching Limit (90+ calls)
Include warning in response:
```json
{
  "ok": true,
  "data": {...},
  "warning": {
    "message": "You have 10 free calls remaining. Add a payment method to continue after 100 calls.",
    "upgrade_url": "https://checkout.stripe.com/..."
  }
}
```

#### Limit Reached (100 calls)
Router blocks request, returns upgrade required:
```json
{
  "ok": false,
  "code": "UPGRADE_REQUIRED",
  "error": "Free tier limit reached (100 calls). Add a payment method to continue.",
  "upgrade_url": "https://checkout.stripe.com/...",
  "usage": {
    "calls_used": 100,
    "calls_limit": 100,
    "tier": "free"
  }
}
```

---

### Phase 3: Upgrade Flow (Stripe Checkout)

#### Step 1: Agent Hits Limit → Gets Upgrade URL
Router returns `UPGRADE_REQUIRED` error with `upgrade_url`.

#### Step 2: Create Stripe Checkout Session
```http
POST /api/upgrade/checkout
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314"
}
```

**Repo A → Repo C:**
```python
executor.execute(
    endpoint="/api/tenants/{tenant_uuid}/stripe/checkout.create",
    params={
        "customer_id": tenant.stripe_customer_id,  # Already exists from onboarding
        "mode": "setup",  # Setup payment method, no charge yet
        "success_url": "https://your-site.com/success",
        "cancel_url": "https://your-site.com/cancel",
        "metadata": {"tenant_uuid": tenant_uuid}
    },
    tenant_id=tenant_uuid
)
```

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "expires_at": "2026-02-17T22:00:00Z"
}
```

#### Step 3: Agent Completes Stripe Checkout
- Adds payment method (no charge yet - pay-per-use)
- Stripe redirects to success URL

#### Step 4: Stripe Webhook → Activate Account
```http
POST /api/webhooks/stripe
Content-Type: application/json

{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "customer": "cus_xxx",
      "client_reference_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
      "payment_status": "paid",
      "payment_method_types": ["card"]
    }
  }
}
```

**TWEAK #5: Store Payment Method State**

**Repo A Webhook Handler:**
1. Extract `client_reference_id` (tenant_uuid)
2. Update tenant in Repo B:
   - `tier = 'paid'`
   - `stripe_customer_id` already set (from onboarding)
   - `payment_method_status = 'active'`  # NEW: Track payment method state
   - `upgraded_at = NOW()`
3. Unblock tenant (router will now allow unlimited calls)
4. Send confirmation email to agent

**Add to tenants table:**
```sql
ALTER TABLE tenants ADD COLUMN payment_method_status VARCHAR(20) DEFAULT 'none';
-- Values: 'none' | 'setup_pending' | 'active'
```

**Why this matters:**
- Prevents "paid tier but no usable payment method" edge cases
- Can track setup_pending state if checkout is incomplete
- Enables proper state machine for payment method lifecycle

#### Step 5: Agent Continues Using
- No more limits
- Usage tracked for monthly billing
- Charged based on actual usage

---

## Monthly Billing Process

### Architecture Overview

**Key Principle: Stripe credentials stored in Repo C (Key Vault)**
- Repo C is designed for external service credentials (Stripe, Shopify, etc.)
- Repo A never directly accesses Stripe API keys
- All Stripe operations go through Repo C executor

### Billing Flow Diagram (Preferred Architecture)

**ARCHITECTURAL CORRECTION:** Repo B owns billing calculation and execution.

```
┌─────────────────────────────────────────────────────────────────┐
│ Repo A: Initiate Billing (Scheduled Job)                        │
│ Runs: 1st of each month at 00:00 UTC                            │
│ Calls: POST {ACP_BASE_URL}/functions/v1/billing/run            │
│ Headers: Idempotency-Key: billing-2026-02-01                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Repo B: Check Idempotency (TWEAK #3)                            │
│ 1. Check if billing_periods exists for period + idempotency_key │
│ 2. If exists → return existing billing record (no-op)           │
│ 3. If not → proceed with calculation                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Repo B: Calculate Billing (Owns audit_logs)                    │
│ 1. Query audit_logs for previous month:                         │
│    WHERE status='success'                                       │
│      AND billable=TRUE                                           │
│      AND action LIKE 'domain.leadscoring.%'                     │
│      AND ts >= period_start                                     │
│      AND ts < period_end                                        │
│ 2. Group by tenant_id                                           │
│ 3. Calculate: charge = calls * $0.001                          │
│ 4. Store in billing_periods table with idempotency_key          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Repo B: Execute Stripe Billing (Repo B → Repo C)              │
│ For each tenant:                                                │
│   executor.execute(                                             │
│     endpoint="/api/tenants/{tenant_uuid}/stripe/invoices.create",│
│     params={                                                    │
│       "customer_id": tenant.stripe_customer_id,                 │
│       "amount": charge,                                         │
│       "description": "Lead Scoring API - Monthly Usage",        │
│       "idempotency_key": "billing-{tenant_uuid}-2026-02"       │
│     },                                                          │
│     tenant_id=tenant_uuid                                       │
│   )                                                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Repo C: Execute Stripe API (CRITICAL FIX #1)                   │
│ 1. Retrieve Stripe API keys from Key Vault                      │
│ 2. Create Invoice Item FIRST:                                    │
│    stripe.InvoiceItem.create(                                   │
│      customer=stripe_customer_id,                               │
│      amount=charge_in_cents,                                    │
│      currency="usd",                                            │
│      description="Lead Scoring API usage - Feb 2026"           │
│    )                                                            │
│ 3. Create Invoice SECOND:                                       │
│    invoice = stripe.Invoice.create(                             │
│      customer=stripe_customer_id,                               │
│      auto_advance=True  # Auto-finalize and charge              │
│    )                                                            │
│ 4. Return invoice_id to Repo B                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Repo B: Store Billing Records                                   │
│ Update billing_periods table:                                   │
│ - tenant_id                                                     │
│ - period_start, period_end                                      │
│ - calls                                                         │
│ - amount                                                        │
│ - stripe_invoice_id (keyed by period+tenant for retries)      │
│ - idempotency_key (TWEAK #3)                                    │
│ - status: 'invoiced' or 'paid'                                  │
│ - created_at                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Changes:**
- Repo B owns billing calculation (it has audit_logs)
- Repo B calls Repo C (not Repo A)
- Repo B stores billing records
- Repo A only initiates the process

### Architecture: Stripe Credentials in Key Vault (Repo C)

**Stripe Credentials Storage:**
- ✅ **Stripe API keys stored in Repo C (Key Vault)**
- Repo C is designed for external service credentials (like Stripe, Shopify, etc.)
- Repo A calls Repo C to execute Stripe operations (using stored keys)
- Keeps sensitive credentials out of Repo A

### Billing Flow

**Step 1: Billing Job Initiates (Repo A)**
- Scheduled job (cron/scheduler) runs monthly (e.g., 1st of each month)
- Could be:
  - Django management command in Repo A
  - Separate billing service
  - Railway cron job calling Repo A endpoint
- **TWEAK #3:** Include `Idempotency-Key` header:
  ```http
  POST {ACP_BASE_URL}/functions/v1/billing/run
  Idempotency-Key: billing-2026-02-01
  Authorization: Bearer {ACP_KERNEL_KEY}
  ```

**Step 2: Repo B Checks Idempotency (TWEAK #3)**
- Check if `billing_periods` exists for period + idempotency_key
- If exists → return existing billing record (prevents double-charging)
- If not → proceed with calculation

**Step 3: Query Repo B for Usage (Repo B calculates internally)**
```python
# Repo A queries Repo B audit_logs
GET {ACP_BASE_URL}/functions/v1/audit-query
{
  "tenant_ids": ["uuid1", "uuid2", ...],  // All paid tenants
  "start_date": "2026-01-01T00:00:00Z",
  "end_date": "2026-02-01T00:00:00Z",
  "filter": {
    "status": "success",
    "action": "domain.leadscoring.%"
  }
}
```

**Response from Repo B:**
```json
{
  "usage": [
    {
      "tenant_id": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
      "successful_calls": 1250,
      "failed_calls": 50,
      "total_calls": 1300
    },
    ...
  ]
}
```

**Step 4: Calculate Billing (Repo B)**
```python
# Repo B calculates internally (owns audit_logs)
for tenant in paid_tenants:
    usage = query_audit_logs(tenant_id, period_start, period_end)
    charge = usage.successful_calls * 0.001
    # Store in billing_periods with idempotency_key
```

**Step 5: Execute Stripe Billing (Repo B → Repo C)**
```python
# Repo B calls Repo C to execute Stripe API
# TWEAK #3: Include idempotency_key to prevent double-charging
executor.execute(
    endpoint="/api/tenants/{tenant_uuid}/stripe/invoices.create",
    params={
        "customer_id": tenant.stripe_customer_id,
        "amount": charge,
        "description": "Lead Scoring API - Monthly Usage",
        "idempotency_key": f"billing-{tenant_uuid}-{period}"  # TWEAK #3
    },
    tenant_id=tenant_uuid
)
```

**Step 6: Repo C Executes Stripe API (CRITICAL FIX #1 + TWEAK #3)**

**CRITICAL FIX #1:** Stripe invoices require invoice items first, then invoice creation.

**TWEAK #3:** Use idempotency keys to prevent double-charging on retries.

**Correct flow in Repo C:**
```python
# Check if invoice already exists for this period+tenant (idempotency)
existing_invoice = get_invoice_by_idempotency_key(idempotency_key)
if existing_invoice:
    return existing_invoice  # No-op on retry

# Step 1: Create invoice item (with idempotency)
stripe.InvoiceItem.create(
    customer=stripe_customer_id,
    amount=charge_in_cents,
    currency="usd",
    description="Lead Scoring API usage - Feb 2026",
    idempotency_key=f"{idempotency_key}-item"  # TWEAK #3
)

# Step 2: Create invoice (auto-advance finalizes and charges)
invoice = stripe.Invoice.create(
    customer=stripe_customer_id,
    auto_advance=True,  # Automatically finalize and charge
    idempotency_key=idempotency_key  # TWEAK #3: Prevents duplicate invoices
)

# Store invoice_id keyed by period+tenant for future lookups
store_invoice_mapping(tenant_uuid, period, invoice.id, idempotency_key)
```

**Why this matters:**
- Direct `Invoice.create()` with `amount` will fail or create empty invoices
- Stripe requires invoice items to be added first
- `auto_advance=True` automatically finalizes and charges the invoice

**Alternative (Recommended Long-term):** Use Stripe metered billing with usage records (see Optional Improvement section).

### Alternative: Direct Repo B Query

**If Repo B has audit-query endpoint:**
```sql
-- Repo B query (could be edge function)
SELECT 
  tenant_id,
  COUNT(*) as successful_calls,
  COUNT(*) * 0.001 as total_charge
FROM audit_logs
WHERE status = 'success'
  AND action LIKE 'domain.leadscoring.%'
  AND ts >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  AND ts < DATE_TRUNC('month', NOW())
  AND tenant_id IN (
    SELECT id FROM tenants WHERE tier = 'paid' AND stripe_customer_id IS NOT NULL
  )
GROUP BY tenant_id
```

### Billing by Organization (Roll-up)

**If you need org-level billing:**
```sql
-- Query Repo B for org-level usage
SELECT 
  t.organization_id,
  COUNT(*) as total_calls,
  SUM(CASE WHEN al.status = 'success' THEN 1 ELSE 0 END) as successful_calls
FROM audit_logs al
JOIN tenants t ON al.tenant_id = t.id
WHERE al.ts >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  AND al.ts < DATE_TRUNC('month', NOW())
  AND t.organization_id = 'your-org-uuid'
GROUP BY t.organization_id
```

### Billing Endpoint
```http
GET /api/billing/invoice?tenant_uuid=xxx&period=2026-02
Authorization: Bearer {api_key}
```

**Response:**
```json
{
  "tenant_uuid": "be1b7614-60ad-4e77-8661-cb4fcba9b314",
  "period": "2026-02",
  "usage": {
    "total_calls": 1250,
    "successful_calls": 1200,
    "failed_calls": 50
  },
  "charges": {
    "per_call": 0.001,
    "total_charge": 1.20,
    "currency": "USD"
  },
  "stripe_invoice_id": "in_xxx",
  "status": "paid"
}
```

### Automated Billing Job (STRUCTURAL UPGRADE #3)

**STRUCTURAL UPGRADE #3:** Move billing job responsibility to Repo B (preferred long-term).

**Option A: Repo B Owns Billing (Preferred)**
- Repo A: Scheduled job calls Repo B endpoint
- Repo B: Calculates billing, calls Repo C, stores records
- Repo B: Owns the entire billing process

**Option B: Repo A Orchestrates (Current)**
- Repo A: Scheduled job queries Repo B, calculates, calls Repo C
- Repo B: Stores billing records

**Monthly cron job (runs on 1st of each month):**

**If Repo B owns billing:**
1. **Repo A initiates** (calls Repo B endpoint):
   ```http
   POST {ACP_BASE_URL}/functions/v1/billing/run
   Authorization: Bearer {ACP_KERNEL_KEY}
   Idempotency-Key: billing-2026-02-01  # TWEAK #3: Required header
   ```

2. **Repo B calculates billing:**
   - Query `audit_logs` for previous month
   - Filter: `status='success'`, `billable=TRUE`
   - Calculate: `charge = calls * $0.001` per tenant
   - Store in `billing_periods` table

3. **Repo B calls Repo C** for each tenant:
   - Create invoice items, then invoice
   - Store `stripe_invoice_id` in `billing_periods`

4. **Repo B sends notifications** (optional):
   - Email invoice to agent
   - Update billing status

**Benefits:**
- Repo B owns audit_logs → owns billing calculation
- Repo A remains neutral (easy to copy/install)
- Control plane (Repo B) is authoritative

---

## Implementation Checklist

### Repo A (Django) - New Endpoints

- [ ] `POST /api/onboard/leadscoring`
  - **CRITICAL FIX #4:** Creates tenant in Repo B FIRST (source of truth)
  - **STRUCTURAL UPGRADE #1:** Creates Stripe customer immediately (via Repo C)
  - Creates Django Token (API key) mapped to tenant_uuid
  - Returns credentials immediately

- [ ] `GET /api/usage`
  - Queries Repo B audit_logs
  - Returns: `calls_used`, `calls_remaining`, `tier`

- [ ] `POST /api/upgrade/checkout`
  - Creates Stripe Checkout session
  - Returns checkout URL

- [ ] `POST /api/webhooks/stripe`
  - Handles Stripe webhooks
  - Updates tenant tier in Repo B
  - Sends confirmation

- [ ] `GET /api/billing/invoice`
  - Returns billing details for period

- [ ] Router modifications (**CRITICAL FIX #2**)
  - Add `enforce_usage_limit()` middleware in router
  - Check usage BEFORE executing action (not via separate endpoint)
  - Query Repo B for usage, enforce limit at router level
  - If free tier + limit reached → return `UPGRADE_REQUIRED`
  - If paid tier → always allow (bill monthly)

### Repo B (Governance Hub) - Schema Updates

**CRITICAL FIX #3:** Add `billable` flag to audit_logs.
```sql
ALTER TABLE audit_logs ADD COLUMN billable BOOLEAN DEFAULT TRUE;
```

**Add columns to tenants table:**
```sql
ALTER TABLE tenants 
  ADD COLUMN tier VARCHAR(20) DEFAULT 'free',
  ADD COLUMN stripe_customer_id VARCHAR(255),
  ADD COLUMN payment_method_status VARCHAR(20) DEFAULT 'none',  -- TWEAK #5: 'none' | 'setup_pending' | 'active'
  ADD COLUMN onboarded_at TIMESTAMP,
  ADD COLUMN upgraded_at TIMESTAMP,
  ADD COLUMN billing_email VARCHAR(255);

-- Index for billing queries
CREATE INDEX idx_tenants_tier_stripe ON tenants(tier, stripe_customer_id);
CREATE INDEX idx_tenants_payment_status ON tenants(payment_method_status);
```

**STRUCTURAL UPGRADE #2:** Add `billing_periods` table with idempotency (TWEAK #3).
```sql
CREATE TABLE billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  calls INTEGER NOT NULL,
  amount DECIMAL(10, 3) NOT NULL,
  stripe_invoice_id TEXT,
  idempotency_key TEXT NOT NULL,  -- TWEAK #3: Prevent double-charging
  status VARCHAR(20) DEFAULT 'pending',  -- pending, invoiced, paid, failed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, period_start, period_end),
  UNIQUE(idempotency_key)  -- TWEAK #3: Ensure idempotency
);

CREATE INDEX idx_billing_periods_tenant ON billing_periods(tenant_id);
CREATE INDEX idx_billing_periods_status ON billing_periods(status);
CREATE INDEX idx_billing_periods_period ON billing_periods(period_start, period_end);
CREATE INDEX idx_billing_periods_idempotency ON billing_periods(idempotency_key);
```

### Stripe Integration

**Repo C (Key Vault) Requirements:**
- [ ] Store Stripe API keys in Repo C Key Vault
  - Key name: `stripe_secret_key` (or similar)
  - Key name: `stripe_publishable_key` (optional, for checkout)
- [ ] Create Repo C edge function: `/functions/v1/execute`
  - Endpoint pattern: `/api/tenants/{tenantId}/stripe/invoices.create`
  - Endpoint pattern: `/api/tenants/{tenantId}/stripe/customers.create`
  - Endpoint pattern: `/api/tenants/{tenantId}/stripe/checkout.create`
  - Retrieves Stripe keys from vault
  - Executes Stripe API calls
  - Returns result to Repo A

**Repo A Integration:**
- [ ] Repo A calls Repo C executor for all Stripe operations
- [ ] No Stripe API keys in Repo A environment variables

**Onboarding/Upgrade:**
- [ ] **STRUCTURAL UPGRADE #1:** Create Stripe Customer at onboarding (via Repo C)
- [ ] Generate Checkout Session (via Repo C)
- [ ] Webhook handler for `checkout.session.completed`
- [ ] Stripe Customer ID already stored (from onboarding)

**Monthly Billing (STRUCTURAL UPGRADE #3 - Preferred):**
- [ ] Repo A: Initiate billing (call Repo B endpoint with `Idempotency-Key` header)
- [ ] Repo B: Check idempotency (prevent double-charging) - **TWEAK #3**
- [ ] Repo B: Query audit_logs (owns the data)
- [ ] Repo B: Calculate charges per tenant
- [ ] Repo B: Call Repo C to create Stripe invoices (with idempotency_key)
- [ ] Repo C: **CRITICAL FIX #1:** Create invoice items, then invoice
- [ ] Repo C: **TWEAK #3:** Use idempotency keys to prevent duplicate invoices
- [ ] Repo B: Store billing records in `billing_periods` table (with idempotency_key)

### BigCommerce Integration (Optional)

- [ ] Create product: "Lead Scoring API - Pay Per Use"
- [ ] Link to Stripe for payment processing
- [ ] Use for marketing/landing page

---

## Database Schema

### Repo B - Critical Schema Updates

**CRITICAL FIX #3:** Add `billable` flag to audit_logs.
```sql
ALTER TABLE audit_logs ADD COLUMN billable BOOLEAN DEFAULT TRUE;

-- Set existing records to billable=true (default)
UPDATE audit_logs SET billable = TRUE WHERE billable IS NULL;

-- Index for billing queries
CREATE INDEX idx_audit_logs_billable ON audit_logs(tenant_id, status, billable, ts);
```

**Tenants table updates:**
```sql
-- Add tier and billing columns
ALTER TABLE tenants 
  ADD COLUMN tier VARCHAR(20) DEFAULT 'free',
  ADD COLUMN stripe_customer_id VARCHAR(255),
  ADD COLUMN payment_method_status VARCHAR(20) DEFAULT 'none',  -- TWEAK #5: 'none' | 'setup_pending' | 'active'
  ADD COLUMN onboarded_at TIMESTAMP,
  ADD COLUMN upgraded_at TIMESTAMP,
  ADD COLUMN billing_email VARCHAR(255);

-- Index for billing queries
CREATE INDEX idx_tenants_tier_stripe ON tenants(tier, stripe_customer_id);
CREATE INDEX idx_tenants_payment_status ON tenants(payment_method_status);
```

**STRUCTURAL UPGRADE #2:** Add `billing_periods` table with idempotency (TWEAK #3).
```sql
CREATE TABLE billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  calls INTEGER NOT NULL,
  amount DECIMAL(10, 3) NOT NULL,
  stripe_invoice_id TEXT,
  idempotency_key TEXT NOT NULL,  -- TWEAK #3: Prevent double-charging
  status VARCHAR(20) DEFAULT 'pending',  -- pending, invoiced, paid, failed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, period_start, period_end),
  UNIQUE(idempotency_key)  -- TWEAK #3: Ensure idempotency
);

CREATE INDEX idx_billing_periods_tenant ON billing_periods(tenant_id);
CREATE INDEX idx_billing_periods_status ON billing_periods(status);
CREATE INDEX idx_billing_periods_period ON billing_periods(period_start, period_end);
CREATE INDEX idx_billing_periods_idempotency ON billing_periods(idempotency_key);
```

### Repo A - User/Token mapping (if needed)

If you need to link Django users to Repo B tenants:
```sql
-- Add to existing user model or create mapping table
ALTER TABLE auth_user ADD COLUMN tenant_uuid UUID;
-- OR
CREATE TABLE user_tenant_mapping (
  user_id INTEGER REFERENCES auth_user(id),
  tenant_uuid UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/onboard/leadscoring` | POST | Instant onboarding (free tier) |
| `/api/usage` | GET | Check usage/limits |
| `/api/upgrade/checkout` | POST | Get Stripe checkout URL |
| `/api/webhooks/stripe` | POST | Handle Stripe webhooks |
| `/api/billing/invoice` | GET | View monthly charges |
| `/api/manage` | POST | Main API (existing, with usage limits) |

---

## User Experience Flow

### Agent Journey

1. **Discovery** → Finds leadscoring tool
2. **Onboarding** → Calls `/api/onboard/leadscoring` → Gets API key instantly (free)
3. **Usage** → Makes API calls → First 100 calls work
4. **Approaching Limit** → Gets warning at 90 calls
5. **Limit Reached** → Gets upgrade URL at 100 calls
6. **Upgrade** → Completes Stripe Checkout → Adds payment method
7. **Continued Usage** → No limits, billed monthly
8. **Monthly Billing** → Receives invoice, charged automatically

### Benefits

- ✅ **Zero friction** to start (no payment upfront)
- ✅ **Try before you pay** (prove value first)
- ✅ **Natural upgrade moment** (after 100 calls, they've proven value)
- ✅ **Usage-based billing** (only pay for what you use)
- ✅ **Automated** (no manual intervention needed)

---

## Pricing Model

- **Free Tier**: 100 calls/month (no payment method required)
- **Paid Tier**: Unlimited calls, $0.001 per successful call
- **Billing**: Monthly, based on actual usage from audit_logs
- **Currency**: USD

---

## Security Considerations

1. **API Key Security**: Django Tokens are secure, but consider:
   - Key rotation endpoint
   - Rate limiting per key
   - Revocation capability

2. **Tenant Isolation**: 
   - Ensure audit_logs properly filter by tenant_id
   - No cross-tenant data leakage

3. **Stripe Webhook Security**:
   - Verify webhook signatures
   - Idempotency for webhook processing

4. **Usage Validation**:
   - Only count successful calls (status = 'success')
   - Exclude read-only actions (if desired)
   - Validate tenant_uuid matches authenticated user

---

## Future Enhancements

1. **Stripe Metered Billing (Optional Improvement)**
   - Instead of manual invoicing, use Stripe's metered billing with usage records
   - Flow becomes:
     ```python
     # Repo B monthly → send usage to Stripe
     stripe.SubscriptionItem.create_usage_record(
         subscription_item="si_xxx",
         quantity=1250,
         timestamp=...
     )
     ```
   - Stripe handles invoicing automatically
   - Avoids building billing logic yourself
   - Simplifies billing long-term

2. **Tiered Pricing**: 
   - Free: 100 calls
   - Starter: $10/month + $0.001/call
   - Pro: $50/month + $0.0005/call

3. **Usage Dashboard**:
   - Real-time usage graphs
   - Cost estimates
   - Historical data

4. **Alerts**:
   - Email when approaching free tier limit
   - Email when monthly bill exceeds threshold

5. **Self-Service Management**:
   - View/rotate API keys
   - Update billing information
   - Download invoices

---

## Integration Points

### Existing Systems

- **Repo A (Django)**: Handles API requests, creates tenants
- **Repo B (Governance Hub)**: Tracks usage in audit_logs, stores tenant metadata
- **Stripe**: Payment processing, invoicing
- **BigCommerce** (optional): Product listing, marketing

### New Components Needed

1. Onboarding endpoint in Repo A
2. Stripe webhook handler in Repo A
3. Usage checking middleware in Repo A router
4. Monthly billing job (cron or scheduled task)
5. Optional: Admin dashboard for monitoring

---

## Next Steps

1. **Phase 1**: Implement basic onboarding (create tenant + API key)
2. **Phase 2**: Add usage tracking and limit enforcement
3. **Phase 3**: Integrate Stripe Checkout for upgrades
4. **Phase 4**: Build monthly billing automation
5. **Phase 5**: Add usage dashboard and self-service management
