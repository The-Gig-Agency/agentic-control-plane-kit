#!/bin/bash
# Commit and push Phase 1, 2, and 3 changes

cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

echo "📥 Pulling latest changes..."
git pull

echo "📋 Staging all changes..."
git add -A

echo "📝 Committing changes..."
git commit -m "Implement Phase 1, 2, and 3: Production Safety Features

Phase 1: Critical Safety
- Add route collision detection with base-path support
- Add --base-path CLI option and write to bindings
- Add ACP_ENABLED feature flag to generated endpoint
- Move all env reads from module-level to handler (lazy initialization)
- Add pre-install validation (route check, production confirmation)

Phase 2: Migration Control
- Add --no-migrations flag (code-only install)
- Add --migrations-only flag (DB prep only)
- Add --dry-run flag (show diff without writing)
- Add migration validation (reject ALTER/DROP statements)

Phase 3: Graceful Degradation
- Add ACP_FAIL_MODE configuration (open/closed/read-open)
- Implement read vs write action differentiation
- Add better error messages for governance hub failures
- Add exception handling around Repo B calls
- Implement fail-open, fail-closed, and read-open modes
- Update .env.example with ACP_FAIL_MODE documentation

Files modified:
- installer/cli.ts
- installer/installers/django-installer.ts
- installer/generators/generate-endpoint.ts
- installer/generators/generate-bindings.ts
- installer/generators/generate-migrations.ts
- installer/PRODUCTION-SAFETY-PLAN.md (new)
- installer/PRODUCTION-INSTALL-GUIDE.md (new)
- installer/test/test-phase3.sh (new)
- installer/test/PHASE3-TEST-SPEC.md (new)"

echo "🚀 Pushing to GitHub..."
git push

echo "✅ Done!"
