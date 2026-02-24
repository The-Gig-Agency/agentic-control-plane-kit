# MCP Default Rule Pack - Recommended Baseline Policies

**Purpose:** Recommended default governance rules for MCP operations to prevent destructive actions, enforce safety, and maintain auditability.

**Status:** Proposal-ready policies for agents to adopt  
**Last Updated:** February 24, 2026

---

## ⚠️ Important Limitations

### Regex-on-SQL is Fragile

**Warning:** SQL regex matching is inherently fragile and will miss:
- Comments (`/* DROP TABLE */`)
- Multiline/weird spacing (`DROP /*x*/ TABLE`)
- Vendor syntax quirks
- False positives on strings/logging

**Better Approaches:**
1. **Connector-enforced allowlists** (preferred): Use read-only database roles, typed tools
2. **Normalization + tokenization**: Strip comments, collapse whitespace, tokenize before regex
3. **Executor-level enforcement**: Intercept at a safer layer (e.g., Repo C)

**Recommendation:** Use these policies as a **baseline**, but prefer connector-level enforcement where possible.

---

## Overview

This document provides a **recommended default rule pack** that agents can propose to govern their MCP usage. These policies enforce:

- ✅ **Default deny writes** - Prevent accidental writes unless approved
- ✅ **Destructive operation protection** - Block DROP/TRUNCATE/ALTER unless approved
- ✅ **Query safety** - Enforce LIMIT + column selection
- ✅ **Project scoping** - Single project unless explicitly broadened
- ✅ **RLS enforcement** - Service-role never leaves Repo C; agents only see tenant-scoped API keys
- ✅ **Rate limiting** - Prevent abuse
- ✅ **Audit logging** - Track all operations

---

## Implementation Recommendations

### For Production Use

**These policies use regex matching which has limitations.** For production, consider:

1. **Connector-Level Enforcement (Best)**
   - Use read-only database roles
   - Create typed tools (`db.update_by_pk`, `db.delete_by_pk`) instead of raw SQL
   - Enforce constraints at the executor level (Repo C)

2. **SQL Normalization (Better)**
   - Strip comments (`/* ... */`, `-- ...`)
   - Collapse whitespace
   - Tokenize before regex matching
   - Handle vendor-specific syntax quirks

3. **Hybrid Approach (Acceptable)**
   - Use regex for initial filtering
   - Enforce detailed constraints in the executor
   - Require explicit write tokens for UPDATE/DELETE/INSERT

### Policy Field Limitations

**Note:** Some policy fields referenced in earlier versions (`requires_pk_filter`, `max_rows_affected`) are not standard JSON-logic primitives unless implemented in Repo B's evaluator.

**Options:**
- **Option A:** Policy engine computes derived flags (PK presence, estimated row count) and exposes them to conditions
- **Option B:** Don't promise row count/PK guarantees in policy; enforce inside DB connector/executor (Repo C)

**Recommendation:** Use Option B - enforce detailed constraints in the executor, not in policy conditions.

---

## Policy 1: Deny Destructive Database Operations

**Type:** `RequireApprovalPolicy`

**Purpose:** Block DROP, TRUNCATE, ALTER, and other destructive operations unless explicitly approved.

**⚠️ Limitations:** This uses regex matching which is fragile. Prefer connector-enforced allowlists (read-only roles) where possible.

```json
{
  "title": "Deny Destructive DB Operations",
  "summary": "Block DROP/TRUNCATE/ALTER/GRANT/REVOKE/CREATE EXTENSION unless explicitly approved",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.sql.execute",
      "scope": "tenant",
      "conditions": {
        "sql": {
          "$regex": "(?i)^\\s*(DROP|TRUNCATE|ALTER|CREATE\\s+EXTENSION|GRANT|REVOKE|DROP\\s+ROLE|CREATE\\s+ROLE)\\s+"
        }
      },
      "approver_role": "org_admin",
      "message": "Destructive database operations (DROP/TRUNCATE/ALTER/GRANT/REVOKE/CREATE EXTENSION) require admin approval. Note: Regex matching is fragile; prefer connector-enforced read-only roles."
    }
  },
  "rationale": "Prevent accidental data loss and privilege escalation from destructive SQL operations. These operations can cause irreversible damage or security issues.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

**Note:** This regex uses anchors (`^`) to reduce false matches, but still has limitations. For production, implement:
1. SQL normalization (strip comments, collapse whitespace)
2. Tokenization before regex matching
3. Or better: connector-enforced read-only database roles

---

## Policy 2: Default Deny Writes (UPDATE/DELETE/INSERT)

**Type:** `RequireApprovalPolicy`

**Purpose:** Deny all write operations (UPDATE/DELETE/INSERT) unless explicitly approved.

**⚠️ Important:** Row count and PK validation cannot be reliably enforced via regex. Two approaches:

### Approach 1: Disallow Raw SQL Writes (Recommended)

**Best practice:** Disallow raw `UPDATE/DELETE/INSERT` SQL entirely. Force writes through typed tools:
- `db.update_by_pk(table, pk, patch)`
- `db.delete_by_pk(table, pk)`
- `db.insert(table, data)`

Then policy enforcement is trivial and reliable.

### Approach 2: Require Write Token (Acceptable)

If you must allow SQL writes, require explicit write intent:

```json
{
  "title": "Default Deny Writes",
  "summary": "Deny UPDATE/DELETE/INSERT unless write_intent token provided",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.sql.execute",
      "scope": "tenant",
      "conditions": {
        "sql": {
          "$regex": "(?i)^\\s*(UPDATE|DELETE|INSERT)\\s+"
        },
        "write_intent": {
          "$required": true
        }
      },
      "approver_role": "org_admin",
      "message": "Write operations (UPDATE/DELETE/INSERT) require explicit write_intent token and admin approval. Prefer typed tools (db.update_by_pk, db.delete_by_pk) over raw SQL."
    }
  },
  "rationale": "Prevent accidental writes. Raw SQL writes are dangerous; prefer typed tools that enforce PK constraints and row limits at the executor level.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

