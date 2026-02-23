#!/bin/bash
# Test script to verify Railway auto-deploy is working

echo "🧪 Testing Railway Auto-Deploy"
echo ""

# Make a small change
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
echo "# Auto-deploy test: $TIMESTAMP" >> gateway/README.md

# Commit and push
git add gateway/README.md
git commit -m "Test: Trigger Railway auto-deploy - $TIMESTAMP"
git push origin main

echo ""
echo "✅ Pushed test commit"
echo ""
echo "📊 Next steps:"
echo "1. Go to Railway Dashboard → Service → Deployments"
echo "2. Watch for a new deployment to start (should appear within 10-30 seconds)"
echo "3. If no deployment appears, check:"
echo "   - Railway Project Settings → Git → Auto Deploy is ON"
echo "   - GitHub repo → Settings → Webhooks → Railway webhook exists"
echo ""
echo "🔍 To check webhook status:"
echo "   Railway Dashboard → Project → Settings → Git → View webhook logs"
