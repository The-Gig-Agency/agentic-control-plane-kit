# Dev Install Safety

## Philosophy

**Dev install is your growth funnel.** If dev install feels safe, fast, and reversible, adoption skyrockets. If it feels risky or heavy, adoption dies.

## The Real Adoption Flow

Teams follow this progression:

1. **Dev Environment** - Install locally, test basic actions, verify nothing breaks
2. **Staging Environment** - Connect to staging Governance Hub/Vault, test real integrations
3. **Production** - Enable with production kernel ID, restrict policies, gradually expand

This mirrors how teams adopt Stripe, Auth0, Supabase, Sentry, Segment.

## Dev Mode Behavior

### What Dev Mode Does

✅ **Uses dev kernel ID** - Auto-generated: `{framework}-dev-{timestamp}`
✅ **Uses dev integration name** - Auto-generated: `{framework}-dev`
✅ **Optional connections** - Governance Hub and Vault are optional
✅ **Non-authoritative** - No production policies enforced
✅ **Reversible** - `npx echelon uninstall` removes everything
✅ **Safe defaults** - No production credentials required

### What Dev Mode Does NOT Do

❌ **Never touches production secrets**
❌ **Never requires production credentials**
❌ **Never enforces production policies**
❌ **Never modifies production databases**

## Environment Isolation

Each environment has its own:

- **Kernel ID** - `django-dev-123`, `django-staging-456`, `django-prod-789`
- **Governance Hub project** - Separate dev/staging/prod projects
- **Vault project** - Separate dev/staging/prod projects
- **Service keys** - Isolated per environment

**Never mix dev and prod authority.** This protects customers and builds trust.

## Installation Commands

### Install (with environment prompt)

```bash
npx echelon install
```

Prompts:
```
Select environment:
  1) Development (safe, reversible, non-authoritative)
  2) Staging
  3) Production
```

### Install (explicit environment)

```bash
npx echelon install --env development
npx echelon install --env staging
npx echelon install --env production
```

### Uninstall (fully reversible)

```bash
npx echelon uninstall
```

Removes:
- Generated adapters
- `/api/manage` endpoint
- Bindings configuration
- Migrations (optionally)
- Environment variables (from .env.example)
- URL routes

### Doctor (health check)

```bash
npx echelon doctor
```

Checks:
- Kernel files exist
- Adapters are present
- Endpoint is configured
- Bindings are valid
- Environment variables are set
- Database migrations are run

### Status (installation info)

```bash
npx echelon status
```

Shows:
- Installation environment
- Kernel ID
- Integration name
- Connected services (Repo B, Repo C)
- Framework detected

## Dev Install Experience

### Ideal Flow

```bash
git checkout -b test-echelon
npx echelon install
```

**Output:**
```
🚀 Echelon: Agentic Control Plane Installer

🌍 Environment: DEVELOPMENT

📦 Detected framework: django

🔒 Development mode: Safe defaults enabled

📁 Installing to: backend/control_plane
📦 Copying Python kernel...
✅ Kernel copied

🔧 Generating adapters...
✅ Adapters generated

⚙️  Generating bindings...
✅ Bindings generated

🌐 Generating /api/manage endpoint...
✅ Endpoint generated

🗄️  Generating database migrations...
✅ Migrations generated

💡 Development mode: Skipping kernel registration
   You can register manually later or use production environment.

✅ Installation complete!

🔒 Installed in DEVELOPMENT mode (safe, reversible, non-authoritative)

Next steps:
  1. Review generated files
  2. Run database migrations (optional in dev)
  3. Test: curl -X POST http://localhost:8000/api/manage -H "X-API-Key: test" -d '{"action":"meta.actions"}'
  4. To remove: npx echelon uninstall
```

**Done.** No production credentials. No risk. Fully reversible.

## What NOT to Do

### ❌ Don't Require Production Credentials

