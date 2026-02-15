# Fixing Deployment Errors: api-docs-template PR

## Error Summary
- ❌ **CI / linter (pull_request)**: Failing after 26s
- ❌ **CI / pytest (pull_request)**: Failing after 5s
- ❌ **Vercel**: Deployment has failed
- ✅ **Vercel Preview Comments**: Passing
- ✅ **No conflicts**: Base branch is clean

## Common Causes & Fixes

### 1. Linter Failures (CI / linter)

**Common Issues:**

#### A. Python Syntax Errors
```bash
# Check for syntax errors
python -m py_compile control_plane/**/*.py

# Or use flake8/black
flake8 control_plane/
black --check control_plane/
```

**Fixes:**
- Fix indentation errors
- Fix missing imports
- Fix type hint errors
- Ensure Python 3.8+ compatibility

#### B. Import Errors
```python
# ❌ BAD: Missing imports
from control_plane.acp.router import createManageRouter
# If router.py doesn't exist or has errors

# ✅ GOOD: Verify all imports
# Check that all imported modules exist
```

**Fixes:**
- Ensure all imported modules exist
- Check `__init__.py` files are present
- Verify Python path is correct

#### C. Type Hint Errors
```python
# ❌ BAD: Invalid type hints
def createManageRouter(config: KernelConfig) -> ManageRouter:
    # If KernelConfig doesn't exist

# ✅ GOOD: Valid type hints or use typing.Any
from typing import Any
def createManageRouter(config: Any) -> Any:
```

**Fixes:**
- Add missing type imports
- Use `typing.Any` for complex types
- Or remove type hints temporarily

#### D. Missing Dependencies
```python
# If using async/await
import asyncio

# If using ABC
from abc import ABC, abstractmethod
```

**Fixes:**
- Add missing standard library imports
- Check `requirements.txt` or `pyproject.toml`

### 2. Pytest Failures (CI / pytest)

**Common Issues:**

#### A. Test Import Errors
```python
# ❌ BAD: Tests can't import modules
from control_plane.acp.router import createManageRouter
# ImportError: No module named 'control_plane'

# ✅ GOOD: Fix Python path
# Add to pytest.ini or conftest.py
[pytest]
pythonpath = .
```

**Fixes:**
- Add `__init__.py` to all packages
- Fix Python path in pytest config
- Check test file structure

#### B. Missing Test Dependencies
```python
# If tests use pytest-asyncio
pytest-asyncio

# If tests use fixtures
pytest-django  # for Django tests
```

**Fixes:**
- Add test dependencies to `requirements.txt` or `pyproject.toml`
- Check `pytest.ini` or `conftest.py` configuration

#### C. Test Failures (Not Import Errors)
```python
# Check what tests are failing
pytest tests/ -v

# Common failures:
# - Assertion errors
# - Missing mocks
# - Database connection issues
```

**Fixes:**
- Fix assertion errors
- Add missing mocks
- Configure test database

#### D. Async Test Issues
```python
# If using async handlers
import pytest

@pytest.mark.asyncio
async def test_manage_endpoint():
    # Test async code
```

**Fixes:**
- Add `pytest-asyncio` dependency
- Mark async tests with `@pytest.mark.asyncio`

### 3. Vercel Deployment Failures

**Common Issues:**

#### A. Build Errors
```bash
# Check build logs for:
# - Missing dependencies
# - Import errors
# - Type errors
```

**Fixes:**
- Ensure `requirements.txt` or `pyproject.toml` has all dependencies
- Fix import paths
- Check `vercel.json` configuration

#### B. Python Version Mismatch
```python
# Check Python version in vercel.json
{
  "buildCommand": "python --version",
  "runtime": "python3.9"  # or appropriate version
}
```

**Fixes:**
- Specify Python version in `vercel.json`
- Ensure local Python version matches

#### C. Missing Environment Variables
```python
# If code uses env vars
import os
DATABASE_URL = os.getenv('DATABASE_URL')
```

**Fixes:**
- Add environment variables in Vercel dashboard
- Or use `.env.example` file

#### D. Django Settings Issues
```python
# If Django app
# Check settings.py for:
# - ALLOWED_HOSTS
# - DEBUG mode
# - Database configuration
```

**Fixes:**
- Configure `ALLOWED_HOSTS` for Vercel
- Set `DEBUG=False` for production
- Configure database connection

## Quick Diagnostic Steps

