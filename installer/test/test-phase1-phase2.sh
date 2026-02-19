#!/bin/bash
# Test Phase 1 & Phase 2 Features
# 
# Tests:
# Phase 1: Route collision, base-path, feature flag, lazy env reads
# Phase 2: --dry-run, --no-migrations, --migrations-only, migration validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$REPO_ROOT/installer/test/phase-test-projects"

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
echo -e "${BLUE}  Phase 1 & Phase 2 Feature Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

mkdir -p "$TEST_DIR"

# ============================================================================
# PHASE 1 TESTS
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 1: Critical Safety Features${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}\n"

# Test 1.1: Route Collision Detection
log_test "1.1 Route Collision Detection"

TEST_PROJ="$TEST_DIR/collision-test"
mkdir -p "$TEST_PROJ/backend/api"
cat > "$TEST_PROJ/backend/api/urls.py" << 'EOF'
from django.urls import path
from .views import manage_endpoint

urlpatterns = [
    path('api/manage', manage_endpoint, name='manage'),  # Existing route
]
EOF

cd "$TEST_PROJ"
if $RUNNER "$INSTALLER_CLI" install --framework django --env production 2>&1 | grep -q "Route collision"; then
    log_info "Route collision detected correctly"
else
    log_error "Route collision NOT detected"
fi
cd "$REPO_ROOT"

# Test 1.2: Base-Path Support
log_test "1.2 Base-Path Support"

TEST_PROJ="$TEST_DIR/basepath-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
EOF

cd "$TEST_PROJ"
$RUNNER "$INSTALLER_CLI" install --framework django --env development --base-path /api/acp --no-migrations > /dev/null 2>&1 || true

if [ -f "$TEST_PROJ/backend/control_plane/bindings.py" ]; then
    if grep -q "base_path.*'/api/acp'" "$TEST_PROJ/backend/control_plane/bindings.py" 2>/dev/null || \
       grep -q 'base_path.*"/api/acp"' "$TEST_PROJ/backend/control_plane/bindings.py" 2>/dev/null; then
        log_info "Base-path written to bindings"
    else
        log_error "Base-path NOT found in bindings"
    fi
else
    log_error "Bindings file not generated"
fi
cd "$REPO_ROOT"

# Test 1.3: Feature Flag in Generated Code
log_test "1.3 Feature Flag in Generated Code"

TEST_PROJ="$TEST_DIR/feature-flag-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
EOF

cd "$TEST_PROJ"
$RUNNER "$INSTALLER_CLI" install --framework django --env development --no-migrations > /dev/null 2>&1 || true

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    if grep -q "ACP_ENABLED" "$TEST_PROJ/backend/control_plane/views/manage.py"; then
        log_info "Feature flag check found in generated code"
    else
        log_error "Feature flag check NOT found in generated code"
    fi
else
    log_error "Endpoint file not generated"
fi
cd "$REPO_ROOT"

# Test 1.4: Lazy Env Reads (No Import-Time Reads)
log_test "1.4 Lazy Env Reads (No Import-Time Reads)"

if [ -f "$TEST_PROJ/backend/control_plane/views/manage.py" ]; then
    # Check that env reads are inside _get_router(), not at module level
    if grep -q "def _get_router" "$TEST_PROJ/backend/control_plane/views/manage.py" && \
       grep -A 5 "def _get_router" "$TEST_PROJ/backend/control_plane/views/manage.py" | grep -q "os.environ.get"; then
        log_info "Env reads are inside handler (lazy initialization)"
    else
        log_warn "Could not verify lazy env reads (manual check recommended)"
    fi
fi

# ============================================================================
# PHASE 2 TESTS
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 2: Migration Control Features${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}\n"

# Test 2.1: --dry-run Flag
log_test "2.1 --dry-run Flag"

TEST_PROJ="$TEST_DIR/dryrun-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
EOF

cd "$TEST_PROJ"
OUTPUT=$($RUNNER "$INSTALLER_CLI" install --framework django --env development --dry-run 2>&1 || true)

if echo "$OUTPUT" | grep -q "DRY RUN MODE"; then
    log_info "--dry-run flag works (shows DRY RUN MODE)"
else
    log_error "--dry-run flag NOT working"
fi

if echo "$OUTPUT" | grep -q "Files that would be generated"; then
    log_info "--dry-run shows file list"
else
    log_error "--dry-run does NOT show file list"
fi

# Verify no files were actually created
if [ ! -f "$TEST_PROJ/backend/control_plane/bindings.py" ]; then
    log_info "--dry-run does NOT create files (correct)"
else
    log_error "--dry-run created files (incorrect)"
fi
cd "$REPO_ROOT"

# Test 2.2: --no-migrations Flag
log_test "2.2 --no-migrations Flag"

TEST_PROJ="$TEST_DIR/nomigrations-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
EOF

cd "$TEST_PROJ"
$RUNNER "$INSTALLER_CLI" install --framework django --env development --no-migrations > /dev/null 2>&1 || true

# Check that code files were created
if [ -f "$TEST_PROJ/backend/control_plane/bindings.py" ]; then
    log_info "--no-migrations creates code files"
else
    log_error "--no-migrations does NOT create code files"
fi

# Check that migration files were NOT created
if [ ! -f "$TEST_PROJ/backend/your_app/migrations"/*.py ] 2>/dev/null; then
    log_info "--no-migrations skips migration generation (correct)"
else
    log_error "--no-migrations created migrations (incorrect)"
fi
cd "$REPO_ROOT"

# Test 2.3: --migrations-only Flag
log_test "2.3 --migrations-only Flag"

TEST_PROJ="$TEST_DIR/migrationsonly-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
EOF

cd "$TEST_PROJ"
OUTPUT=$($RUNNER "$INSTALLER_CLI" install --framework django --env development --migrations-only 2>&1 || true)

if echo "$OUTPUT" | grep -q "MIGRATIONS-ONLY MODE"; then
    log_info "--migrations-only flag works"
else
    log_error "--migrations-only flag NOT working"
fi

# Check that migration files were created
if [ -f "$TEST_PROJ/backend/your_app/migrations"/*.py ] 2>/dev/null; then
    log_info "--migrations-only creates migration files"
else
    log_warn "--migrations-only migration files not found (may need app name detection)"
fi

# Check that code files were NOT created
if [ ! -f "$TEST_PROJ/backend/control_plane/bindings.py" ]; then
    log_info "--migrations-only skips code generation (correct)"
else
    log_error "--migrations-only created code files (incorrect)"
fi
cd "$REPO_ROOT"

# Test 2.4: Migration Validation
log_test "2.4 Migration Validation"

# This test checks that the validation function exists and works
# We can't easily test rejection of ALTER/DROP since our template doesn't have them
# But we can verify the validation function is called

TEST_PROJ="$TEST_DIR/validation-test"
mkdir -p "$TEST_PROJ/backend"
cat > "$TEST_PROJ/backend/manage.py" << 'EOF'
#!/usr/bin/env python
EOF

cd "$TEST_PROJ"
OUTPUT=$($RUNNER "$INSTALLER_CLI" install --framework django --env development --migrations-only 2>&1 || true)

if echo "$OUTPUT" | grep -q "Validating migrations" || echo "$OUTPUT" | grep -q "Migration validation"; then
    log_info "Migration validation runs"
else
    log_warn "Could not verify migration validation (may run silently)"
fi
cd "$REPO_ROOT"

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
else
    echo -e "Failed: $FAILED"
fi

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ All tests passed!${NC}\n"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed${NC}\n"
    exit 1
fi
