# Rule Pack Updates - Addressing Gotchas

**Date:** February 24, 2026  
**Status:** ✅ Complete

---

## Changes Made

### 1. Added Warnings About Regex Limitations

**Added section:** "⚠️ Important Limitations"
- Explains regex-on-SQL is fragile
- Lists what regex will miss (comments, multiline, vendor quirks, false positives)
- Recommends better approaches (connector-enforced, normalization, executor-level)

### 2. Fixed Policy 1: Destructive Operations

**Updates:**
- Expanded scope: Added `GRANT`, `REVOKE`, `CREATE EXTENSION`, `DROP ROLE`, `CREATE ROLE`
- Added regex anchors (`^`) to reduce false matches
- Added note about comment stripping and normalization
- Removed incorrect SQL injection link (this is about oops-proofing, not injection)

### 3. Replaced Policy 2: Safe UPDATE/DELETE

**Old approach:** Aspirational fields (`requires_pk_filter`, `max_rows_affected`) that aren't standard JSON-logic

**New approach:** Two realistic options:
- **Approach 1 (Recommended):** Disallow raw SQL writes entirely, force typed tools
- **Approach 2 (Acceptable):** Require `write_intent` token for UPDATE/DELETE/INSERT

**Rationale:** Row count and PK validation cannot be reliably enforced via regex. Must be done in executor.

### 4. Reorganized Policies

**New structure:**
1. Policy 1: Deny Destructive DB Operations
2. Policy 2: Default Deny Writes (UPDATE/DELETE/INSERT)
3. Policy 3: Limit Required on SELECT
4. Policy 4: Column Allowlist (No SELECT *)
5. Policy 5: RLS Must Remain On (Service-Role Never Exposed)
6. Policy 6: Enforce Project Scoping
7. Policy 7: Rate Limits on Tool Calls
8. Policy 8: Audit Logging on Every Tool Call

**Removed:** Old "Read-Only by Default" (merged into Policy 2)

### 5. Fixed RLS/Service-Role Policy

**Updates:**
- Made explicit: Service-role never leaves Repo C
- Clarified: Agents only see tenant-scoped API keys
- Added architecture note explaining Repo C's role
- Changed approver_role to "system" (enforced by architecture)

### 6. Added Implementation Recommendations

**New section:** "Implementation Recommendations"
- Explains connector-level enforcement (best)
- SQL normalization approach (better)
- Hybrid approach (acceptable)
- Policy field limitations
- Options A vs B for PK/row count validation

---

## Key Takeaways

1. **Regex is fragile** - Use connector-enforced allowlists where possible
2. **PK/row count validation** - Must be done in executor, not policy conditions
3. **Service-role isolation** - Never leaves Repo C; agents only see tenant keys
4. **Typed tools preferred** - `db.update_by_pk` better than raw SQL UPDATE
5. **Normalization needed** - Strip comments, collapse whitespace before regex

---

## Files Changed

- ✅ `gateway/MCP-DEFAULT-RULE-PACK.md` - Comprehensive updates addressing all gotchas

---

## CLI Commands to Push

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

git add gateway/MCP-DEFAULT-RULE-PACK.md RULE-PACK-UPDATES.md

git commit -m "Fix rule pack: address regex limitations, make policies realistic

- Added warnings about regex-on-SQL fragility
- Expanded Policy 1 to include GRANT/REVOKE/CREATE EXTENSION
- Replaced Policy 2 with realistic approaches (typed tools or write tokens)
- Reorganized policies (8 total, clearer structure)
- Fixed RLS/service-role policy with explicit architecture notes
- Added implementation recommendations section
- Removed aspirational fields that aren't standard JSON-logic"

git push origin main
```
