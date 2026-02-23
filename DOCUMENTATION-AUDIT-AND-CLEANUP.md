# Documentation Audit and Cleanup Plan

**Date:** February 23, 2026  
**Purpose:** Review, consolidate, and clean up all markdown documentation across three repos

---

## Summary

**Total Files Found:**
- Repo A: 137 MD files
- Repo B: 10 MD files  
- Repo C: 8 MD files

**Issues Identified:**
1. **Duplicates:** `MCP-GATEWAY-SUMMARY.md` exists in all three repos (should only be in Repo A)
2. **Outdated Deployment Guides:** Many Vercel/Fly.io troubleshooting files that are no longer relevant (we use Railway)
3. **Temporary Files:** Implementation summaries and push confirmations that are no longer needed
4. **Inconsistent References:** Some docs reference outdated architecture

---

## Files to Delete

### Repo A (agentic-control-plane-kit)

#### Duplicate MCP Gateway Summaries (keep only in Repo A)
- ✅ Keep: `MCP-GATEWAY-SUMMARY.md` (Repo A)
- ❌ Delete: `../governance-hub/MCP-GATEWAY-SUMMARY.md` (duplicate)
- ❌ Delete: `../key-vault-executor/MCP-GATEWAY-SUMMARY.md` (duplicate)

#### Outdated Deployment Troubleshooting (Railway is current)
- ❌ `VERCEL-COMPATIBILITY-ASSESSMENT.md` - Vercel not used
- ❌ `VERCEL-DEPLOY-FIX.md` - Vercel not used
- ❌ `VERCEL-LOGS-GUIDE.md` - Vercel not used
- ❌ `CHECK-VERCEL-LOGS.md` - Vercel not used
- ❌ `GATEWAY-VERIFICATION.md` - Vercel-specific
- ❌ `VERCEL-AWS-SETUP.md` - Vercel not used
- ❌ `gateway/FLY-IO-*.md` (all Fly.io files) - Fly.io not used
  - `gateway/FLY-IO-DEPLOYMENT.md`
  - `gateway/FLY-IO-PRICING.md`
  - `gateway/FLY-IO-STEP-BY-STEP.md`
  - `gateway/FLY-IO-TROUBLESHOOTING.md`
  - `gateway/FLY-IO-FIX-SUSPENDED.md`
  - `gateway/FLY-REGIONS.md`
  - `gateway/INSTALL-FLY-CLI.md`
  - `gateway/FLY-IO-STATUS.md`
  - `gateway/DELETE-FLY-APP.md`
  - `gateway/RESET-MACHINE.md`
  - `gateway/START-MACHINE.md`
  - `gateway/ALTERNATIVE-DEPLOYMENT.md`
- ❌ `gateway/ECS-FARGATE-DEPLOYMENT.md` - Not used (Railway is current)
- ❌ `gateway/RAILWAY-*.md` (troubleshooting files, keep main deployment guide)
  - `gateway/RAILWAY-AUTO-DEPLOY-FIX.md` - Temporary troubleshooting
  - `gateway/RAILWAY-MANUAL-REDEPLOY.md` - Temporary troubleshooting
  - `gateway/RAILWAY-FIX.md` - Temporary troubleshooting
  - ✅ Keep: `gateway/RAILWAY-DEPLOYMENT.md` (main guide)
- ❌ `gateway/DEPLOYMENT-OPTIONS.md` - Outdated comparison
- ❌ `gateway/DEBUG-BUILD.md` - Temporary troubleshooting
- ❌ `gateway/FORCE-REBUILD.md` - Temporary troubleshooting
- ❌ `gateway/FIX-DOCKERFILE-PATH.md` - Temporary troubleshooting
- ❌ `gateway/DEPLOY-FROM-ROOT.md` - Temporary troubleshooting
- ❌ `gateway/FIX-MODULE-NOT-FOUND.md` - Temporary troubleshooting
- ❌ `gateway/VERIFY-GATEWAY.md` - Temporary verification
- ❌ `gateway/VERIFY-DEPLOYMENT.md` - Temporary verification

#### Temporary Implementation Summaries
- ❌ `PUSH-CONFIRMATION.md` - Temporary push checklist
- ❌ `DOCUMENTATION-CLEANUP-SUMMARY.md` - Already completed cleanup
- ❌ `DOCUMENTATION-CLEANUP-PLAN.md` - Already completed cleanup
- ❌ `MCP-IMPLEMENTATION-SECURITY-HARDENING.md` - Consolidated into main docs
- ❌ `SECURITY-HARDENING-IMPLEMENTATION.md` - Consolidated into main docs
- ❌ `STRATEGIC-ASSESSMENT-MCP-IMPLEMENTATION.md` - Temporary assessment
- ❌ `gateway/PRE-PRODUCTION-COMPLETE.md` - Temporary status
- ❌ `gateway/TEST-COVERAGE-COMPLETE.md` - Temporary status
- ❌ `gateway/IMPLEMENTATION-CHECKLIST.md` - Temporary checklist
- ❌ `gateway/MULTI-TENANT-ONBOARDING-FLOW.md` - Consolidated into main docs
- ❌ `gateway/HOSTED-GATEWAY-SIGNUP-FLOW.md` - Consolidated into main docs
- ❌ `gateway/HOSTED-GATEWAY-ARCHITECTURE.md` - Consolidated into main docs
- ❌ `gateway/AGENT-MCP-REGISTRATION-ARCHITECTURE.md` - Consolidated into main docs
- ❌ `gateway/CREDENTIAL-STORAGE-ARCHITECTURE.md` - Consolidated into main docs
- ❌ `gateway/WHAT-IS-STORED-IN-REPO-A.md` - Consolidated into main docs
- ❌ `gateway/MCP-REGISTRATION-IMPLEMENTATION-PLAN.md` - Consolidated into main docs

