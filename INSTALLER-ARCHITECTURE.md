# Installer Architecture

## Overview

Repo A (agentic-control-plane-kit) now has **two distinct layers**:

1. **Kernel** - Pure runtime engine (framework-agnostic)
2. **Installer** - Automated embedding tool

This separation ensures kernel purity and enables easy distribution.

## Directory Structure

```
agentic-control-plane-kit/
│
├─ kernel/                 ← Pure runtime (never aware of installer)
│   ├─ src/
│   ├─ types/
│   └─ router.ts
│
├─ kernel-py/              ← Pure runtime (Python)
│   └─ acp/
│
├─ installer/              ← Installation engine
│   ├─ cli.ts              ← Main CLI entrypoint
│   ├─ detect/             ← Framework detection
│   │   ├─ detect-django.ts
│   │   ├─ detect-express.ts
│   │   └─ detect-supabase.ts
│   │
│   ├─ generators/         ← Code generation
│   │   ├─ generate-adapters.ts
│   │   ├─ generate-endpoint.ts
│   │   ├─ generate-bindings.ts
│   │   └─ generate-migrations.ts
│   │
│   ├─ installers/         ← Framework-specific installers
│   │   ├─ django-installer.ts
│   │   ├─ express-installer.ts
│   │   └─ supabase-installer.ts
│   │
│   └─ register/           ← Kernel registration
│       └─ register-kernel.ts
│
├─ cli/                    ← Published CLI wrapper
│   └─ echelon.ts
│
├─ package.json            ← Includes "bin": {"echelon": "./cli/echelon.ts"}
└─ README.md
```

## Critical Architectural Rule

**The kernel must remain installer-agnostic.**

### Kernel Should Never Know:
- ❌ How it was installed
- ❌ What framework is hosting it
- ❌ Anything about CLI or installer logic

### This Preserves:
- ✅ Kernel purity
- ✅ Framework portability
- ✅ Independent evolution

## How It Works

### User Runs:
```bash
npx echelon install
```

### Installer Does:
1. **Detect Framework** - Auto-detects Django/Express/Supabase
2. **Copy Kernel** - Copies `kernel/` or `kernel-py/` into target project
3. **Generate Adapters** - Creates framework-specific adapter implementations
4. **Generate Endpoint** - Creates `/api/manage` endpoint wrapper
5. **Generate Bindings** - Creates bindings configuration
6. **Generate Migrations** - Creates database migration files
7. **Register Kernel** - Optionally registers with Governance Hub (Repo B)

### Kernel Remains Unchanged:
- Kernel files are copied, not modified
- Kernel has no knowledge of installer
- Kernel works identically whether installed manually or via CLI

## Framework Support

### Django (Python)
- Copies: `kernel-py/acp/` → `backend/control_plane/acp/`
- Generates: Django adapters, Django view, Django migrations
- Updates: `urls.py` with route

### Express/Node.js (TypeScript)
- Copies: `kernel/src/` → `control_plane/kernel/src/`
- Generates: Express adapters, Express route, SQL migrations
- Updates: `package.json` dependencies

### Supabase (TypeScript)
- Copies: `kernel/src/` → `control_plane/kernel/src/`
- Generates: Supabase adapters, Edge Function, SQL migrations
- Configures: Supabase project

## Installation Flow

```
┌─────────────────┐
│ User runs:      │
│ npx echelon     │
│ install         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ CLI detects     │
│ framework       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Framework       │
│ installer runs: │
│ 1. Copy kernel  │
│ 2. Gen adapters │
│ 3. Gen endpoint │
│ 4. Gen bindings │
│ 5. Gen migrations│
│ 6. Register     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User reviews    │
│ generated files │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User runs       │
│ migrations      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User tests      │
│ /api/manage     │
└─────────────────┘
```

## Why Installer Belongs in Repo A

### Repo A = Integration Surface
- Repo B = Governance authority (invisible infrastructure)
- Repo C = Vault and executor (invisible infrastructure)
- **Repo A = Entrypoint into SaaS** (visible to developers)

### Installer Logically Belongs with Entrypoint
- Developers interact with Repo A
- Installer is part of the developer experience
- Mirrors Stripe SDK + CLI pattern

## Long-Term Vision

Repo A becomes the **installable product**:
- Developers: `npx echelon install`
- Repo B and C: Invisible infrastructure
- Kernel: Pure runtime engine

This creates a clean separation:
- **Runtime role**: `kernel/`, `kernel-py/`
- **Distribution role**: `installer/`, `cli/`

## Extending the Installer

To add a new framework:

1. **Add detector**: `detect/detect-{framework}.ts`
2. **Add generators**: Update `generators/generate-*.ts`
3. **Add installer**: `installers/{framework}-installer.ts`
4. **Update CLI**: Add framework to `cli.ts`

**Kernel remains unchanged** - it's framework-agnostic.

## Testing

```bash
# Test installer locally
cd /path/to/test-saas
tsx ../agentic-control-plane-kit/installer/cli.ts install --framework django
```

## Publishing

When ready:

1. Build: `npm run build`
2. Publish: `npm publish`
3. Users: `npx echelon install`

The `bin` field in `package.json` points to `cli/echelon.ts`, which delegates to `installer/cli.ts`.
