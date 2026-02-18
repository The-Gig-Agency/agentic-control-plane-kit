# Agent Governance Guide

**Purpose:** Comprehensive guide for agents using the Agentic Control Plane governance capabilities  
**Last Updated:** February 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Discovering Capabilities](#discovering-capabilities)
3. [Policy Proposals](#policy-proposals)
4. [Policy Types](#policy-types)
5. [API Actions Reference](#api-actions-reference)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Runbooks](#runbooks)

---

## Overview

The Agentic Control Plane provides governance capabilities that allow agents to propose policies, limits, and runbooks for review and approval. This follows a **proposal-only model** where:

- ✅ Agents can **propose** policies via `governance.propose_policy`
- ❌ Agents **cannot** publish policies directly (human approval required)
- ✅ All proposals are **audited** and tracked
- ✅ Platform admins **review and approve/reject** proposals

**Flow:** Agent → `governance.propose_policy` → Governance Hub → Human Review → Published Policy

---

## Discovering Capabilities

### Using meta.actions

Always start by discovering available actions:

```bash
POST /api/manage
{
  "action": "meta.actions"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "actions": [
      {
        "name": "governance.propose_policy",
        "scope": "manage.governance",
        "description": "Propose a policy, limit, or runbook to Governance Hub for review and approval",
        "params_schema": {
          "type": "object",
          "properties": {
            "title": { "type": "string", "maxLength": 120 },
            "summary": { "type": "string", "maxLength": 300 },
            "proposal_kind": { "type": "string", "enum": ["policy", "limit", "runbook", "revocation_suggestion"] },
            "proposal": { "type": "object" },
            "rationale": { "type": "string", "maxLength": 2000 },
            "evidence": { "type": "object" }
          },
          "required": ["title", "summary", "proposal_kind", "proposal", "rationale"]
        },
        "supports_dry_run": true
      }
    ],
    "api_version": "v1",
    "total_actions": <count>
  }
}
```

### Required Scopes

To use governance capabilities, your API key must have the `manage.governance` scope. Check available scopes by examining the `meta.actions` response or testing a proposal with `dry_run: true`.

---

## Policy Proposals

### Action: `governance.propose_policy`

**Scope:** `manage.governance`  
**Supports Dry Run:** ✅ Yes

### Basic Request Structure

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "Prevent weekend deletes",
    "summary": "Block all delete actions on weekends to prevent accidental data loss",
    "proposal_kind": "policy",
    "proposal": {
      "type": "RequireApprovalPolicy",
      "data": {
        "action": "domain.*.delete",
        "scope": "tenant",
        "approver_role": "org_admin",
        "message": "Deletes require approval on weekends"
      }
    },
    "rationale": "Prevent accidental data loss during off-hours when support is limited",
    "evidence": {
      "audit_event_ids": [],
      "links": []
    }
  }
}
```

### Parameter Details

| Parameter | Type | Required | Max Length | Description |
|-----------|------|----------|------------|-------------|
| `title` | string | ✅ | 120 chars | Short, descriptive title for the proposal |
| `summary` | string | ✅ | 300 chars | Brief summary of what the proposal does |
| `proposal_kind` | string | ✅ | - | One of: `"policy"`, `"limit"`, `"runbook"`, `"revocation_suggestion"` |
| `proposal` | object | ✅ | - | Policy payload (see Policy Types below) |
| `rationale` | string | ✅ | 2000 chars | Explanation for why this proposal is needed |
| `evidence` | object | ❌ | - | Supporting evidence (audit_event_ids, links) |

### Response

**Success (201):**
```json
{
  "ok": true,
  "data": {
    "proposal_id": "uuid-here",
    "status": "proposed",
    "message": "Proposal submitted successfully"
  }
}
```

**Error (400/500):**
```json
{
  "ok": false,
  "error": "Error message here",
  "code": "VALIDATION_ERROR"
}
```

---

## Policy Types

### 1. LimitPolicy

Defines rate limits or ceilings for actions.

**Structure:**
```json
{
  "type": "LimitPolicy",
  "data": {
    "action": "email.send",
    "scope": "tenant|api_key|actor",
    "window_seconds": 3600,
    "max": 100,
    "enforcement": "hard|soft",
    "message": "Optional reason message"
  }
}
```

**Field Requirements:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `action` | string | ✅ | Pattern: `^[a-z0-9_.-]+$` | Action pattern to limit (e.g., `"email.send"`, `"domain.*.create"`) |
| `scope` | string | ✅ | One of: `"tenant"`, `"api_key"`, `"actor"` | Scope of the limit |
| `window_seconds` | number | ✅ | 60-604800 | Time window in seconds (1 min to 7 days) |
| `max` | number | ✅ | 1-1,000,000 | Maximum number of actions allowed in window |
| `enforcement` | string | ✅ | One of: `"hard"`, `"soft"` | `"hard"` = deny, `"soft"` = warn but allow |
| `message` | string | ❌ | - | Optional message shown when limit is hit |

**Example:**
```json
{
  "type": "LimitPolicy",
  "data": {
    "action": "domain.leadscoring.questions.upsert_bulk",
    "scope": "tenant",
    "window_seconds": 3600,
    "max": 10,
    "enforcement": "hard",
    "message": "Maximum 10 bulk question updates per hour to prevent system overload"
  }
}
```

### 2. RequireApprovalPolicy

Requires human approval before executing specific actions.

**Structure:**
```json
{
  "type": "RequireApprovalPolicy",
  "data": {
    "action": "billing.modify",
    "scope": "tenant|org",
    "approver_role": "org_admin",
    "message": "Optional message"
  }
}
```

**Field Requirements:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `action` | string | ✅ | Pattern: `^[a-z0-9_.-]+$` | Action pattern requiring approval (supports wildcards: `"domain.*.delete"`) |
| `scope` | string | ✅ | One of: `"tenant"`, `"org"` | Scope of the approval requirement |
| `approver_role` | string | ✅ | - | Role required to approve (e.g., `"org_admin"`) |
| `message` | string | ❌ | - | Optional message shown to approver |

**Example:**
```json
{
  "type": "RequireApprovalPolicy",
  "data": {
    "action": "domain.*.delete",
    "scope": "tenant",
    "approver_role": "org_admin",
    "message": "All delete operations require admin approval"
  }
}
```

### Action Patterns

Actions support wildcard patterns:

- `"domain.*.delete"` - Matches all delete actions in domain namespace
- `"domain.leadscoring.*"` - Matches all leadscoring actions
- `"*.create"` - Matches all create actions
- `"email.send"` - Exact match

---

## Complete Proposal Examples

### Example 1: Rate Limit for Email Sending

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "Limit email sending to 100/hour",
    "summary": "Prevent email spam by limiting sends to 100 per hour per tenant",
    "proposal_kind": "limit",
    "proposal": {
      "type": "LimitPolicy",
      "data": {
        "action": "email.send",
        "scope": "tenant",
        "window_seconds": 3600,
        "max": 100,
        "enforcement": "hard",
        "message": "Email sending rate limit: 100 per hour"
      }
    },
    "rationale": "Prevent accidental email spam and comply with email provider rate limits. Based on analysis of current usage patterns showing average of 50 emails/hour with occasional spikes to 80.",
    "evidence": {
      "audit_event_ids": ["event-uuid-1", "event-uuid-2"],
      "links": ["https://docs.example.com/email-limits"]
    }
  },
  "dry_run": true
}
```

### Example 2: Require Approval for Billing Changes

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "Require approval for billing modifications",
    "summary": "All billing changes must be approved by org admin",
    "proposal_kind": "policy",
    "proposal": {
      "type": "RequireApprovalPolicy",
      "data": {
        "action": "billing.*",
        "scope": "org",
        "approver_role": "org_admin",
        "message": "Billing modifications require admin approval for security"
      }
    },
    "rationale": "Billing changes are high-risk operations that could result in financial loss. Requiring admin approval adds an extra layer of security and prevents accidental modifications.",
    "evidence": {
      "audit_event_ids": [],
      "links": ["https://docs.example.com/billing-security"]
    }
  }
}
```

### Example 3: Prevent Weekend Deletes

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "Block weekend delete operations",
    "summary": "Prevent delete actions on weekends when support coverage is limited",
    "proposal_kind": "policy",
    "proposal": {
      "type": "RequireApprovalPolicy",
      "data": {
        "action": "domain.*.delete",
        "scope": "tenant",
        "approver_role": "org_admin",
        "message": "Delete operations are restricted on weekends. Please contact support for emergency deletions."
      }
    },
    "rationale": "Weekend operations have limited support coverage. Restricting deletes prevents accidental data loss when recovery options are limited.",
    "evidence": {
      "audit_event_ids": [],
      "links": []
    }
  }
}
```

