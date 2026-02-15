# Quick Fix: Deployment Errors

## TL;DR - Most Common Fixes

### 1. Add Missing `__init__.py` Files
```bash
# In api-docs-template repo
touch control_plane/__init__.py
touch control_plane/acp/__init__.py
touch control_plane/packs/__init__.py
touch control_plane/packs/leadscoring/__init__.py
```

### 2. Fix Import Errors
```python
# Ensure all imports are correct
# Check that files exist:
# - control_plane/acp/router.py
# - control_plane/acp/auth.py
# - control_plane/packs/leadscoring/actions.py
```

### 3. Add Test Dependencies
```txt
# requirements.txt or pyproject.toml
pytest>=7.0.0
pytest-asyncio>=0.21.0
pytest-django>=4.5.0
```

### 4. Configure Pytest
```ini
# pytest.ini or conftest.py
[pytest]
pythonpath = .
asyncio_mode = auto
```

### 5. Fix Vercel Config
```json
// vercel.json
{
  "buildCommand": "pip install -r requirements.txt && python manage.py collectstatic --noinput",
  "python": {
    "version": "3.9"
  }
}
```

## Run These Commands Locally

```bash
# 1. Check syntax
python -m py_compile control_plane/**/*.py

# 2. Check imports
python -c "from control_plane.acp.router import createManageRouter"

# 3. Run linter
flake8 control_plane/ || black --check control_plane/

# 4. Run tests
pytest tests/ -v
```

Fix any errors you see, then push again.
