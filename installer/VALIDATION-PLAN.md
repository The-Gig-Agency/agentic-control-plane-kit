# Echelon Installer Validation Plan

**Purpose**: Comprehensive validation strategy to ensure the installer works reliably before offering to clients.

## Pre-Release Validation Checklist

### ✅ Phase 1: Unit Testing (Automated)

Run these tests in isolated environments before any client exposure:

#### 1.1 Framework Detection Tests
- [ ] Detects Django project correctly
- [ ] Detects Express/Node.js project correctly
- [ ] Detects Supabase project correctly
- [ ] Handles unknown frameworks gracefully
- [ ] Handles mixed frameworks (e.g., Django + React frontend)

#### 1.2 File Generation Tests
- [ ] Kernel files copied correctly (all frameworks)
- [ ] Adapters generated with correct structure
- [ ] Endpoint files created in correct locations
- [ ] Bindings file created with valid JSON/Python
- [ ] Migrations generated with valid SQL/Python
- [ ] No files overwritten unexpectedly
- [ ] No files left in partial state on failure

#### 1.3 Environment Handling Tests
- [ ] Development mode uses safe defaults
- [ ] Staging mode requires explicit config
- [ ] Production mode validates all required fields
- [ ] Environment variables documented correctly
- [ ] No production secrets in dev mode

#### 1.4 Uninstall Tests
- [ ] Uninstall removes all generated files
- [ ] Uninstall doesn't touch user code
- [ ] Uninstall is idempotent (safe to run twice)
- [ ] Uninstall preserves migrations if requested
- [ ] Uninstall cleans up URL routes correctly

### ✅ Phase 2: Integration Testing (Manual + Automated)

#### 2.1 Fresh Project Tests
Test on completely fresh projects:

**Django Test Project:**
```bash
# Create fresh Django project
django-admin startproject test_saas
cd test_saas
python manage.py startapp api

# Run installer
npx echelon install --framework django --env development

# Verify:
# - Files created
# - No syntax errors
# - Can import modules
# - Endpoint route exists
```

**Express Test Project:**
```bash
# Create fresh Express project
mkdir test_saas && cd test_saas
npm init -y
npm install express
# Create basic app.js

# Run installer
npx echelon install --framework express --env development

# Verify:
# - Files created
# - TypeScript compiles
# - No import errors
# - Endpoint route exists
```

**Supabase Test Project:**
```bash
# Create fresh Supabase project
supabase init test_saas
cd test_saas

# Run installer
npx echelon install --framework supabase --env development

# Verify:
# - Edge function created
# - Migrations valid
# - No syntax errors
```

#### 2.2 Existing Project Tests
Test on projects that already have code:

- [ ] Installer doesn't break existing routes
- [ ] Installer doesn't conflict with existing dependencies
- [ ] Installer handles custom project structures
- [ ] Installer respects existing .gitignore
- [ ] Installer doesn't modify user's existing files

#### 2.3 Error Handling Tests
- [ ] Graceful failure on missing dependencies
- [ ] Clear error messages for common issues
- [ ] No partial installations left on failure
- [ ] Rollback works if installation fails mid-way
- [ ] Handles permission errors gracefully
- [ ] Handles disk space issues gracefully

### ✅ Phase 3: End-to-End Validation (Manual)

#### 3.1 Complete Installation Flow
For each framework, test the full flow:

1. **Install**
   ```bash
   npx echelon install --framework <framework> --env development
   ```

2. **Verify Files**
   ```bash
   npx echelon doctor
   ```

3. **Check Status**
   ```bash
   npx echelon status
   ```

4. **Test Endpoint** (if server can run)
   ```bash
   curl -X POST http://localhost:8000/api/manage \
     -H "X-API-Key: test" \
     -d '{"action":"meta.actions"}'
   ```

5. **Uninstall**
   ```bash
   npx echelon uninstall
   ```

6. **Verify Clean Removal**
   ```bash
   npx echelon doctor  # Should report no installation
   ```

#### 3.2 Multi-Environment Tests
- [ ] Development install works
- [ ] Staging install works (with proper config)
- [ ] Production install works (with proper config)
- [ ] Environment-specific defaults are correct

#### 3.3 Edge Cases
- [ ] Install in project with no package.json/requirements.txt
- [ ] Install in project with unusual directory structure
- [ ] Install in project with existing control_plane directory
- [ ] Install in project with symlinks
- [ ] Install in project with very long paths
- [ ] Install in project with special characters in paths
- [ ] Install in project with read-only directories (should fail gracefully)

### ✅ Phase 4: Client Readiness Tests

#### 4.1 Documentation Review
- [ ] README is clear and accurate
- [ ] All commands documented
- [ ] Error messages are user-friendly
- [ ] Troubleshooting guide exists
- [ ] Examples work as documented

#### 4.2 User Experience
- [ ] Installation is intuitive
- [ ] Progress messages are clear
- [ ] Error messages are actionable
- [ ] Success messages are helpful
- [ ] Uninstall is clearly reversible

#### 4.3 Security Validation
- [ ] No secrets logged to console
- [ ] No secrets written to files
- [ ] Generated code doesn't expose secrets
- [ ] File permissions are correct
- [ ] No arbitrary code execution risks

### ✅ Phase 5: Regression Testing

Before each release, run:

1. **Smoke Test Suite** (automated)
   ```bash
   npm run test:installer
   ```

2. **Full Test Matrix** (manual)
   - Django: fresh project, existing project
   - Express: fresh project, existing project
   - Supabase: fresh project, existing project

3. **Uninstall Test** (all frameworks)
   - Install → Verify → Uninstall → Verify clean

## Automated Test Scripts

See `test/` directory for:
- `test-fresh-projects.sh` - Tests on fresh projects
- `test-existing-projects.sh` - Tests on existing projects
- `test-uninstall.sh` - Tests uninstall flow
- `test-error-handling.sh` - Tests error scenarios

## Manual Validation Script

Run `npm run validate` to execute automated checks.

## Pre-Client Release Checklist

Before offering to any client:

- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass (at least 1 framework)
- [ ] Phase 3 end-to-end test passes (at least 1 framework)
- [ ] Documentation reviewed and accurate
- [ ] Error messages are user-friendly
- [ ] Uninstall tested and works
- [ ] `npx echelon doctor` works correctly
- [ ] `npx echelon status` works correctly

## Continuous Validation

After release:
- Monitor for installation failures
- Collect error reports
- Update test suite based on real-world issues
- Maintain test projects for each framework

## Test Environments

Maintain these test projects:
- `test-projects/django-fresh/` - Fresh Django project
- `test-projects/django-existing/` - Django project with existing code
- `test-projects/express-fresh/` - Fresh Express project
- `test-projects/express-existing/` - Express project with existing code
- `test-projects/supabase-fresh/` - Fresh Supabase project
- `test-projects/supabase-existing/` - Supabase project with existing code

These should be gitignored and regenerated for each test run.
