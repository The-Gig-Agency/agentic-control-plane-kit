# Documentation Cleanup Plan

## Overview

This document tracks the cleanup of outdated documentation across all three repos after recent changes:
- New installer (Echelon CLI)
- Three-repo architecture (Repo A, B, C)
- Tenant UUID requirement for Repo B
- Authorization fixes

## Files to Remove/Archive

### Repo A (agentic-control-plane-kit)

**Temporary Fix Files (Remove):**
- `FIX-AGENT-AUTH.md`
- `FIX-CI-WORKFLOW.md`
- `FIX-DEPLOYMENT-ERRORS.md`
- `FIX-GIT-AUTH-ACEDGE.md`
- `FIX-GRAPHQL-ERROR.md`
- `FIX-GRAPHQL-PERMISSIONS.md`
- `VERIFY-FIX.md`
- `QUICK-FIX-DEPLOYMENT.md`
- `QUICK-PUSH.md`
- `PUSH-INSTRUCTIONS.md`
- `SETUP-ACEDGE-ACCESS.md`
- `SIMPLIFY-ACCESS.md`
- `REPOSITORY-SETUP.md`
- `SETUP.md`
- `CREATE-REPO-FIRST.md`

**Scripts (Can remove if not needed):**
- `fix-ci-workflow.sh`
- `fix-git-auth.sh`
- `push-to-github.sh`
- `QUICK-ACEDGE-SETUP.sh`
- `COMMIT-CHANGES.sh`

**Keep but Update:**
- `INSTALL.md` - Update to reference installer as primary method
- `INTEGRATION-GUIDE.md` - Update for installer, tenant UUID
- `SAAS-DEPLOYMENT-GUIDE.md` - Update for installer, three-repo architecture
- `README.md` - Already updated, verify completeness

## Files to Update

### Repo A

1. **README.md** ✅ (Already mentions installer)
   - Verify three-repo architecture is mentioned
   - Verify tenant UUID requirement is clear

2. **INSTALL.md**
   - Change to reference installer as primary method
   - Keep manual install as fallback/advanced option
   - Add tenant UUID setup step

3. **INTEGRATION-GUIDE.md**
   - Update to use installer
   - Add tenant UUID requirement
   - Update for three-repo architecture

4. **SAAS-DEPLOYMENT-GUIDE.md**
   - Update Phase 1 to use installer
   - Add tenant UUID registration step
   - Update environment variables section

### Repo B (governance-hub)

1. **INTEGRATION-GUIDE.md**
   - Add tenant UUID registration step
   - Clarify tenant UUID vs local tenant ID
   - Update environment variables

### Repo C (key-vault-executor)

1. **INTEGRATION-GUIDE.md**
   - Verify accuracy
   - Ensure all environment variables documented

## Key Updates Needed

### Tenant UUID Requirement

All docs should clarify:
- Repo A uses local tenant ID (e.g., `user.id`) for local operations
- Repo B requires tenant UUID (registered during onboarding)
- Repo A must send tenant UUID to Repo B (via `GOVERNANCE_TENANT_ID` env var)

### Installer as Primary Method

All installation docs should:
1. Start with installer: `npx echelon install`
2. Manual install as fallback/advanced option
3. Reference installer docs for details

### Three-Repo Architecture

All docs should clearly explain:
- Repo A = Kernel (execution)
- Repo B = Governance (authorization, audit)
- Repo C = Key Vault + Executor (secrets, external calls)

## Status

- [ ] Remove outdated files
- [ ] Update INSTALL.md
- [ ] Update INTEGRATION-GUIDE.md (Repo A)
- [ ] Update SAAS-DEPLOYMENT-GUIDE.md
- [ ] Update Repo B INTEGRATION-GUIDE.md
- [ ] Verify Repo C docs
- [ ] Update README files if needed