---

## API Actions Reference

### Governance Actions

| Action | Scope | Description | Dry Run |
|--------|-------|-------------|---------|
| `governance.propose_policy` | `manage.governance` | Propose a policy, limit, or runbook | ✅ Yes |

### Meta Actions (Discovery)

| Action | Scope | Description | Dry Run |
|--------|-------|-------------|---------|
| `meta.actions` | `manage.read` | List all available actions with schemas | ❌ No |
| `meta.version` | `manage.read` | Get API version and schema information | ❌ No |

### Domain Actions (Example)

| Action | Scope | Description | Dry Run |
|--------|-------|-------------|---------|
| `domain.leadscoring.questions.list` | `manage.read` | List questions | ❌ No |
| `domain.leadscoring.questions.upsert_bulk` | `manage.domain` | Bulk upsert questions | ❌ No |
| `domain.leadscoring.leads.create` | `manage.domain` | Create a lead | ✅ Yes |

**Note:** Domain actions vary by implementation. Always use `meta.actions` to discover available actions.

---

## Error Handling

### Common Errors

#### 1. Scope Denied

**Error:**
```json
{
  "ok": false,
  "error": "Insufficient scope: action 'governance.propose_policy' requires 'manage.governance'",
  "code": "SCOPE_DENIED"
}
```