#### Keep (Current/Canonical)
- ✅ `README.md` - Main repo README
- ✅ `THREE-REPO-CANONICAL-MODEL.md` - **Canonical architecture doc**
- ✅ `MCP-GATEWAY-SUMMARY.md` - Main gateway summary
- ✅ `MCP-GATEWAY-THREE-REPO-ARCHITECTURE.md` - Gateway architecture
- ✅ `MCP-REGISTRATION-AND-CREDENTIAL-STORAGE-IMPLEMENTATION.md` - Current implementation
- ✅ `MCP-DEPLOYMENT-GUIDE.md` - Current deployment guide
- ✅ `CONNECTOR-CATALOG-IMPLEMENTATION.md` - Current implementation
- ✅ `INTERNAL-ENDPOINTS-SECURITY.md` - Current security model
- ✅ `SECURITY-REVIEW.md` - Current security review
- ✅ `MCP-SECURITY-RISKS.md` - Current security analysis
- ✅ `CONSUMER-PRODUCT-GUIDE.md` - Current product guide
- ✅ `SIGNUP-IMPLEMENTATION-GUIDE.md` - Current signup guide
- ✅ `GATEWAY-SIGNUP-ARCHITECTURE.md` - Current architecture
- ✅ `BILLING-ARCHITECTURE.md` - Current billing model
- ✅ `DOMAIN-SETUP-GUIDE.md` - Current domain setup
- ✅ `AWS-SUBDOMAIN-SETUP.md` - Current AWS setup
- ✅ `RAILWAY-DEPLOYMENT.md` - Current deployment (root level)
- ✅ `gateway/RAILWAY-DEPLOYMENT.md` - Current deployment (gateway-specific)
- ✅ `gateway/README.md` - Gateway README
- ✅ `gateway/QA-REPORT.md` - QA report
- ✅ `gateway/docs/AGENT-DISCOVERY-GUIDE.md` - Agent guide
- ✅ `gateway/docs/DISCOVERY-PROTOCOL.md` - Discovery protocol
- ✅ `docs/MCP-GATEWAY-PLAN.md` - Gateway plan
- ✅ `docs/AGENT-GOVERNANCE-GUIDE.md` - Agent governance guide
- ✅ `docs/GOVERNANCE-PACK.md` - Governance pack docs
- ✅ All installer docs (still relevant)
- ✅ All spec docs (still relevant)
- ✅ All test docs (still relevant)

---

## Files to Update

### Repo A README.md
- ✅ Already references THREE-REPO-CANONICAL-MODEL.md
- ✅ Already references MCP-GATEWAY-PLAN.md
- ✅ Add reference to INTERNAL-ENDPOINTS-SECURITY.md
- ✅ Add reference to CONNECTOR-CATALOG-IMPLEMENTATION.md

### Repo B README.md
- ✅ Already references ARCHITECTURE.md
- ✅ Already references INTEGRATION-GUIDE.md
- ✅ Already references docs/AGENT-GOVERNANCE-GUIDE.md
- ✅ Add reference to THREE-REPO-CANONICAL-MODEL.md (in Repo A)

### Repo C README.md
- ✅ Already references ARCHITECTURE.md
- ✅ Already references INTEGRATION-GUIDE.md
- ✅ Add reference to THREE-REPO-CANONICAL-MODEL.md (in Repo A)
- ✅ Add reference to INTERNAL-ENDPOINTS-SECURITY.md (in Repo A)

---

## Consistency Checks

### Architecture References
- ✅ All three repos reference THREE-REPO-CANONICAL-MODEL.md (in Repo A)
- ✅ All three repos have consistent ARCHITECTURE.md files
- ✅ All three repos have consistent INTEGRATION-GUIDE.md files

### MCP Gateway References
- ✅ Only Repo A has MCP-GATEWAY-SUMMARY.md (canonical)
- ✅ All repos reference gateway docs in Repo A

### Security References
- ✅ INTERNAL-ENDPOINTS-SECURITY.md (Repo A) - canonical
- ✅ SECURITY-REVIEW.md (Repo A) - canonical
- ✅ MCP-SECURITY-RISKS.md (Repo A) - canonical

---

## Execution Plan

1. **Delete duplicate files** (Repo B and Repo C)
2. **Delete outdated deployment guides** (Repo A)
3. **Delete temporary implementation summaries** (Repo A)
4. **Update README files** to reference canonical docs
5. **Verify consistency** across all three repos

---

**Status:** Ready for execution
