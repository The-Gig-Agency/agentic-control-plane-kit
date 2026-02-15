#!/bin/bash
# Commit and push changes to agentic-control-plane-kit

cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Stage the CIQ automations plan
git add CIQ-AUTOMATIONS-AGENTIC-PLAN.md

# Check if there are other uncommitted changes
git status --short

# Commit
git commit -m "docs: Add CIQ Automations agentic integration plan

- Comprehensive plan for enabling ciq-automations to be agentic
- 5-phase implementation plan
- Database migrations, adapters, domain pack
- Testing framework and QA guide
- Complete integration documentation"

# Push
git push

echo "✅ Changes committed and pushed successfully!"