**Resolution:**
- Ensure your API key has the `manage.governance` scope
- Contact admin to grant the required scope

#### 2. Validation Error

**Error:**
```json
{
  "ok": false,
  "error": "Title must be <= 120 characters",
  "code": "VALIDATION_ERROR"
}
```

**Resolution:**
- Check parameter constraints in the action schema
- Use `dry_run: true` to validate before submitting
- Review the `params_schema` from `meta.actions`

#### 3. Missing org_id

**Error:**
```json
{
  "ok": false,
  "error": "org_id not found. Set ACP_ORG_ID environment variable...",
  "code": "CONFIGURATION_ERROR"
}
```

**Resolution:**
- This is a system configuration issue
- Contact system administrator to set `ACP_ORG_ID` environment variable

#### 4. Policy Proposal Failed (404)

**Error:**
```json
{
  "ok": false,
  "error": "Failed to propose policy: 404 Client Error: Not Found for url: .../policy-propose",
  "code": "INTERNAL_ERROR"
}
```

**Resolution:**
- The Governance Hub endpoint is not deployed
- Contact system administrator to deploy the `policy-propose` function

#### 5. Invalid Proposal Structure

**Error:**
```json
{
  "ok": false,
  "error": "Invalid proposal structure. Must have type and data fields",
  "code": "VALIDATION_ERROR"
}
```

**Resolution:**
- Ensure `proposal.type` is one of: `"LimitPolicy"`, `"RequireApprovalPolicy"`
- Ensure `proposal.data` contains all required fields for the policy type
- Review policy type requirements above

### Error Response Format

