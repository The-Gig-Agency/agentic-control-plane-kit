# Quick Validation Guide

**Before offering the installer to clients, run these checks:**

## 1. Automated Validation (5 minutes)

```bash
# From repo root
npm run validate:installer
```

This runs automated tests for:
- Framework detection
- File generation
- Uninstall functionality
- Doctor command
- Error handling

**Expected:** All tests pass ✅

**Note:** If tests fail, check:
- Is `tsx` installed? (`npm install -g tsx` or use `npx tsx`)
- Are installer files present? (check `installer/cli.ts` exists)
- Review error messages for specific issues

**If automated tests fail but you want to proceed:** Skip to manual smoke test below. Automated tests are strict - manual testing may reveal the installer actually works.

## 2. Manual Smoke Test (10 minutes)

Pick ONE framework you'll offer first (recommend Django):

```bash
# Create test project
cd /tmp
django-admin startproject test_saas
cd test_saas
python manage.py startapp api

# Install
npx echelon install --framework django --env development

# Verify
npx echelon doctor
npx echelon status

# Uninstall
npx echelon uninstall
# Answer: y

# Verify clean
npx echelon doctor  # Should report no installation
```

**Expected:** 
- Install completes ✅
- Doctor shows healthy ✅
- Uninstall removes everything ✅

## 3. Error Handling Check (2 minutes)

```bash
# Test in non-project directory
cd /tmp
npx echelon install --framework django
```

**Expected:** Clear error message, no crash ✅

## 4. Documentation Check (3 minutes)

- [ ] README is clear
- [ ] All commands documented
- [ ] Examples work as written

## Total Time: ~20 minutes

If all checks pass, you're ready to offer to clients! 🚀

## If Something Fails

1. **Automated tests fail**: Fix the issue, don't release
2. **Manual test fails**: Document the issue, fix before release
3. **Error handling fails**: Fix immediately, critical for UX
4. **Documentation unclear**: Update docs before release

## Post-Release Monitoring

After first client:
- Monitor for installation failures
- Collect error reports
- Update validation tests based on real issues
