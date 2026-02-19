#!/bin/bash
# Phase 3 Tests - Graceful Degradation
# 
# These tests should FAIL before Phase 3 is implemented
# They should PASS after Phase 3 is implemented
#
# Tests:
# - Fail-open/fail-closed configuration
# - Read vs write action differentiation
# - Better error messages for governance hub failures

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$REPO_ROOT/installer/test/phase3-test-projects"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

log_info() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

log_test() {
    echo -e "\n${BLUE}Testing:${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Cleanup
cleanup() {
    if [ -d "$TEST_DIR" ]; then
        log_warn "Cleaning up test projects..."
        rm -rf "$TEST_DIR"
    fi
}
trap cleanup EXIT

# Check if tsx is available
if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
    log_error "tsx or npx not found. Please install tsx: npm install -g tsx"
    exit 1
fi

# Use tsx if available, otherwise npx
RUNNER="tsx"
if ! command -v tsx &> /dev/null; then
    RUNNER="npx tsx"
fi

INSTALLER_CLI="$REPO_ROOT/installer/cli.ts"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 3: Graceful Degradation Tests${NC}"
echo -e "${BLUE}  (These should FAIL before implementation, PASS after)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

mkdir -p "$TEST_DIR"

# ============================================================================
# PHASE 3 TESTS
# ============================================================================

# Test 3.1: ACP_FAIL_MODE Configuration in Generated Code
log_test "3.1 ACP_FAIL_MODE Configuration in Generated Endpoint"

TEST_PROJ="$TEST_DIR/failmode-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
EOF

cd "$TEST_PROJ"
$RUNNER "$INSTALLER_CLI" install --framework django --env development --no-migrations > /dev/null 2>&1 || true

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check for ACP_FAIL_MODE in generated code
    if grep -q "ACP_FAIL_MODE" "$TEST_PROJ/backend/control_plane/views/manage.py"; then
        log_info "ACP_FAIL_MODE configuration found in generated code"
    else
        log_error "ACP_FAIL_MODE configuration NOT found in generated code"
    fi
    
    # Check for fail-open/fail-closed logic
    if grep -q "fail.*open\|fail.*closed" "$TEST_PROJ/backend/control_plane/views/manage.py" -i; then
        log_info "Fail-open/fail-closed logic found"
    else
        log_error "Fail-open/fail-closed logic NOT found"
    fi
else
    log_error "Endpoint file not generated"
fi
cd "$REPO_ROOT"

# Test 3.2: Read vs Write Action Differentiation
log_test "3.2 Read vs Write Action Differentiation"

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check for read/write differentiation logic
    if grep -q "read.*action\|write.*action\|action.*read\|action.*write" "$TEST_PROJ/backend/control_plane/views/manage.py" -i; then
        log_info "Read/write action differentiation found"
    else
        log_error "Read/write action differentiation NOT found"
    fi
    
    # Check for read-open mode (reads allowed, writes require Repo B)
    if grep -q "read.*open\|read-open" "$TEST_PROJ/backend/control_plane/views/manage.py" -i; then
        log_info "Read-open mode logic found"
    else
        log_error "Read-open mode logic NOT found"
    fi
fi

# Test 3.3: Better Error Messages for Governance Hub Failures
log_test "3.3 Better Error Messages for Governance Hub Failures"

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check for specific error messages
    if grep -q "Governance hub unreachable\|Repo B unreachable\|governance.*unavailable" "$TEST_PROJ/backend/control_plane/views/manage.py" -i; then
        log_info "Better error messages for governance hub failures found"
    else
        log_error "Better error messages for governance hub failures NOT found"
    fi
    
    # Check for graceful degradation messages
    if grep -q "local.*mode\|degraded.*mode\|fallback" "$TEST_PROJ/backend/control_plane/views/manage.py" -i; then
        log_info "Graceful degradation messages found"
    else
        log_error "Graceful degradation messages NOT found"
    fi
fi

# Test 3.4: ACP_FAIL_MODE in .env.example
log_test "3.4 ACP_FAIL_MODE in .env.example"

if [ -f "$TEST_PROJ/backend/.env.example" ]; then
    if grep -q "ACP_FAIL_MODE" "$TEST_PROJ/backend/.env.example"; then
        log_info "ACP_FAIL_MODE found in .env.example"
        
        # Check for default value
        if grep -q "ACP_FAIL_MODE=open\|ACP_FAIL_MODE.*open" "$TEST_PROJ/backend/.env.example"; then
            log_info "Default ACP_FAIL_MODE value (open) found"
        else
            log_error "Default ACP_FAIL_MODE value NOT found"
        fi
        
        # Check for read-open option
        if grep -q "read-open\|read_open" "$TEST_PROJ/backend/.env.example" -i; then
            log_info "Read-open option documented"
        else
            log_error "Read-open option NOT documented"
        fi
    else
        log_error "ACP_FAIL_MODE NOT found in .env.example"
    fi
else
    log_error ".env.example file not generated"
fi

# Test 3.5: Exception Handling for Repo B Failures
log_test "3.5 Exception Handling for Repo B Failures"

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check for try/except around Repo B calls
    if grep -A 10 "control_plane\|governance.*hub\|repo.*b" "$TEST_PROJ/backend/control_plane/views/manage.py" -i | grep -q "try\|except"; then
        log_info "Exception handling for Repo B calls found"
    else
        log_error "Exception handling for Repo B calls NOT found"
    fi
    
    # Check for graceful fallback on exception
    if grep -A 15 "except.*Exception\|except.*Error" "$TEST_PROJ/backend/control_plane/views/manage.py" | grep -q "continue\|allow\|fallback"; then
        log_info "Graceful fallback on exception found"
    else
        log_error "Graceful fallback on exception NOT found"
    fi
fi

# Test 3.6: Fail-Open vs Fail-Closed Behavior
log_test "3.6 Fail-Open vs Fail-Closed Behavior Logic"

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check for fail-open logic (allow if Repo B unreachable)
    if grep -q "fail.*open\|fail_mode.*open" "$TEST_PROJ/backend/control_plane/views/manage.py" -i && \
       grep -A 5 "fail.*open\|fail_mode.*open" "$TEST_PROJ/backend/control_plane/views/manage.py" -i | grep -q "allow\|continue"; then
        log_info "Fail-open behavior logic found"
    else
        log_error "Fail-open behavior logic NOT found"
    fi
    
    # Check for fail-closed logic (deny if Repo B unreachable)
    if grep -q "fail.*closed\|fail_mode.*closed" "$TEST_PROJ/backend/control_plane/views/manage.py" -i && \
       grep -A 5 "fail.*closed\|fail_mode.*closed" "$TEST_PROJ/backend/control_plane/views/manage.py" -i | grep -q "deny\|reject\|return.*error"; then
        log_info "Fail-closed behavior logic found"
    else
        log_error "Fail-closed behavior logic NOT found"
    fi
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

TOTAL=$((PASSED + FAILED))
echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
    echo -e "\n${YELLOW}⚠️  Expected: These tests should FAIL before Phase 3 implementation${NC}"
    echo -e "${YELLOW}   After implementing Phase 3, these tests should PASS${NC}\n"
else
    echo -e "Failed: $FAILED"
fi

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}✅ Tests are failing as expected (Phase 3 not yet implemented)${NC}\n"
    exit 0  # Exit 0 because failures are expected
else
    echo -e "\n${GREEN}✅ All tests passed! Phase 3 is implemented.${NC}\n"
    exit 0
fi