All errors follow this structure:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "request_id": "req_abc123..."
}
```

**Common Error Codes:**
- `SCOPE_DENIED` - Missing required scope
- `VALIDATION_ERROR` - Invalid parameters
- `NOT_FOUND` - Action or resource not found
- `CONFIGURATION_ERROR` - System misconfiguration
- `INTERNAL_ERROR` - Server error

---

## Best Practices

### 1. Always Use Dry Run First

Test proposals with `dry_run: true` before submitting:

```json
{
  "action": "governance.propose_policy",
  "params": { ... },
  "dry_run": true
}
```

### 2. Provide Clear Rationale

Include:
- **Why** the policy is needed
- **What problem** it solves
- **Evidence** supporting the proposal (audit events, metrics, links)

### 3. Use Specific Action Patterns

**Good:**
```json
"action": "domain.leadscoring.questions.upsert_bulk"
```

**Better (if you want to limit all bulk operations):**
```json
"action": "domain.*.upsert_bulk"
```

**Best (if you want to limit all writes):**
```json
"action": "domain.*.*"  // But this might be too broad - be specific
```

### 4. Start with Soft Enforcement

For limits, start with `"enforcement": "soft"` to monitor impact before switching to `"hard"`.

### 5. Include Evidence

Link to:
- Audit events showing the issue
- Documentation or runbooks
- Metrics or analytics

### 6. Test with meta.actions

Always check `meta.actions` to:
- Verify the action exists
- Check required parameters
- Confirm scope requirements

---

## Runbooks

### Runbook 1: Proposing a Rate Limit

**Scenario:** Limit email sending to prevent spam

**Steps:**

1. **Discover capabilities:**
   ```json
   { "action": "meta.actions" }
   ```

2. **Validate proposal with dry run:**
   ```json
   {
     "action": "governance.propose_policy",
     "params": {
       "title": "Limit email sending",
       "summary": "Prevent spam by limiting sends",
       "proposal_kind": "limit",
       "proposal": {
         "type": "LimitPolicy",
         "data": {
           "action": "email.send",
           "scope": "tenant",
           "window_seconds": 3600,
           "max": 100,
           "enforcement": "soft",
           "message": "Email rate limit: 100/hour"
         }
       },
       "rationale": "Prevent accidental spam..."
     },
     "dry_run": true
   }
   ```

3. **Submit proposal:**
   ```json
   {
     "action": "governance.propose_policy",
     "params": { ... },  // Same as above
     "dry_run": false  // or omit dry_run
   }
   ```

4. **Verify submission:**
   - Check response for `proposal_id`
   - Status should be `"proposed"`

5. **Wait for approval:**
   - Proposal will be reviewed by admin
   - Status changes to `"approved"` or `"rejected"`
   - Once approved and published, policy takes effect

### Runbook 2: Requiring Approval for High-Risk Actions

**Scenario:** Require approval for all delete operations

**Steps:**

1. **Identify high-risk actions:**
   - Use `meta.actions` to find delete actions
   - Pattern: `"domain.*.delete"`

2. **Create proposal:**
   ```json
   {
     "action": "governance.propose_policy",
     "params": {
       "title": "Require approval for deletes",
       "summary": "All delete operations require admin approval",
       "proposal_kind": "policy",
       "proposal": {
         "type": "RequireApprovalPolicy",
         "data": {
           "action": "domain.*.delete",
           "scope": "tenant",
           "approver_role": "org_admin",
           "message": "Delete operations require admin approval"
         }
       },
       "rationale": "Delete operations are irreversible and high-risk..."
     }
   }
   ```

3. **Monitor proposal status:**
   - Check proposal status via Governance Hub UI (if available)
   - Or wait for admin notification

### Runbook 3: Troubleshooting Scope Issues

**Scenario:** Getting `SCOPE_DENIED` error

**Steps:**

1. **Check available scopes:**
   - Your API key's scopes are determined by the system
   - Contact admin if `manage.governance` is missing

2. **Verify action requirements:**
   ```json
   { "action": "meta.actions" }
   ```
   - Find `governance.propose_policy` in response
   - Check `scope` field: should be `"manage.governance"`

3. **Request scope:**
   - Contact system administrator
   - Provide rationale for needing governance capabilities

### Runbook 4: Handling Validation Errors

**Scenario:** Proposal rejected due to validation error

**Steps:**

1. **Read error message:**
   - Error will specify which field failed
   - Check constraints (max length, required fields, etc.)

2. **Fix proposal:**
   - Adjust field values to meet constraints
   - Use `dry_run: true` to validate before resubmitting

3. **Common fixes:**
   - **Title too long:** Reduce to ≤120 chars
   - **Summary too long:** Reduce to ≤300 chars
   - **Rationale too long:** Reduce to ≤2000 chars
   - **Invalid action pattern:** Use pattern `^[a-z0-9_.-]+$`
   - **Invalid scope:** Use one of: `"tenant"`, `"api_key"`, `"actor"`, `"org"`

---

## Policy Conditions DSL Reference

When proposals are published, they use the Policy Conditions DSL. Understanding this helps create effective proposals.

### Action Matching

- **Exact:** `"domain.leadscoring.questions.upsert_bulk"`
- **Wildcard:** `"domain.*.delete"` (matches all deletes in domain)
- **Array:** `["shopify.products.create", "shopify.products.update"]`
- **Contains:** `{ "$contains": "delete" }` (matches any action with "delete")

### Time Windows

```json
{
  "timeWindow": {
    "daysOfWeek": [0, 6],  // Sunday, Saturday
    "hours": [9, 17],      // 9 AM to 5 PM
    "timezone": "America/New_York"
  }
}
```

- `daysOfWeek`: 0=Sun, 1=Mon, ..., 6=Sat
- `hours`: `[start, end)` in 24-hour format

### Amount Ceilings

```json
{
  "amountCeiling": {
    "field": "params.amount",
    "max": 1000
  }
}
```

Limits numeric values in `params_summary`.

---

## Security Considerations

### What Agents Can Do

✅ **Can:**
- Propose policies, limits, and runbooks
- View their own proposals (if UI available)
- Use `meta.actions` to discover capabilities

❌ **Cannot:**
- Publish policies directly
- Approve or reject proposals
- Modify existing policies
- Bypass policy enforcement

### Proposal Validation

All proposals are validated for:
- **Secrets:** Rejects API keys, JWTs, private keys
- **Size:** 64KB limit on proposal payload
- **Schema:** Must match policy type requirements
- **Patterns:** Action patterns must be valid

### Best Practices

1. **Never include secrets** in proposals
2. **Use specific action patterns** (not overly broad)
3. **Provide evidence** for proposals
4. **Start with soft enforcement** for limits
5. **Test with dry_run** before submitting

---

## Additional Resources

- **Main Documentation:** See `docs/GOVERNANCE-PACK.md`
- **Repo B Integration:** See `governance-hub/INTEGRATION-GUIDE.md`
- **Policy Conditions DSL:** See `governance-hub/INTEGRATION-GUIDE.md` (Policy Conditions section)

---

## Quick Reference

### Proposal Template

```json
{
  "action": "governance.propose_policy",
  "params": {
    "title": "<120 chars>",
    "summary": "<300 chars>",
    "proposal_kind": "policy|limit|runbook|revocation_suggestion",
    "proposal": {
      "type": "LimitPolicy|RequireApprovalPolicy",
      "data": { /* policy-specific fields */ }
    },
    "rationale": "<2000 chars>",
    "evidence": {
      "audit_event_ids": [],
      "links": []
    }
  },
  "dry_run": true
}
```

### Common Action Patterns

- `"domain.*.delete"` - All delete actions
- `"domain.*.create"` - All create actions
- `"domain.leadscoring.*"` - All leadscoring actions
- `"email.send"` - Exact match
- `"*.upsert_bulk"` - All bulk upsert actions

### Scope Values

- **LimitPolicy scope:** `"tenant"`, `"api_key"`, `"actor"`
- **RequireApprovalPolicy scope:** `"tenant"`, `"org"`

---

**Last Updated:** February 2026  
**Version:** 1.0
