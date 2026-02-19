# Phase 3 Test Specification

## Overview

These tests verify Phase 3: Graceful Degradation features. **These tests should FAIL before Phase 3 is implemented** and **PASS after implementation**.

## Test Cases

### Test 3.1: ACP_FAIL_MODE Configuration in Generated Code
**Expected Behavior**:
- Generated endpoint code includes `ACP_FAIL_MODE` environment variable check
- Code handles `open`, `closed`, and `read-open` modes
- Fail-open/fail-closed logic is present

**What to Check**:
- `ACP_FAIL_MODE` appears in generated `manage.py`
- Logic to check fail mode exists
- Different behavior based on mode

**Current Status**: ❌ Should FAIL (not implemented yet)

---

### Test 3.2: Read vs Write Action Differentiation
**Expected Behavior**:
- Code differentiates between read actions (e.g., `meta.actions`, `list`) and write actions (e.g., `create`, `update`, `delete`)
- Read actions can be allowed in fail-open mode even if Repo B is unreachable
- Write actions require Repo B in fail-closed or read-open mode

**What to Check**:
- Logic to detect read vs write actions
- Different handling based on action type
- Read-open mode allows reads but requires Repo B for writes

**Current Status**: ❌ Should FAIL (not implemented yet)

---

### Test 3.3: Better Error Messages for Governance Hub Failures
**Expected Behavior**:
- Clear, actionable error messages when Repo B (Governance Hub) is unreachable
- Messages explain what happened and what to do
- Graceful degradation messages when falling back to local mode

**What to Check**:
- Error messages mention "Governance hub unreachable" or similar
- Messages explain fallback behavior
- User-friendly language (not just stack traces)

**Current Status**: ❌ Should FAIL (not implemented yet)

---

### Test 3.4: ACP_FAIL_MODE in .env.example
**Expected Behavior**:
- `.env.example` includes `ACP_FAIL_MODE` configuration
- Default value is `open` (fail-open)
- Options documented: `open`, `closed`, `read-open`

**What to Check**:
- `ACP_FAIL_MODE` in `.env.example`
- Default value shown
- All options documented with comments

**Current Status**: ❌ Should FAIL (not implemented yet)

---

### Test 3.5: Exception Handling for Repo B Failures
**Expected Behavior**:
- All Repo B calls wrapped in try/except blocks
- Exceptions caught and handled gracefully
- Fallback behavior when exceptions occur

**What to Check**:
- Try/except blocks around Repo B calls
- Exception handling doesn't crash the application
- Graceful fallback logic

**Current Status**: ❌ Should FAIL (not implemented yet)

---

### Test 3.6: Fail-Open vs Fail-Closed Behavior Logic
**Expected Behavior**:
- **Fail-open**: If Repo B unreachable, allow actions to proceed (local mode)
- **Fail-closed**: If Repo B unreachable, deny all actions
- **Read-open**: If Repo B unreachable, allow reads but deny writes

**What to Check**:
- Logic to check `ACP_FAIL_MODE` value
- Different behavior for each mode
- Fail-open allows, fail-closed denies, read-open allows reads only

**Current Status**: ❌ Should FAIL (not implemented yet)

---

## Test Execution

### Before Phase 3 Implementation
```bash
cd installer/test
bash test-phase3.sh
# Expected: Most/all tests should FAIL
# Exit code: 0 (failures are expected)
```

### After Phase 3 Implementation
```bash
cd installer/test
bash test-phase3.sh
# Expected: All tests should PASS
# Exit code: 0 (all tests pass)
```

---

## Implementation Checklist

When implementing Phase 3, ensure:

- [ ] `ACP_FAIL_MODE` environment variable support
- [ ] Fail-open mode (allow if Repo B unreachable)
- [ ] Fail-closed mode (deny if Repo B unreachable)
- [ ] Read-open mode (allow reads, require Repo B for writes)
- [ ] Read vs write action detection
- [ ] Better error messages for governance hub failures
- [ ] Exception handling around Repo B calls
- [ ] Graceful fallback behavior
- [ ] `ACP_FAIL_MODE` in `.env.example` with documentation

---

## Success Criteria

✅ All 6 tests pass after Phase 3 implementation
✅ Generated code includes fail mode logic
✅ Error messages are user-friendly
✅ Graceful degradation works correctly
✅ Read/write differentiation works
