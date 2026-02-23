# Spend Governance - High-Cost MCP Connectors

**Date:** February 24, 2026  
**Purpose:** Identify MCP servers that can incur real monetary costs, requiring strict governance controls

---

## Executive Summary

**High-Cost Connectors (Require Strict Governance):**
- 🚨 **AWS** - Cloud infrastructure provisioning
- 🚨 **GCP** - Cloud infrastructure provisioning  
- 🚨 **Stripe** - Payment processing
- 🚨 **Shopify** - E-commerce transactions
- ⚠️ **Docker** - Container infrastructure
- ⚠️ **Kubernetes** - Cluster provisioning
- ⚠️ **Postgres** - Database provisioning (if cloud-hosted)

**Medium-Cost Connectors (Monitor Usage):**
- 📊 **Brave Search** - API usage limits/costs
- 📊 **GitHub** - API rate limits, paid actions
- 📊 **Slack/Discord** - API usage (usually free tier)

**Low-Cost Connectors (Minimal Risk):**
- ✅ **Filesystem** - Local only
- ✅ **Memory** - Local only
- ✅ **Git** - Local only
- ✅ **SQLite** - Local only
- ✅ **Fetch** - HTTP requests (minimal)
- ✅ **YouTube Transcript** - API calls (usually free)

---

## High-Cost Connectors (🚨 Critical Governance Required)

### 1. AWS (`aws`)
**Cost Risk:** 🔴 **CRITICAL**

**What Agents Can Do:**
- Provision EC2 instances ($0.01-$10+/hour per instance)
- Create S3 buckets and store data ($0.023/GB/month)
- Launch Lambda functions (pay per execution)
- Create RDS databases ($0.017-$5+/hour)
- Provision ECS/EKS clusters ($0.10/hour + compute)
- Create CloudFormation stacks (can launch expensive resources)

**Potential Costs:**
- **Unlimited** - An agent could provision hundreds of instances
- **Example:** 10 EC2 instances × $0.10/hour × 24 hours = **$24/day** = **$720/month**
- **Worst case:** Thousands of dollars per day if unchecked

**Governance Rules Needed:**
- ✅ **Require approval** for all `aws.*` tool calls
- ✅ **Daily spend limit** (e.g., $100/day)
- ✅ **Instance count limits** (e.g., max 5 EC2 instances)
- ✅ **Resource type allowlist** (block expensive services)
- ✅ **Region restrictions** (prevent multi-region sprawl)

---

### 2. GCP (`gcp`)
**Cost Risk:** 🔴 **CRITICAL**

**What Agents Can Do:**
- Provision Compute Engine VMs ($0.01-$10+/hour)
- Create Cloud Storage buckets ($0.020/GB/month)
- Launch Cloud Functions (pay per execution)
- Create Cloud SQL databases ($0.025-$5+/hour)
- Provision GKE clusters ($0.10/hour + compute)
- Create BigQuery datasets (pay per query)

**Potential Costs:**
- **Unlimited** - Similar to AWS
- **Example:** 10 VMs × $0.10/hour × 24 hours = **$24/day** = **$720/month**
- **Worst case:** Thousands of dollars per day

**Governance Rules Needed:**
- ✅ **Require approval** for all `gcp.*` tool calls
- ✅ **Daily spend limit** (e.g., $100/day)
- ✅ **VM count limits** (e.g., max 5 instances)
- ✅ **Resource type allowlist**
- ✅ **Project restrictions**

---

### 3. Stripe (`stripe`)
**Cost Risk:** 🔴 **CRITICAL**

**What Agents Can Do:**
- Create charges (process payments)
- Create refunds (reverse payments)
- Create customers (add to billing)
- Create subscriptions (recurring charges)
- Create invoices (bill customers)
- Transfer funds (move money)

**Potential Costs:**
- **Direct financial transactions** - Real money moves
- **Example:** Agent creates $1,000 charge = **$1,000 actual cost**
- **Worst case:** Unlimited charges, refunds, transfers

**Governance Rules Needed:**
- ✅ **Require approval** for ALL `stripe.*` tool calls
- ✅ **Transaction amount limits** (e.g., max $100 per transaction)
- ✅ **Daily transaction limit** (e.g., max $1,000/day)
- ✅ **Action allowlist** (block refunds, transfers)
- ✅ **Human-in-the-loop** for all financial operations

---

### 4. Shopify (`shopify`)
**Cost Risk:** 🔴 **CRITICAL**

**What Agents Can Do:**
- Create orders (process sales)
- Create products (add inventory)
- Create customers (add to store)
- Fulfill orders (ship products)
- Process refunds (reverse sales)
- Update inventory (change stock levels)

**Potential Costs:**
- **E-commerce transactions** - Real sales/refunds
- **Example:** Agent creates order for $500 product = **$500 actual cost**
- **Worst case:** Unlimited orders, refunds, inventory changes

**Governance Rules Needed:**
- ✅ **Require approval** for order creation/refunds
- ✅ **Order amount limits** (e.g., max $100 per order)
- ✅ **Daily order limit** (e.g., max 10 orders/day)
- ✅ **Action allowlist** (block refunds, inventory deletes)
- ✅ **Human-in-the-loop** for financial operations

---

## Medium-Cost Connectors (⚠️ Monitor Usage)

### 5. Docker (`docker`)
**Cost Risk:** 🟡 **MEDIUM-HIGH** (if cloud-hosted)

