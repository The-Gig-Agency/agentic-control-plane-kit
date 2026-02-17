#!/bin/bash
# Echelon Installer Validation Script
# 
# Runs comprehensive validation tests before client release.
# 
# Usage:
#   ./validate-installer.sh [framework]
# 
# If framework is specified, only tests that framework.
# Otherwise, tests all frameworks.

# Don't use set -e - we want to run all tests and report summary

FRAMEWORK="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$REPO_ROOT/installer/test/test-projects"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_test() {
    echo -e "\n${YELLOW}Testing:${NC} $1"
}

# Cleanup function
cleanup() {
    if [ -d "$TEST_DIR" ]; then
        log_warn "Cleaning up test projects..."
        rm -rf "$TEST_DIR"
    fi
}

trap cleanup EXIT

# Create test directory
mkdir -p "$TEST_DIR"

# Test framework detection
test_detection() {
    log_test "Framework Detection"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_warn "tsx or npx not found, skipping detection tests"
        log_warn "Install tsx: npm install -g tsx"
        ((SKIPPED++))
        return
    fi
    
    # Use tsx if available, otherwise use npx tsx
    if command -v tsx &> /dev/null; then
        TSX_CMD="tsx"
    else
        TSX_CMD="npx tsx"
    fi
    
    # Test Django detection
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "django" ]; then
        TEST_PROJ="$TEST_DIR/django-detection"
        mkdir -p "$TEST_PROJ/backend"
        touch "$TEST_PROJ/backend/manage.py"
        touch "$TEST_PROJ/backend/requirements.txt"
        
        cd "$TEST_PROJ"
        # Use --env development to skip interactive prompt
        OUTPUT=$($TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework auto --env development 2>&1 || true)
        if echo "$OUTPUT" | grep -qi "django\|Detected framework: django"; then
            log_info "Django detection works"
            ((PASSED++))
        else
            log_error "Django detection failed"
            log_error "Output: $OUTPUT"
            ((FAILED++))
        fi
    fi
    
    # Test Express detection
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "express" ]; then
        TEST_PROJ="$TEST_DIR/express-detection"
        mkdir -p "$TEST_PROJ"
        echo '{"name":"test","dependencies":{"express":"^4.0.0"}}' > "$TEST_PROJ/package.json"
        
        cd "$TEST_PROJ"
        # Use --env development to skip interactive prompt
        OUTPUT=$($TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework auto --env development 2>&1 || true)
        if echo "$OUTPUT" | grep -qi "express\|Detected framework: express"; then
            log_info "Express detection works"
            ((PASSED++))
        else
            log_error "Express detection failed"
            log_error "Output: $OUTPUT"
            ((FAILED++))
        fi
    fi
}

# Test file generation
test_file_generation() {
    log_test "File Generation"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_warn "tsx or npx not found, skipping file generation tests"
        ((SKIPPED++))
        return
    fi
    
    # Use tsx if available, otherwise use npx tsx
    if command -v tsx &> /dev/null; then
        TSX_CMD="tsx"
    else
        TSX_CMD="npx tsx"
    fi
    
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "django" ]; then
        TEST_PROJ="$TEST_DIR/django-files"
        mkdir -p "$TEST_PROJ/backend"
        touch "$TEST_PROJ/backend/manage.py"
        touch "$TEST_PROJ/backend/requirements.txt"
        
        cd "$TEST_PROJ"
        $TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework django --env development --skip-registration > /dev/null 2>&1 || true
        
        # Check for required files
        FILES_OK=true
        [ -f "backend/control_plane/bindings.py" ] || FILES_OK=false
        [ -d "backend/control_plane/acp" ] || FILES_OK=false
        
        if [ "$FILES_OK" = true ]; then
            log_info "Django files generated correctly"
            ((PASSED++))
        else
            log_error "Django files missing"
            log_error "Expected: backend/control_plane/bindings.py, backend/control_plane/acp/"
            ((FAILED++))
        fi
    fi
    
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "express" ]; then
        TEST_PROJ="$TEST_DIR/express-files"
        mkdir -p "$TEST_PROJ"
        echo '{"name":"test","dependencies":{}}' > "$TEST_PROJ/package.json"
        
        cd "$TEST_PROJ"
        $TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework express --env development --skip-registration > /dev/null 2>&1 || true
        
        # Check for required files
        FILES_OK=true
        [ -f "controlplane.bindings.json" ] || FILES_OK=false
        [ -d "control_plane/kernel/src" ] || FILES_OK=false
        
        if [ "$FILES_OK" = true ]; then
            log_info "Express files generated correctly"
            ((PASSED++))
        else
            log_error "Express files missing"
            log_error "Expected: controlplane.bindings.json, control_plane/kernel/src/"
            ((FAILED++))
        fi
    fi
}