```bash
# BAD: Forces production setup
npx echelon install --governance-hub-url https://prod-hub.supabase.co
```

### ❌ Don't Require Governance Setup

```bash
# BAD: Blocks dev install
npx echelon install
# Error: GOVERNANCE_HUB_URL required
```

### ❌ Don't Require Secrets Setup

```bash
# BAD: Blocks basic testing
npx echelon install
# Error: CIA_SERVICE_KEY required
```

### ✅ Do Make Everything Optional in Dev

```bash
# GOOD: Works without any external services
npx echelon install --env development
# ✅ Works! Can test meta.actions immediately
```

## Strategic Insight

**Dev install is your growth funnel.**

If dev install feels:
- ✅ Fast
- ✅ Safe
- ✅ Reversible
- ✅ Non-destructive

→ **Adoption skyrockets**

If it feels:
- ❌ Risky
- ❌ Heavy
- ❌ Irreversible
- ❌ Destructive

→ **Adoption dies**

This is the most important UX in your entire product.

## Mental Model

- **Production install** = Security decision
- **Dev install** = Experiment

Your job is to make the experiment effortless and safe.

If dev install is excellent, production adoption follows naturally.

## Environment Variables

### Development Mode

```bash
# .env.example (generated in dev mode)
KERNEL_ID=django-dev-1234567890
INTEGRATION=django-dev

# Development Mode: Optional connections (safe to skip)
# GOVERNANCE_HUB_URL=https://dev-governance-hub.supabase.co
# ACP_KERNEL_KEY=acp_kernel_dev_xxxxx

# CIA_URL=https://dev-vault.supabase.co
# CIA_SERVICE_KEY=cia_service_dev_xxxxx
# CIA_ANON_KEY=eyJ...
```

### Production Mode

```bash
# .env.example (generated in prod mode)
KERNEL_ID=django-kernel
INTEGRATION=django

# Governance Hub (Repo B)
GOVERNANCE_HUB_URL=https://xxx.supabase.co
ACP_KERNEL_KEY=acp_kernel_xxxxx

# Key Vault Executor (Repo C)
CIA_URL=https://yyy.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx
CIA_ANON_KEY=eyJ...
```

## Reversibility

### Uninstall Command

```bash
npx echelon uninstall
```

**Prompts:**
```
Are you sure you want to uninstall? This will remove generated files. [y/N]: y
Remove migration files? [y/N]: n
```

**Removes:**
- ✅ `backend/control_plane/` directory
- ✅ `controlplane.bindings.json`
- ✅ `/api/manage` endpoint files
- ✅ URL routes from `urls.py`
- ✅ Migration files (if confirmed)
- ⚠️  Note: Review `.env.example` manually

**Result:** Project is back to original state.

## Testing Dev Install

### Safe Testing Workflow

```bash
# 1. Create test branch
git checkout -b test-echelon

# 2. Install in dev mode
npx echelon install --env development

# 3. Test basic functionality
curl -X POST http://localhost:8000/api/manage \
  -H "X-API-Key: test" \
  -d '{"action":"meta.actions"}'

# 4. If satisfied, keep it
# If not, uninstall
npx echelon uninstall
git checkout main
git branch -D test-echelon
```

**Zero risk. Fully reversible.**

## Production Transition

When ready for production:

```bash
# 1. Install in production mode
npx echelon install --env production \
  --governance-hub-url https://prod-hub.supabase.co \
  --kernel-api-key acp_kernel_prod_xxxxx

# 2. Register kernel in Governance Hub
# (Done automatically if credentials provided)

# 3. Configure policies in Governance Hub UI

# 4. Test with production credentials
```

## Summary

**Dev install must be:**
- ✅ Safe (no production access)
- ✅ Fast (works immediately)
- ✅ Reversible (`npx echelon uninstall`)
- ✅ Non-authoritative (optional connections)
- ✅ Non-destructive (doesn't break existing code)

**This is your growth funnel. Make it excellent.**
