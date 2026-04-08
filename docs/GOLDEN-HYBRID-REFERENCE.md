# Golden hybrid reference (Netlify + Supabase)

## Published golden template (TGA-191)

The **copy-paste golden host repo** for SDR-like hybrid topology lives at:

**[`examples/golden-hybrid-sdr-like/`](../examples/golden-hybrid-sdr-like/)**

It includes:

- `netlify.toml` + `public/` (minimal Netlify build)
- Root `package.json` with `@supabase/supabase-js`
- `.env.example` with `SUPABASE_*`
- Placeholder **`services/worker/`** and **`apps/web/`** READMEs for monorepo + worker story
- Documentation for **validation**, **manual onboarding**, and **post-install verification**

**CI / validation**

```bash
npm run build:cli
npm run test:golden-hybrid
# or
bash scripts/validate-golden-hybrid.sh
```

The Vitest spec copies that template to a temp dir and runs `echelon init --framework hybrid_netlify_supabase`.

## In-repo discovery fixture (corpus)

For **detector regression only**, the minimal fingerprint still lives at `installer/detect/corpus/sdr-like/` (see [INSTALLER-DISCOVERY-CORPUS.md](./INSTALLER-DISCOVERY-CORPUS.md)).

## Installer target — `hybrid_netlify_supabase`

- **Detection**: Netlify signals (`netlify.toml` or `netlify/functions/`) **and** Supabase signals (Edge Functions, `config.toml`, migrations dir, root or monorepo `package.json` deps, or `SUPABASE_*` / `VITE_SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` in common env templates).
- **HTTP surface**: generated Netlify Function at `netlify/functions/echelon-manage.ts`, public path default `/.netlify/functions/echelon-manage` (override with `--base-path`).

## Dry-run preview

```bash
npx echelon init --dry-run --report-json
```

Emits a structured plan (topology, planned paths, routes, warnings) for CI and agents.

## Contracts and onboarding

- [ECHELON-INSTALLER-MODE-CONTRACT.md](./ECHELON-INSTALLER-MODE-CONTRACT.md) — bootstrap vs production adapter binding.
- [INSTALLER-DISCOVERY-CORPUS.md](./INSTALLER-DISCOVERY-CORPUS.md) — fingerprint fixtures vs golden template.