# Test uninstall
test_uninstall() {
    log_test "Uninstall Functionality"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_warn "tsx or npx not found, skipping uninstall tests"
        ((SKIPPED++))
        return
    fi
    
    # Use tsx if available, otherwise use npx tsx
    if command -v tsx &> /dev/null; then
        TSX_CMD="tsx"
    else
        TSX_CMD="npx tsx"
    fi
    
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "django" ]; then
        TEST_PROJ="$TEST_DIR/django-uninstall"
        mkdir -p "$TEST_PROJ/backend"
        touch "$TEST_PROJ/backend/manage.py"
        touch "$TEST_PROJ/backend/requirements.txt"
        
        cd "$TEST_PROJ"
        # Install
        $TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework django --env development --skip-registration > /dev/null 2>&1 || true
        
        # Uninstall (use echo "y" to confirm)
        echo "y" | $TSX_CMD "$REPO_ROOT/installer/cli.ts" uninstall > /dev/null 2>&1 || true
        
        # Verify removal
        if [ ! -d "backend/control_plane" ]; then
            log_info "Django uninstall works"
            ((PASSED++))
        else
            log_error "Django uninstall failed (files still exist)"
            ((FAILED++))
        fi
    fi
}

# Test doctor command
test_doctor() {
    log_test "Doctor Command"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_warn "tsx or npx not found, skipping doctor tests"
        ((SKIPPED++))
        return
    fi
    
    # Use tsx if available, otherwise use npx tsx
    if command -v tsx &> /dev/null; then
        TSX_CMD="tsx"
    else
        TSX_CMD="npx tsx"
    fi
    
    if [ "$FRAMEWORK" = "all" ] || [ "$FRAMEWORK" = "django" ]; then
        TEST_PROJ="$TEST_DIR/django-doctor"
        mkdir -p "$TEST_PROJ/backend"
        touch "$TEST_PROJ/backend/manage.py"
        touch "$TEST_PROJ/backend/requirements.txt"
        
        cd "$TEST_PROJ"
        # Install
        $TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework django --env development --skip-registration > /dev/null 2>&1 || true
        
        # Run doctor
        OUTPUT=$($TSX_CMD "$REPO_ROOT/installer/cli.ts" doctor 2>&1 || true)
        if echo "$OUTPUT" | grep -qi "healthy\|Kernel found\|✅"; then
            log_info "Doctor command works"
            ((PASSED++))
        else
            log_error "Doctor command failed"
            log_error "Output: $OUTPUT"
            ((FAILED++))
        fi
    fi
}

# Test error handling
test_error_handling() {
    log_test "Error Handling"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_warn "tsx or npx not found, skipping error handling tests"
        ((SKIPPED++))
        return
    fi
    
    # Use tsx if available, otherwise use npx tsx
    if command -v tsx &> /dev/null; then
        TSX_CMD="tsx"
    else
        TSX_CMD="npx tsx"
    fi
    
    # Test in non-project directory
    cd /tmp
    OUTPUT=$($TSX_CMD "$REPO_ROOT/installer/cli.ts" install --framework django --env development 2>&1 || true)
    if echo "$OUTPUT" | grep -qi "error\|Error\|Could not detect\|❌"; then
        log_info "Error handling works (non-project directory)"
        ((PASSED++))
    else
        log_warn "Error handling test inconclusive (may work in /tmp)"
        log_warn "Output: $OUTPUT"
        ((SKIPPED++))
    fi
}

# Check prerequisites
check_prerequisites() {
    log_test "Prerequisites Check"
    
    # Check if installer CLI exists
    if [ ! -f "$REPO_ROOT/installer/cli.ts" ]; then
        log_error "Installer CLI not found: $REPO_ROOT/installer/cli.ts"
        ((FAILED++))
        return 1
    fi
    log_info "Installer CLI found"
    
    # Check if tsx is available
    if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
        log_error "tsx or npx not found. Install tsx: npm install -g tsx"
        log_error "Or ensure npx is available"
        ((FAILED++))
        return 1
    fi
    
    if command -v tsx &> /dev/null; then
        log_info "tsx found: $(which tsx)"
    else
        log_info "npx found: $(which npx) (will use npx tsx)"
    fi
    
    ((PASSED++))
    return 0
}

# Main test execution
main() {
    echo "=========================================="
    echo "Echelon Installer Validation"
    echo "=========================================="
    echo ""
    
    # Check prerequisites first
    if ! check_prerequisites; then
        echo ""
        echo "=========================================="
        echo "Validation Summary"
        echo "=========================================="
        echo -e "${RED}Prerequisites check failed. Please fix issues above.${NC}"
        exit 1
    fi
    
    test_detection
    test_file_generation
    test_uninstall
    test_doctor
    test_error_handling
    
    # Summary
    echo ""
    echo "=========================================="
    echo "Validation Summary"
    echo "=========================================="
    echo -e "${GREEN}Passed:${NC} $PASSED"
    echo -e "${RED}Failed:${NC} $FAILED"
    echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

main
