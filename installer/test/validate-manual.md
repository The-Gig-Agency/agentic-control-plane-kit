# Manual Validation Checklist

Use this checklist to manually validate the installer before client release.

## Pre-Validation Setup

1. **Clean Environment**
   ```bash
   # Ensure you're in a clean state
   cd /tmp
   rm -rf test-echelon-*
   ```

2. **Build Installer** (if needed)
   ```bash
   cd /path/to/agentic-control-plane-kit
   npm run build  # If TypeScript needs compilation
   ```

## Framework: Django

### Fresh Project Test

```bash
# 1. Create fresh Django project
cd /tmp
django-admin startproject test_saas
cd test_saas
python manage.py startapp api

# 2. Run installer
npx echelon install --framework django --env development

# 3. Verify files exist
ls -la backend/control_plane/
ls -la backend/control_plane/acp/
ls -la backend/control_plane/adapters/
ls -la backend/control_plane/views/

# 4. Check bindings
cat backend/control_plane/bindings.py | grep kernelId

# 5. Run doctor
npx echelon doctor

# 6. Check status
npx echelon status

# 7. Test uninstall
npx echelon uninstall
# Answer: y

# 8. Verify clean removal
ls backend/control_plane/  # Should not exist
npx echelon doctor  # Should report no installation
```

**Checklist:**
- [ ] Install completes without errors
- [ ] All expected files are created
- [ ] Bindings file is valid Python
- [ ] Doctor reports healthy installation
- [ ] Status shows correct information
- [ ] Uninstall removes all files
- [ ] No leftover files after uninstall

### Existing Project Test

```bash
# 1. Use an existing Django project (or create one with existing code)
cd /path/to/existing-django-project

# 2. Note existing structure
ls -la backend/

# 3. Run installer
npx echelon install --framework django --env development

# 4. Verify existing code not modified
# Check that your existing files are unchanged

# 5. Verify new files added
ls -la backend/control_plane/

# 6. Test uninstall
npx echelon uninstall
```

**Checklist:**
- [ ] Existing code not modified
- [ ] New files added correctly
- [ ] No conflicts with existing structure
- [ ] Uninstall doesn't touch existing code

## Framework: Express

### Fresh Project Test

```bash
# 1. Create fresh Express project
cd /tmp
mkdir test_saas && cd test_saas
npm init -y
npm install express
npm install -D typescript @types/node @types/express

# Create basic app.ts
cat > app.ts << 'EOF'
import express from 'express';
const app = express();
app.listen(3000);
EOF

# 2. Run installer
npx echelon install --framework express --env development

# 3. Verify files exist
ls -la control_plane/
ls -la control_plane/kernel/src/
ls -la control_plane/adapters/

# 4. Check bindings
cat controlplane.bindings.json | jq .

# 5. Run doctor
npx echelon doctor

# 6. Check status
npx echelon status

# 7. Test uninstall
npx echelon uninstall
# Answer: y

# 8. Verify clean removal
ls control_plane/  # Should not exist
npx echelon doctor  # Should report no installation
```

**Checklist:**
- [ ] Install completes without errors
- [ ] All expected files are created
- [ ] Bindings file is valid JSON
- [ ] TypeScript compiles (if applicable)
- [ ] Doctor reports healthy installation
- [ ] Status shows correct information
- [ ] Uninstall removes all files
- [ ] No leftover files after uninstall

## Framework: Supabase

### Fresh Project Test

```bash
# 1. Create fresh Supabase project
cd /tmp
supabase init test_saas
cd test_saas

# 2. Run installer
npx echelon install --framework supabase --env development

# 3. Verify files exist
ls -la supabase/functions/manage/
ls -la control_plane/kernel/src/

# 4. Check migrations
ls -la supabase/migrations/ | grep control

# 5. Run doctor
npx echelon doctor

# 6. Test uninstall
npx echelon uninstall
```

**Checklist:**
- [ ] Install completes without errors
- [ ] Edge function created
- [ ] Migrations created
- [ ] Doctor reports healthy installation
- [ ] Uninstall removes all files

## Error Handling Tests

### Test 1: Non-Project Directory
```bash
cd /tmp
npx echelon install --framework django
# Should show clear error message
```

**Checklist:**
- [ ] Clear error message
- [ ] No partial installation
- [ ] Exit code is non-zero

### Test 2: Invalid Framework
```bash
cd /path/to/project
npx echelon install --framework invalid
# Should show clear error message
```

**Checklist:**
- [ ] Clear error message
- [ ] No partial installation

### Test 3: Missing Dependencies
```bash
# In a project without required dependencies
npx echelon install --framework django
# Should detect and report missing dependencies
```

**Checklist:**
- [ ] Detects missing dependencies
- [ ] Provides helpful error message
- [ ] No partial installation

## Environment Tests

### Development Mode
```bash
npx echelon install --env development
# Should use safe defaults
```

**Checklist:**
- [ ] Uses dev kernel ID
- [ ] Doesn't require production credentials
- [ ] Clear dev mode indicators

### Production Mode
```bash
npx echelon install --env production
# Should require explicit configuration
```

**Checklist:**
- [ ] Requires explicit configuration
- [ ] Validates required fields
- [ ] Clear production mode indicators

## Integration Tests

### Test with Real Endpoint

After installation, test that the endpoint actually works:

```bash
# Django
cd /path/to/django-project
python manage.py runserver &
sleep 2
curl -X POST http://localhost:8000/api/manage \
  -H "X-API-Key: test" \
  -H "Content-Type: application/json" \
  -d '{"action":"meta.actions"}'
# Should return list of actions
```

**Checklist:**
- [ ] Endpoint responds
- [ ] Returns expected format
- [ ] No errors in server logs

## Final Validation

Before client release, ensure:

- [ ] All manual tests pass
- [ ] Automated tests pass (`./validate-installer.sh`)
- [ ] Documentation is accurate
- [ ] Error messages are user-friendly
- [ ] Uninstall works correctly
- [ ] No secrets in generated code
- [ ] File permissions are correct

## Sign-Off

- [ ] Validated by: ________________
- [ ] Date: ________________
- [ ] Frameworks tested: ________________
- [ ] Ready for client release: ☐ Yes  ☐ No