**What Agents Can Do:**
- Run containers (compute costs)
- Pull images (bandwidth costs)
- Build images (compute costs)
- Manage volumes (storage costs)

**Potential Costs:**
- **If cloud-hosted:** Similar to AWS/GCP compute costs
- **If local:** Minimal (just compute time)
- **Example:** 10 containers × $0.05/hour = **$0.50/hour** = **$360/month**

**Governance Rules Needed:**
- ⚠️ **Monitor container count** (if cloud-hosted)
- ⚠️ **Resource limits** (CPU, memory)
- ⚠️ **Image size limits**

---

### 6. Kubernetes (`kubernetes`)
**Cost Risk:** 🟡 **MEDIUM-HIGH** (if cloud-hosted)

**What Agents Can Do:**
- Create pods (compute costs)
- Create services (network costs)
- Create persistent volumes (storage costs)
- Scale deployments (more compute)

**Potential Costs:**
- **If cloud-hosted:** Similar to AWS/GCP
- **If local:** Minimal
- **Example:** 10 pods × $0.10/hour = **$1/hour** = **$720/month**

**Governance Rules Needed:**
- ⚠️ **Monitor pod count** (if cloud-hosted)
- ⚠️ **Resource quotas** (CPU, memory)
- ⚠️ **Namespace restrictions**

---

### 7. Postgres (`postgres`)
**Cost Risk:** 🟡 **MEDIUM** (if cloud-hosted)

**What Agents Can Do:**
- Create databases (storage costs)
- Run queries (compute costs)
- Create tables (storage costs)
- Insert/update data (I/O costs)

**Potential Costs:**
- **If cloud-hosted:** $0.025-$5+/hour per instance
- **If local:** Minimal
- **Example:** 1 RDS instance × $0.10/hour = **$2.40/day** = **$72/month**

**Governance Rules Needed:**
- ⚠️ **Monitor database size** (if cloud-hosted)
- ⚠️ **Query timeout limits**
- ⚠️ **Connection limits**

---

### 8. Brave Search (`brave-search`)
**Cost Risk:** 🟡 **MEDIUM**

**What Agents Can Do:**
- Make search API calls (usage-based pricing)
- Exceed free tier limits

**Potential Costs:**
- **Free tier:** Usually 2,000 queries/month
- **Paid tier:** $3-$5 per 1,000 queries
- **Example:** 10,000 queries = **$30-$50/month**

**Governance Rules Needed:**
- ⚠️ **Rate limiting** (queries per minute)
- ⚠️ **Daily query limit** (e.g., max 1,000/day)
- ⚠️ **Monitor API usage**

---

### 9. GitHub (`github`)
**Cost Risk:** 🟡 **LOW-MEDIUM**

**What Agents Can Do:**
- Create repositories (free for public)
- Trigger Actions workflows (compute costs)
- Create issues/PRs (minimal cost)
- Access private repos (requires paid plan)

**Potential Costs:**
- **Actions:** $0.008-$0.08 per minute
- **Example:** 1,000 minutes/month = **$8-$80/month**

**Governance Rules Needed:**
- ⚠️ **Monitor Actions usage**
- ⚠️ **Workflow timeout limits**
- ⚠️ **Repository creation limits**

---

## Recommended Governance Policies

### Policy 1: High-Cost Connector Approval
```json
{
  "policy_type": "RequireApprovalPolicy",
  "action_pattern": "tool:(aws|gcp|stripe|shopify).*",
  "approval_required": true,
  "approval_timeout": 3600
}
```

### Policy 2: Daily Spend Limits
```json
{
  "policy_type": "LimitPolicy",
  "action_pattern": "tool:(aws|gcp).*",
  "limit_type": "daily_spend",
  "limit_value": 100,
  "unit": "USD"
}
```

### Policy 3: Transaction Amount Limits
```json
{
  "policy_type": "LimitPolicy",
  "action_pattern": "tool:(stripe|shopify).(charge|order|refund).*",
  "limit_type": "transaction_amount",
  "limit_value": 100,
  "unit": "USD"
}
```

### Policy 4: Resource Count Limits
```json
{
  "policy_type": "LimitPolicy",
  "action_pattern": "tool:(aws|gcp).(ec2|compute).*",
  "limit_type": "resource_count",
  "limit_value": 5,
  "resource_type": "instance"
}
```

---

## Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ **Stripe** - Financial transactions
2. ✅ **Shopify** - E-commerce transactions
3. ✅ **AWS** - Cloud infrastructure
4. ✅ **GCP** - Cloud infrastructure

### Phase 2: High Priority (Week 1)
5. ⚠️ **Docker** - If cloud-hosted
6. ⚠️ **Kubernetes** - If cloud-hosted
7. ⚠️ **Postgres** - If cloud-hosted

### Phase 3: Monitoring (Week 2)
8. 📊 **Brave Search** - API usage
9. 📊 **GitHub** - Actions usage

---

## Summary

**4 Critical Connectors** require immediate governance:
- 🚨 AWS
- 🚨 GCP
- 🚨 Stripe
- 🚨 Shopify

**These connectors can:**
- Incur unlimited costs if unchecked
- Process real financial transactions
- Provision expensive cloud resources
- Require **human approval** for all operations

**Your governance platform is essential** for preventing:
- Accidental cloud resource provisioning
- Unauthorized payment processing
- Uncontrolled spending
- Financial fraud

---

**Document Version:** 1.0  
**Last Updated:** February 24, 2026