**Note:** This policy cannot reliably validate PK presence or row counts via regex. For production, enforce these constraints in the database connector/executor (Repo C).

---

## Policy 3: Limit Required on SELECT

**Type:** `RequireApprovalPolicy`

**Purpose:** Require LIMIT clause on all SELECT queries to prevent accidental large result sets.

```json
{
  "title": "Limit Required on SELECT",
  "summary": "Require LIMIT <= 100 on all SELECT queries unless approved",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.sql.execute",
      "scope": "tenant",
      "conditions": {
        "sql": {
          "$regex": "(?i)^\\s*SELECT\\s+.*(?!LIMIT\\s+\\d+)"
        },
        "max_limit": 100
      },
      "approver_role": "org_admin",
      "message": "SELECT queries must include LIMIT <= 100 unless approved. Prevents accidental large result sets."
    }
  },
  "rationale": "Prevent accidental large result sets that can cause performance issues or memory exhaustion. All SELECT queries should have explicit LIMIT clauses.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

---

## Policy 4: Column Allowlist (No SELECT *)

**Type:** `RequireApprovalPolicy`

**Purpose:** Deny `SELECT *` queries unless explicitly approved. Require explicit column selection.

```json
{
  "title": "Column Allowlist (No SELECT *)",
  "summary": "Deny SELECT * unless approved; require explicit columns",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.sql.execute",
      "scope": "tenant",
      "conditions": {
        "sql": {
          "$regex": "(?i)SELECT\\s+\\*"
        }
      },
      "approver_role": "org_admin",
      "message": "SELECT * queries are not allowed unless approved. Explicit column selection improves performance and security."
    }
  },
  "rationale": "Prevent unnecessary data transfer and improve query performance. Explicit columns also improve security by limiting exposed data.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

---

## Policy 6: Enforce Project Scoping

**Type:** `RequireApprovalPolicy`

**Purpose:** Enforce single project scope unless explicitly broadened.

