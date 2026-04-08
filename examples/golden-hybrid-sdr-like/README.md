# Golden hybrid reference (SDR-like) — TGA-191

This directory is a **minimal, copy-pasteable** host repo layout for the **Netlify Functions + Supabase** hybrid installer target. It mirrors common real SaaS shapes (frontend app + serverless API surface + Supabase data plane + optional workers) without shipping a full product.

## Topology

| Layer | Role in this template |
|-------|------------------------|
| **Netlify** | Owns the public `/manage` HTTP surface via a generated function. |
| **Supabase** | Intended data plane (Postgres + auth patterns); env vars in `.env.example`. |
| **`services/worker/`** | Placeholder for Python/Node workers that share Supabase; not touched by Echelon. |

Default manage URL: `/.netlify/functions/echelon-manage` (see [../../installer/default-base-path.ts](../../installer/default-base-path.ts)).

## Quick validation (from kit checkout)

Proves `echelon init` completes cleanly on this topology (used in CI):

```bash
# From agentic-control-plane-kit repo root
npm run build:cli
npm run test:golden-hybrid
```

Or:

```bash
bash scripts/validate-golden-hybrid.sh
```

## Manual onboarding demo

1. Copy this folder into a new git repo (or use it as a template).
2. From the **new repo root** (with `agentic-control-plane-kit` as a dev dependency or `npx` from a packed tarball):

   ```bash
   npx echelon init --framework hybrid_netlify_supabase --env development
   ```

   With a local kit checkout:

   ```bash
   node /path/to/agentic-control-plane-kit/dist/echelon.mjs init --framework hybrid_netlify_supabase --env development
   ```

3. Apply SQL under `migrations/` to your Supabase/Postgres project.
4. Configure env from `.env.example` (and Echelon vars the installer appends to `.env.example`).
5. **Production**: replace bootstrap in-memory adapters per [ECHELON-INSTALLER-MODE-CONTRACT.md](../../docs/ECHELON-INSTALLER-MODE-CONTRACT.md).

## Expected artifacts after `init`

| Path | Purpose |
|------|---------|
| `netlify/functions/echelon-manage.ts` | Netlify handler for `/manage`. |
| `control_plane/kernel/` | Copied ACP kernel (TypeScript). |
| `control_plane/adapters/index.ts` | Generated adapters (bootstrap guard for hybrid). |
| `controlplane.bindings.json` | Kernel bindings + packs. |
| `migrations/*.sql` | Control plane tables (api_keys, audit_log, echelon_*). |
| `.acp/install.json` | Manifest (`framework: hybrid_netlify_supabase`, `adapter_binding`, etc.). |

## Verification checklist

- [ ] `echelon init` (or `install`) completes without errors.
- [ ] `netlify/functions/echelon-manage.ts` exists and references `createAdapters()` / `createManageRouter`.
- [ ] Migrations applied to your database before exercising IAM-heavy actions.
- [ ] `npx echelon doctor --json` shows expected kernel + manifest fields (run from repo root after install).

See also: [../../docs/GOLDEN-HYBRID-REFERENCE.md](../../docs/GOLDEN-HYBRID-REFERENCE.md), [../../docs/INSTALLER-DISCOVERY-CORPUS.md](../../docs/INSTALLER-DISCOVERY-CORPUS.md).
