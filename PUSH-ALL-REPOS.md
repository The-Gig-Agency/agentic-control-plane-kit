# Push All Repos - Security Fixes

Commands to push the security fixes to all repositories.

## Repo A: agentic-control-plane-kit

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit
git add gateway/auth.ts
git commit -m "fix: improve gateway auth error logging for API key lookup debugging"
git push origin main
```

## Repo B: governance-hub

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub
git add supabase/functions/mcp-servers-register/index.ts
git add supabase/functions/mcp-servers-update/index.ts
git add supabase/functions/mcp-servers-delete/index.ts
git add supabase/functions/policy-propose/index.ts
git add supabase/functions/whoami/index.ts
git commit -m "fix: add email verification checks to write endpoints, create whoami endpoint"
git push origin main
```

## Repo D: echelon-control

```bash
cd /Users/rastakit/tga-workspace/repos/echelon-control
git add supabase/functions/consumer-signup/index.ts
git commit -m "fix: remove Stripe customer creation from signup (moved to verify-email)"
git push origin main
```

---

## One-Liner to Push All

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit && \
git add gateway/auth.ts && \
git commit -m "fix: improve gateway auth error logging for API key lookup debugging" && \
git push origin main && \
cd ../governance-hub && \
git add supabase/functions/mcp-servers-register/index.ts supabase/functions/mcp-servers-update/index.ts supabase/functions/mcp-servers-delete/index.ts supabase/functions/policy-propose/index.ts supabase/functions/whoami/index.ts && \
git commit -m "fix: add email verification checks to write endpoints, create whoami endpoint" && \
git push origin main && \
cd ../echelon-control && \
git add supabase/functions/consumer-signup/index.ts && \
git commit -m "fix: remove Stripe customer creation from signup (moved to verify-email)" && \
git push origin main && \
echo "✅ All repos pushed successfully"
```

---

## If Branches Have Diverged

If any repo shows "diverged" or "behind", pull first:

```bash
# For each repo that needs it:
git pull origin main --no-rebase

# If there are conflicts, resolve them, then:
git add .
git commit -m "Merge remote changes"
git push origin main
```

---

## After Pushing - Deploy Functions

### Repo B (Governance Hub)

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub
supabase functions deploy mcp-servers-register
supabase functions deploy mcp-servers-update
supabase functions deploy mcp-servers-delete
supabase functions deploy policy-propose
supabase functions deploy whoami
```

### Repo D (Echelon Control)

```bash
cd /Users/rastakit/tga-workspace/repos/echelon-control
supabase functions deploy consumer-signup
```

### Repo A (Gateway)

Redeploy gateway service (Railway/Fly.io/etc.) to pick up auth logging changes.