### Step 1: Check Linter Locally
```bash
# Run linter locally
cd api-docs-template
python -m flake8 control_plane/ --max-line-length=120
# Or
black --check control_plane/
```

### Step 2: Run Tests Locally
```bash
# Run pytest locally
pytest tests/ -v

# Check for specific errors
pytest tests/test_control_plane.py -v
```

### Step 3: Check Build Locally
```bash
# Try building locally
python -m compileall control_plane/

# Check for import errors
python -c "from control_plane.acp.router import createManageRouter"
```

### Step 4: Check Vercel Build
```bash
# Check vercel.json
cat vercel.json

# Verify build command
vercel build
```

## Common File Issues

### Missing `__init__.py` Files
```bash
# Ensure these exist:
control_plane/__init__.py
control_plane/acp/__init__.py
control_plane/packs/__init__.py
control_plane/packs/leadscoring/__init__.py
```

### Incorrect Import Paths
```python
# ❌ BAD: Absolute imports that don't work
from control_plane.acp.router import createManageRouter

# ✅ GOOD: Relative imports or fix Python path
from .router import createManageRouter
# Or add to PYTHONPATH
```

### Missing Dependencies in requirements.txt
```txt
# requirements.txt should include:
pytest>=7.0.0
pytest-asyncio>=0.21.0
pytest-django>=4.5.0  # if Django tests
black>=22.0.0
flake8>=5.0.0
```

## Specific Fixes for This PR

### 1. Fix Linter Errors

**Check for:**
- Python syntax errors
- Type hint errors
- Import errors
- Missing `__init__.py` files

**Action:**
```bash
# Add __init__.py files
touch control_plane/__init__.py
touch control_plane/acp/__init__.py
touch control_plane/packs/__init__.py
touch control_plane/packs/leadscoring/__init__.py

# Fix imports
# Ensure all imports are correct
```

### 2. Fix Pytest Errors

**Check for:**
- Test import errors
- Missing test dependencies
- Async test configuration
- Database configuration

**Action:**
```python
# Add to conftest.py or pytest.ini
[pytest]
pythonpath = .
asyncio_mode = auto
DJANGO_SETTINGS_MODULE = scoringengine.settings
```

### 3. Fix Vercel Deployment

**Check for:**
- Build command errors
- Missing environment variables
- Python version
- Django settings

**Action:**
```json
// vercel.json
{
  "buildCommand": "pip install -r requirements.txt",
  "devCommand": "python manage.py runserver",
  "installCommand": "pip install -r requirements.txt",
  "framework": null,
  "outputDirectory": ".",
  "python": {
    "version": "3.9"
  }
}
```

## Quick Fix Checklist

- [ ] **Add `__init__.py` files** to all packages
- [ ] **Fix import errors** (check all imports work)
- [ ] **Add missing dependencies** to requirements.txt
- [ ] **Fix type hints** (or remove temporarily)
- [ ] **Configure pytest** (pythonpath, asyncio mode)
- [ ] **Fix test imports** (ensure tests can import modules)
- [ ] **Check Vercel config** (build command, Python version)
- [ ] **Add environment variables** in Vercel dashboard
- [ ] **Fix Django settings** (ALLOWED_HOSTS, DEBUG)

## Debugging Commands

```bash
# 1. Check Python syntax
python -m py_compile control_plane/**/*.py

# 2. Check imports
python -c "from control_plane.acp.router import createManageRouter; print('OK')"

# 3. Run linter
flake8 control_plane/ --max-line-length=120 --ignore=E501

# 4. Run tests
pytest tests/ -v --tb=short

# 5. Check for missing files
find control_plane/ -name "*.py" | xargs grep -l "import.*control_plane"

# 6. Check pytest config
cat pytest.ini
cat conftest.py
```

## Most Likely Issues

Based on common patterns:

1. **Missing `__init__.py` files** (most common)
2. **Import path errors** (Python can't find modules)
3. **Missing test dependencies** (pytest-asyncio, etc.)
4. **Type hint errors** (mypy or type checker failing)
5. **Vercel build config** (missing build command or Python version)

## Next Steps

1. **Check CI logs** for specific error messages
2. **Run linter locally** to reproduce errors
3. **Run tests locally** to see failures
4. **Fix one issue at a time** (start with linter, then tests, then Vercel)
5. **Commit fixes** and push to see if CI passes

## If You Can Share Error Logs

If you can share the specific error messages from:
- CI / linter logs
- CI / pytest logs  
- Vercel build logs

I can provide more targeted fixes!
