# Echelon Installer

Automated installer for embedding the Agentic Control Plane kernel into SaaS applications.

---

## Developing the CLI in this repo

The published `echelon` binary is built to `dist/echelon.mjs` (not committed). After `npm install`, run:

```bash
npm run build:cli
```

Use `npx tsx installer/cli.ts …` or `npx tsx cli/echelon.ts …` if you are iterating without rebuilding the bundle.

---

## Architecture

The installer is **completely separate** from the kernel. This preserves kernel purity:

```
agentic-control-plane-kit/
├─ kernel/              ← Pure runtime (installer-agnostic)
├─ kernel-py/           ← Pure runtime (installer-agnostic)
├─ installer/           ← Installation engine (never imported by kernel)
│   ├─ cli.ts           ← Main entrypoint
│   ├─ detect/          ← Framework detection
│   ├─ generators/      ← Code generation
│   ├─ installers/      ← Framework-specific installers
│   └─ register/        ← Optional kernel registration with hosted governance
└─ cli/                 ← Published CLI wrapper
    └─ echelon.ts
```

---

## Critical Rule: Kernel Purity

**The kernel must never know about the installer.**

- Kernel = execution engine only
- Installer = embedding tool
- They are completely decoupled

This ensures:

- Kernel remains framework-agnostic
- Kernel can be used without installer
- Installer can evolve independently

---

## Installer Contract (V2)

For implementation boundaries and readiness gates, see:

- [INSTALLER-V2-CONTRACT.md](./INSTALLER-V2-CONTRACT.md)

This defines:

- what is prebuilt by the kit vs project-owned
- required readiness checks for development and production
- rollout checklist for improving installer quality

---

## Usage

### As Published Package

```bash
npx echelon verbs --public-only
npx echelon install
npx echelon install --framework django
npx echelon install --framework express --kernel-id my-kernel
```

Use `echelon verbs` (or `echelon verbs --json`) to list registered public vs legacy subcommands; see `installer/cli-registry.ts` for the canonical verb table (TGA-171).

### As Development Tool

```bash
# From repo root
tsx installer/cli.ts install --framework django
```

---

## What the Installer Does

1. **Detects Framework** — Auto-detects Django, Express, or Supabase
2. **Copies Kernel** — Copies kernel source into target project
3. **Generates Adapters** — Creates framework-specific adapter implementations
4. **Generates Endpoint** — Creates `/api/manage` endpoint wrapper
5. **Generates Bindings** — Creates bindings configuration
6. **Generates Migrations** — Creates database migration files
7. **Registers Kernel** — Optionally registers with Governance Hub (Repo B)

---

## Framework Support

### Django (Python)

- Copies `kernel-py/acp/` → `backend/control_plane/acp/`
- Generates Django adapters (ORM-based)
- Creates Django view for `/api/manage`
- Generates Django migrations
- Updates `urls.py` with route

### Express/Node.js (TypeScript)

- Copies `kernel/src/` → `control_plane/kernel/src/`
- Generates Express adapters (Prisma/Supabase-based)
- Creates Express route handler
- Generates SQL migrations
- Updates `package.json` dependencies

### Supabase (TypeScript)

- Copies `kernel/src/` → `control_plane/kernel/src/`
- Generates Supabase adapters
- Creates Supabase Edge Function
- Generates SQL migrations
- Configures Supabase project

---

## Installation Flow

```
User runs: npx echelon install
    ↓
CLI detects framework
    ↓
Framework installer runs:
    ├─ Copy kernel
    ├─ Generate adapters
    ├─ Generate endpoint
    ├─ Generate bindings
    ├─ Generate migrations
    └─ Register kernel (optional)
    ↓
User reviews generated files
    ↓
User runs migrations
    ↓
User sets environment variables
    ↓
User tests /api/manage endpoint
```

---

## Extending the Installer

To add support for a new framework:

1. **Add detector** in `detect/detect-{framework}.ts`
2. **Add generator functions** in `generators/generate-{component}.ts`
3. **Add installer** in `installers/{framework}-installer.ts`
4. **Update CLI** to handle new framework

The kernel remains unchanged — it's framework-agnostic.

---

## Testing & Validation

Before offering to clients, validate the installer:

### Quick Validation (20 minutes)

See [QUICK-VALIDATION.md](./QUICK-VALIDATION.md) for a fast pre-release checklist.

### Comprehensive Validation

See [VALIDATION-PLAN.md](./VALIDATION-PLAN.md) for full test strategy.

### Automated Tests

```bash
# Run automated validation
npm run validate:installer

# Test specific framework
npm run validate:installer:django
npm run validate:installer:express
npm run validate:installer:supabase
```

### Manual Testing

```bash
# Test installer locally
cd /path/to/test-saas
tsx ../agentic-control-plane-kit/installer/cli.ts install --framework django
```

See [test/validate-manual.md](./test/validate-manual.md) for detailed manual test procedures.

---

## Publishing

When ready to publish:

1. Build TypeScript: `npm run build`
2. Publish to npm: `npm publish`
3. Users can then: `npx echelon install`

The `bin` field in `package.json` points to `cli/echelon.ts`, which delegates to `installer/cli.ts`.
