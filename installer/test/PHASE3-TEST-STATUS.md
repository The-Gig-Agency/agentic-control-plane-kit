# Phase 3 Test Status

## Test-Driven Development (TDD) Approach

✅ **Tests written FIRST** (before implementation)
❌ **Tests should FAIL now** (Phase 3 not implemented)
✅ **Tests should PASS after** (Phase 3 implemented)

---

## Current Test Status (Before Implementation)

### Test 3.1: ACP_FAIL_MODE Configuration
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: `ACP_FAIL_MODE` in generated code
- Current: Not implemented yet

### Test 3.2: Read vs Write Action Differentiation
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: Read/write action detection logic
- Current: Not implemented yet

### Test 3.3: Better Error Messages
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: "Governance hub unreachable" messages
- Current: Not implemented yet

### Test 3.4: ACP_FAIL_MODE in .env.example
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: `ACP_FAIL_MODE` in `.env.example`
- Current: Not implemented yet

### Test 3.5: Exception Handling
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: Try/except around Repo B calls
- Current: Not implemented yet

### Test 3.6: Fail-Open vs Fail-Closed Logic
**Status**: ❌ **EXPECTED TO FAIL**
- Looking for: Fail mode behavior logic
- Current: Not implemented yet

---

## What Needs to Be Implemented

### 1. ACP_FAIL_MODE Environment Variable
```python
# In generated endpoint
fail_mode = os.environ.get('ACP_FAIL_MODE', 'open')  # Default: open
# Options: 'open', 'closed', 'read-open'
```

### 2. Read vs Write Action Detection
```python
# Helper function to detect action type
def is_read_action(action: str) -> bool:
    read_actions = ['meta.actions', 'meta.version', 'list', 'get', 'read']
    return any(action.startswith(prefix) for prefix in read_actions)
```

### 3. Fail Mode Behavior
```python
# Fail-open: Allow if Repo B unreachable
if fail_mode == 'open':
    # Continue with local-only mode
    logger.warning("Governance hub unreachable, allowing in local mode")
    
# Fail-closed: Deny if Repo B unreachable
elif fail_mode == 'closed':
    return {"ok": False, "error": "Governance hub unreachable", "code": "GOVERNANCE_UNAVAILABLE"}

# Read-open: Allow reads, require Repo B for writes
elif fail_mode == 'read-open':
    if is_read_action(action):
        # Allow read actions
        logger.warning("Governance hub unreachable, allowing read action")
    else:
        # Deny write actions
        return {"ok": False, "error": "Governance hub required for write actions", "code": "GOVERNANCE_UNAVAILABLE"}
```

### 4. Exception Handling
```python
try:
    auth_result = await control_plane.authorize(...)
except Exception as e:
    logger.error(f"Governance hub error: {e}")
    # Handle based on fail_mode
    if fail_mode == 'open':
        # Continue
    elif fail_mode == 'closed':
        return error_response
    # etc.
```

### 5. Better Error Messages
```python
error_messages = {
    'governance_unreachable': "Governance hub (Repo B) is unreachable. Check ACP_BASE_URL and network connectivity.",
    'governance_required': "This action requires governance hub (Repo B) to be available.",
    'local_mode': "Operating in local-only mode (governance hub unreachable). Some features may be limited.",
}
```

### 6. .env.example Update
```bash
# Failure mode (default: 'open')
# Options: 'open' (allow if Repo B unreachable), 'closed' (deny if Repo B unreachable), 'read-open' (allow reads, require Repo B for writes)
ACP_FAIL_MODE=open
```

---

## Implementation Plan

1. **Update endpoint generator** (`generate-endpoint.ts`)
   - Add `ACP_FAIL_MODE` check
   - Add read/write action detection
   - Add fail mode behavior logic
   - Add exception handling
   - Add better error messages

2. **Update .env.example generator** (`django-installer.ts`)
   - Add `ACP_FAIL_MODE` with documentation

3. **Test**
   - Run `test-phase3.sh`
   - All tests should now PASS

---

## Verification

After implementation, run:
```bash
cd installer/test
bash test-phase3.sh
```

**Expected Result**: All 6 tests PASS ✅
