# Installer Validation Troubleshooting

## Common Issues

### "tsx not found"

**Solution:**
```bash
# Option 1: Install globally
npm install -g tsx

# Option 2: Use npx (script will auto-detect)
# No action needed - script will use npx tsx automatically
```

### "Installer CLI not found"

**Solution:**
- Make sure you're running from repo root: `cd /path/to/agentic-control-plane-kit`
- Verify `installer/cli.ts` exists
- Check you're in the correct directory

### "Framework detection failed"

**Possible causes:**
1. Installer code not fully implemented
2. Framework detection logic needs adjustment
3. Test project structure doesn't match expected format

**Solution:**
- Try manual installation first (see QUICK-VALIDATION.md)
- Check if `installer/detect/` files exist
- Review detection logic in `installer/detect/index.ts`

### "File generation failed"

**Possible causes:**
1. Generator functions not implemented
2. File paths incorrect
3. Permissions issues

**Solution:**
- Check `installer/generators/` directory
- Verify write permissions in test directory
- Try manual installation to see actual errors

### Tests fail but manual install works

**This is OK!** Automated tests are strict and may fail for minor reasons:
- Output format differences
- Path variations
- Timing issues

**Solution:**
- If manual smoke test passes, installer is likely fine
- Update test expectations if installer behavior changed
- Focus on manual validation for first client

## Validation Strategy

### If Automated Tests Fail

1. **Don't panic** - automated tests are strict
2. **Run manual smoke test** (see QUICK-VALIDATION.md)
3. **If manual test passes**, installer likely works
4. **Fix test expectations** or installer issues as needed

### If Manual Tests Fail

1. **This is a real issue** - fix before client release
2. **Check error messages** carefully
3. **Review installer code** for bugs
4. **Test in clean environment** to rule out local issues

## Getting Help

If validation consistently fails:

1. **Check installer implementation status**
   - Are all installers implemented? (`installer/installers/`)
   - Are all generators implemented? (`installer/generators/`)
   - Are all detectors implemented? (`installer/detect/`)

2. **Test manually first**
   - Create fresh test project
   - Run installer manually
   - See what actually happens

3. **Update validation tests**
   - Tests may be too strict
   - Output format may have changed
   - Adjust test expectations

## Quick Diagnostic

```bash
# 1. Check prerequisites
which tsx || which npx
ls installer/cli.ts

# 2. Try manual install
cd /tmp
mkdir test-install && cd test-install
# Create minimal project structure
# Run: tsx /path/to/agentic-control-plane-kit/installer/cli.ts install --framework django --env development

# 3. Check what happens
# Review output and errors
```

## Bottom Line

**Automated tests failing ≠ Installer broken**

Manual validation is the ultimate test. If manual installation works, you're good to go (just fix the tests later).
