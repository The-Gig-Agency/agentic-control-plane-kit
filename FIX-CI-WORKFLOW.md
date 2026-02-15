# Fix CI Workflow: docker-compose → docker compose

## Issue
GitHub Actions runners don't have `docker-compose` (standalone), but they do have `docker compose` (plugin).

## Solution
Update `.github/workflows/ci.yml` to use `docker compose` instead of `docker-compose`.

## Exact Changes Needed

Edit `.github/workflows/ci.yml` and make these replacements:

### Change 1: Build command
```diff
- run: docker-compose -f local.yml build
+ run: docker compose -f local.yml build
```

### Change 2: Migrate command
```diff
- run: docker-compose -f local.yml run --rm django python manage.py migrate
+ run: docker compose -f local.yml run --rm django python manage.py migrate
```

### Change 3: Pytest command
```diff
- run: docker-compose -f local.yml run django pytest
+ run: docker compose -f local.yml run django pytest
```

### Change 4: Down command
```diff
- run: docker-compose -f local.yml down
+ run: docker compose -f local.yml down
```

## Complete Example

Here's what the pytest job should look like after the fix:

```yaml
jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build containers
        run: docker compose -f local.yml build
      
      - name: Run migrations
        run: docker compose -f local.yml run --rm django python manage.py migrate
      
      - name: Run tests
        run: docker compose -f local.yml run django pytest
      
      - name: Cleanup
        if: always()
        run: docker compose -f local.yml down
```

## Quick Fix Command

If you have access to the repo, you can run:

```bash
# In api-docs-template repo
cd .github/workflows
sed -i 's/docker-compose/docker compose/g' ci.yml
```

Or manually edit the file and replace all instances of `docker-compose` with `docker compose`.

## Verification

After making the change, verify:
1. All 4 instances are replaced
2. No other `docker-compose` references exist
3. Commit and push to the branch

## Status

- ✅ **Pre-commit trailing whitespace**: Already fixed (commit c746fae)
- ⏳ **Workflow fix**: Needs to be applied (requires workflow scope or manual edit)

Once this change is applied, both CI failures should be resolved!