```json
{
  "title": "Enforce Project Scoping",
  "summary": "Single project scope unless explicitly broadened",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.*",
      "scope": "tenant",
      "conditions": {
        "project_id": {
          "$required": true
        },
        "max_projects": 1
      },
      "approver_role": "org_admin",
      "message": "Operations must be scoped to a single project unless explicitly broadened"
    }
  },
  "rationale": "Prevent accidental cross-project operations. Enforce explicit project scoping for all operations.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

---

## Policy 5: RLS Must Remain On (Service-Role Never Exposed)

**Type:** `RequireApprovalPolicy`

**Purpose:** Never allow operations that disable Row Level Security (RLS). Service-role credentials never leave Repo C; agents only see tenant-scoped API keys.

```json
{
  "title": "RLS Must Remain On (Service-Role Never Exposed)",
  "summary": "Never disable RLS; service-role never leaves Repo C; agents only see tenant-scoped API keys",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.*",
      "scope": "tenant",
      "conditions": {
        "sql": {
          "$regex": "(?i)(ALTER\\s+TABLE.*DISABLE\\s+ROW\\s+LEVEL\\s+SECURITY|service_role|service-role)"
        },
        "credential_type": {
          "$not": "service_role"
        }
      },
      "approver_role": "system",
      "message": "RLS must remain enabled. Service-role credentials never leave Repo C (Key Vault Executor). Agents only ever see tenant-scoped API keys."
    }
  },
  "rationale": "Row Level Security (RLS) is critical for data isolation. Service-role credentials are 'nuclear waste' and must never be exposed to agents. They remain in Repo C (Key Vault Executor) and are only used for internal execution. Agents only ever receive tenant-scoped API keys.",
  "evidence": {
    "audit_event_ids": [],
    "links": ["https://supabase.com/docs/guides/auth/row-level-security"]
  }
}
```

**Architecture Note:** 
- **Repo C (Key Vault Executor)** stores and uses service-role credentials internally
- **Agents** only receive tenant-scoped API keys from Repo B
- **RLS** is enforced at the database level and must never be disabled

---

## Policy 7: Rate Limits on Tool Calls

**Type:** `LimitPolicy`

**Purpose:** Enforce rate limits on all MCP tool calls to prevent abuse.

```json
{
  "title": "Rate Limits on Tool Calls",
  "summary": "Enforce rate limits on all MCP tool calls",
  "proposal_kind": "limit",
  "proposal": {
    "type": "LimitPolicy",
    "data": {
      "action": "mcp.*.*",
      "scope": "tenant",
      "window_seconds": 3600,
      "max": 1000,
      "enforcement": "hard",
      "message": "Maximum 1000 tool calls per hour per tenant"
    }
  },
  "rationale": "Prevent abuse and ensure fair resource usage. Rate limits protect the system from excessive load.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

---

## Policy 8: Audit Logging on Every Tool Call

**Type:** `RequireApprovalPolicy` (enforced by system)

**Purpose:** Ensure all tool calls are audited. This is typically enforced by the Gateway itself, but can be documented as a policy.

```json
{
  "title": "Audit Logging on Every Tool Call",
  "summary": "All tool calls must be audited",
  "proposal_kind": "policy",
  "proposal": {
    "type": "RequireApprovalPolicy",
    "data": {
      "action": "mcp.*.*",
      "scope": "tenant",
      "conditions": {
        "audit_required": true
      },
      "approver_role": "system",
      "message": "All tool calls must be audited. This is enforced by the Gateway."
    }
  },
  "rationale": "Comprehensive audit logging is required for compliance, security, and debugging. All operations must be logged.",
  "evidence": {
    "audit_event_ids": [],
    "links": []
  }
}
```

---

## How to Propose These Policies

### Step 1: Get Your API Key

After signing up, you'll receive an API key (e.g., `mcp_xxxxx`).

### Step 2: Discover Governance Endpoints

```bash
curl -X GET "https://gateway.buyechelon.com/meta.discover" | jq '.result.gateway.governance_endpoints'
```

**Expected Response:**
```json
{
  "propose_policy": "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/policy-propose"
}
```

### Step 3: Propose a Policy

```bash
curl -X POST "https://bomgupxaxyypkbwnlzxb.supabase.co/functions/v1/policy-propose" \
  -H "X-API-Key: mcp_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deny Destructive DB Operations",
    "summary": "Block DROP/TRUNCATE/ALTER unless explicitly approved",
    "proposal_kind": "policy",
    "proposal": {
      "type": "RequireApprovalPolicy",
      "data": {
        "action": "mcp.*.sql.execute",
        "scope": "tenant",
        "conditions": {
          "sql": {
            "$regex": "(?i)(DROP|TRUNCATE|ALTER)\\s+(TABLE|DATABASE|SCHEMA)"
          }
        },
        "approver_role": "org_admin",
        "message": "Destructive database operations require admin approval"
      }
    },
    "rationale": "Prevent accidental data loss from destructive SQL operations",
    "evidence": {
      "audit_event_ids": [],
      "links": []
    }
  }'
```

### Step 4: Wait for Approval

Policies remain in `status: proposed` until an admin approves them. Once approved, they become active and are enforced by the Gateway.

---

## Policy Priority Order

When multiple policies apply, they are evaluated in this order:

1. **RLS enforcement** (highest priority - security) - Service-role never exposed
2. **Default deny writes** (safety) - Block UPDATE/DELETE/INSERT unless approved
3. **Destructive operations** (data protection) - Block DROP/TRUNCATE/ALTER
4. **Limit required on SELECT** (performance) - Prevent large result sets
5. **Column allowlist** (security) - No SELECT *
6. **Project scoping** (isolation) - Single project unless broadened
7. **Rate limits** (resource protection) - Prevent abuse
8. **Audit logging** (compliance - always enforced)

---

## Customization

These are **recommended defaults**. You can:

- ✅ **Modify conditions** - Adjust regex patterns, limits, scopes
- ✅ **Add policies** - Create additional rules for your specific use case
- ✅ **Remove policies** - Don't propose policies you don't need
- ✅ **Change approver roles** - Use different roles for approval

---

## Next Steps

1. **Review policies** - Decide which policies you want to adopt
2. **Propose policies** - Use the `propose_policy` endpoint for each policy
3. **Wait for approval** - Policies require admin approval before activation
4. **Monitor compliance** - Check audit logs to ensure policies are working

---

## References

- **Policy Proposal API:** `POST /functions/v1/policy-propose`
- **Discovery Endpoint:** `GET /meta.discover`
- **Governance Hub Docs:** https://github.com/The-Gig-Agency/echelon-control
