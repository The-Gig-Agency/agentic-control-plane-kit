# High-Cost MCP Connectors - Priority List

**Date:** February 24, 2026  
**Purpose:** Prioritized list of MCP servers that can incur real costs, requiring immediate governance

---

## 🚨 Critical Priority (Add to Catalog Immediately)

These connectors can result in **unlimited costs** or **direct financial transactions**:

### 1. **AWS** (`aws`) - 🔴 CRITICAL
- **Cost Risk:** Unlimited cloud infrastructure provisioning
- **Potential:** $100s-$1000s/day if unchecked
- **Actions:** EC2, S3, Lambda, RDS, ECS, EKS provisioning
- **Governance:** Require approval + daily spend limits

### 2. **GCP** (`gcp`) - 🔴 CRITICAL  
- **Cost Risk:** Unlimited cloud infrastructure provisioning
- **Potential:** $100s-$1000s/day if unchecked
- **Actions:** Compute Engine, Cloud Storage, Cloud Functions, GKE
- **Governance:** Require approval + daily spend limits

### 3. **Stripe** (`stripe`) - 🔴 CRITICAL
- **Cost Risk:** Direct payment processing
- **Potential:** Unlimited charges, refunds, transfers
- **Actions:** Create charges, refunds, subscriptions, invoices
- **Governance:** Require approval + transaction amount limits

### 4. **Shopify** (`shopify`) - 🔴 CRITICAL
- **Cost Risk:** E-commerce transactions
- **Potential:** Unlimited orders, refunds, inventory changes
- **Actions:** Create orders, process refunds, fulfill orders
- **Governance:** Require approval + order amount limits

---

## ⚠️ High Priority (Add Soon)

These connectors can incur significant costs in cloud environments:

### 5. **Docker** (`docker`) - 🟡 HIGH
- **Cost Risk:** Container infrastructure (if cloud-hosted)
- **Potential:** $10s-$100s/day
- **Actions:** Run containers, pull images, manage volumes
- **Governance:** Monitor container count + resource limits

### 6. **Kubernetes** (`kubernetes`) - 🟡 HIGH
- **Cost Risk:** Cluster provisioning (if cloud-hosted)
- **Potential:** $10s-$100s/day
- **Actions:** Create pods, services, persistent volumes
- **Governance:** Monitor pod count + resource quotas

### 7. **Postgres** (`postgres`) - 🟡 MEDIUM-HIGH
- **Cost Risk:** Database provisioning (if cloud-hosted)
- **Potential:** $2-$50/day per instance
- **Actions:** Create databases, run queries, manage data
- **Governance:** Monitor database size + connection limits

---

## 📊 Medium Priority (Monitor Usage)

These connectors have usage-based costs or rate limits:

### 8. **Brave Search** (`brave-search`) - 🟡 MEDIUM
- **Cost Risk:** API usage limits
- **Potential:** $3-$5 per 1,000 queries
- **Actions:** Search API calls
- **Governance:** Rate limiting + daily query limits

### 9. **GitHub** (`github`) - 🟡 LOW-MEDIUM
- **Cost Risk:** Actions compute costs
- **Potential:** $0.008-$0.08 per minute
- **Actions:** Trigger workflows, create repos
- **Governance:** Monitor Actions usage + workflow timeouts

---

## ✅ Low Priority (Minimal Risk)

These connectors have minimal or no cost risk:

- **filesystem** - Local only, no cost
- **memory** - Local only, no cost
- **git** - Local only, no cost
- **sqlite** - Local only, no cost
- **fetch** - HTTP requests, minimal cost
- **youtube-transcript** - Usually free tier
- **slack** - Free tier usually sufficient
- **discord** - Free tier usually sufficient
- **puppeteer** - Local browser automation, minimal cost

---

## Recommended Governance Rules

### For Critical Connectors (AWS, GCP, Stripe, Shopify):

```json
{
  "policy_type": "RequireApprovalPolicy",
  "action_pattern": "tool:(aws|gcp|stripe|shopify).*",
  "approval_required": true,
  "approval_timeout": 3600,
  "metadata": {
    "cost_risk": "critical",
    "daily_spend_limit": 100,
    "require_human_approval": true
  }
}
```

### For High Priority Connectors (Docker, Kubernetes, Postgres):

```json
{
  "policy_type": "LimitPolicy",
  "action_pattern": "tool:(docker|kubernetes|postgres).*",
  "limit_type": "resource_count",
  "limit_value": 10,
  "metadata": {
    "cost_risk": "high",
    "monitor_usage": true
  }
}
```

---

## Implementation Checklist

### Phase 1: Critical (This Week)
- [x] ✅ **AWS** - Already in seed migration
- [x] ✅ **GCP** - Already in seed migration
- [x] ✅ **Stripe** - Already in seed migration
- [x] ✅ **Shopify** - Already in seed migration

### Phase 2: High Priority (Next Week)
- [x] ✅ **Docker** - Already in seed migration
- [x] ✅ **Kubernetes** - Already in seed migration
- [x] ✅ **Postgres** - Already in seed migration

### Phase 3: Medium Priority (Week 3)
- [x] ✅ **Brave Search** - Already in seed migration
- [x] ✅ **GitHub** - Already in seed migration

---

## Summary

**All critical and high-priority connectors are already included in the seed migration!**

Your governance platform should:
1. ✅ **Require approval** for AWS, GCP, Stripe, Shopify
2. ✅ **Set daily spend limits** for cloud services
3. ✅ **Set transaction limits** for payment processors
4. ✅ **Monitor resource counts** for infrastructure tools
5. ✅ **Track all spend-related actions** for audit

**Your platform is perfectly positioned** to prevent errant spending on these high-cost connectors! 🎯

---

**Document Version:** 1.0  
**Last Updated:** February 24, 2026
