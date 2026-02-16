# Governance Portal (Repo B) - Documentation Index

**Purpose:** This document provides a complete index of all documentation related to building the Governance Portal (agentic-control-plane-platform, Repo B).

**Status:** Ready for review by Lovable and ChatGPT

---

## 📋 Core Documentation Files

### 1. **PLATFORM-BUILD-PLAN.md** ⭐ PRIMARY DOCUMENT
**Location:** `docs/marketing/PLATFORM-BUILD-PLAN.md`

**Contents:**
- Complete API specifications (`/authorize`, `/heartbeat`, `/revoke`)
- Database schema (organizations, policies, audit_logs, kernels, revocations)
- Kernel integration points (ControlPlaneAdapter interface)
- Performance requirements (<50ms for `/authorize`)
- Security requirements (HMAC-SHA-256, kernel authentication)
- Multi-tenancy architecture (organization layer)
- Policy management (priority, enabled flags)
- Decision logging (decision_source, policy_id, allowed)
- API response formats (decisionId, policyVersion)

**Key Sections:**
- Architecture Overview
- API Endpoints
- Database Schema
- Kernel Integration
- Performance Targets
- Security Model
- Multi-Tenancy
- Implementation Phases

**Last Updated:** February 2026

---

### 2. **KERNEL-TO-PLATFORM-EVOLUTION.md**
**Location:** `docs/marketing/KERNEL-TO-PLATFORM-EVOLUTION.md`

**Contents:**
- Evolution strategy from kernel to full platform
- Authoritative decision-maker model
- Platform as central authority, kernel as enforcement agent
- Policy engine architecture
- Audit viewer requirements
- Identity registry design
- Revocation system
- Commercial model (free kernel + paid platform)

**Key Sections:**
- Current State (Kernel)
- Target State (Platform)
- Evolution Path
- Authoritative Model
- Commercial Strategy

**Last Updated:** February 2026

---

### 3. **REPO-SEPARATION-STRATEGY.md**
**Location:** `docs/marketing/REPO-SEPARATION-STRATEGY.md`

**Contents:**
- Two-repo model rationale
- What stays in Repo A (kernel)
- What goes in Repo B (platform)
- Release cycle differences
- Buyer/user differences
- Risk profile separation
- Linux kernel vs distros analogy
- Terraform vs Terraform Cloud analogy

**Key Sections:**
- Why Separate?
- Repo A Contents (Kernel)
- Repo B Contents (Platform)
- Release Cycles
- Commercial Model

**Last Updated:** February 2026

---

### 4. **STRATEGIC-INSIGHT.md**
**Location:** `docs/marketing/STRATEGIC-INSIGHT.md`

**Contents:**
- Authoritative vs Advisory model distinction
- Why centralized authority matters
- Platform as decision authority
- Kernel as enforcement agent
- Real-world examples (Kubernetes, AWS, Stripe)
- Commercial implications

**Key Sections:**
- The Critical Distinction
- Why Authority Matters
- Commercial Model
- Examples

**Last Updated:** February 2026

---

### 5. **VALUE-PROPOSITION.md**
**Location:** `docs/marketing/VALUE-PROPOSITION.md`

**Contents:**
- Core value proposition
- Key benefits
- Target users
- Use cases
- Competitive advantages

**Key Sections:**
- Value Proposition
- Key Benefits
- Target Users
- Use Cases

**Last Updated:** February 2026

---

## 🎯 Recommended Reading Order for Review

### For Lovable (Implementation Team):
1. **PLATFORM-BUILD-PLAN.md** - Start here (complete technical spec)
2. **REPO-SEPARATION-STRATEGY.md** - Understand what goes in Repo B
3. **KERNEL-TO-PLATFORM-EVOLUTION.md** - Understand the evolution path

### For ChatGPT (Strategic Review):
1. **STRATEGIC-INSIGHT.md** - Understand the authoritative model
2. **VALUE-PROPOSITION.md** - Understand the value prop
3. **KERNEL-TO-PLATFORM-EVOLUTION.md** - Understand the evolution
4. **PLATFORM-BUILD-PLAN.md** - Review technical implementation

---

## 📊 Document Status

| Document | Status | Completeness | Last Updated |
|----------|--------|--------------|--------------|
| PLATFORM-BUILD-PLAN.md | ✅ Complete | 100% | Feb 2026 |
| KERNEL-TO-PLATFORM-EVOLUTION.md | ✅ Complete | 100% | Feb 2026 |
| REPO-SEPARATION-STRATEGY.md | ✅ Complete | 100% | Feb 2026 |
| STRATEGIC-INSIGHT.md | ✅ Complete | 100% | Feb 2026 |
| VALUE-PROPOSITION.md | ✅ Complete | 100% | Feb 2026 |

---

## 🔑 Key Concepts Across All Documents

### 1. **Authoritative Model**
- Platform makes decisions, kernel enforces them
- Not "distributed policy enforcement"
- Centralized authority for governance

### 2. **Two-Repo Strategy**
- Repo A: Kernel (portable, embeddable, stable)
- Repo B: Platform (governance services, UI, fast iteration)

### 3. **Performance Requirements**
- `/authorize` endpoint: <50ms target
- Stateless evaluation
- In-memory policy cache
- Indexed lookups

### 4. **Security Model**
- Kernel authentication (api_key_hash, organization_id)
- HMAC-SHA-256 for API keys
- Policy priority and enabled flags
- Decision logging with traceability

### 5. **Multi-Tenancy**
- Organization layer (organizations table)
- All resources scoped to organization_id
- True SaaS control plane model

---

## 📝 Quick Reference: What Goes in Repo B?

From **REPO-SEPARATION-STRATEGY.md**:

### Platform Services (Repo B):
- ✅ Authoritative policy service (decision API)
- ✅ Policy authoring UI
- ✅ Audit lake + query API + dashboards
- ✅ Identity registry + SSO
- ✅ Revocation + alerting
- ✅ Multi-kernel inventory
- ✅ Connectors: Slack/Teams, SIEM, PagerDuty, webhook sinks

### Kernel (Repo A) - Stays Separate:
- ✅ Spec + envelope/error/impact definitions
- ✅ Conformance tests
- ✅ Kernel(s) TS + Python
- ✅ Adapter interfaces (incl. PolicyAdapter interface)
- ✅ Core packs (iam/webhooks/settings)
- ✅ Thin "platform client" adapter (HTTP callout)

---

## 🚀 Next Steps

1. **Review all documents** - Ensure completeness and accuracy
2. **Share with Lovable** - For implementation planning
3. **Share with ChatGPT** - For strategic review and refinement
4. **Create Repo B** - Initialize new repository for platform
5. **Begin Phase 1** - Start with `/authorize` endpoint

---

## 📁 File Locations

All documents are in: `/docs/marketing/`

```
docs/marketing/
├── README.md (index)
├── PLATFORM-BUILD-PLAN.md ⭐
├── KERNEL-TO-PLATFORM-EVOLUTION.md
├── REPO-SEPARATION-STRATEGY.md
├── STRATEGIC-INSIGHT.md
└── VALUE-PROPOSITION.md
```

---

*Last Updated: February 2026*  
*Status: Ready for Review*
