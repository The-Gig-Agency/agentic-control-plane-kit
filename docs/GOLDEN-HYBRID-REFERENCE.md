# Golden hybrid reference (Netlify + Supabase)

This repo does **not** ship a full sample application. For **TGA-191** validation and onboarding demos, use:

1. **In-repo fingerprint fixture** — `installer/detect/corpus/sdr-like/`  
   Minimal tree that matches a common SDR-style SaaS layout: `netlify.toml`, `package.json` with `@supabase/supabase-js`, and `.env.example` with `SUPABASE_*` (no local `supabase/config.toml`).

2. **Installer target** — `hybrid_netlify_supabase`  
   - **Detection**: Netlify signals (`netlify.toml` or `netlify/functions/`) **and** Supabase signals (Edge Functions, `config.toml`, migrations dir, root or monorepo `package.json` deps, or `SUPABASE_*` / `VITE_SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` in common env templates).  
   - **HTTP surface**: generated Netlify Function at `netlify/functions/echelon-manage.ts`, public path default `/.netlify/functions/echelon-manage` (override with `--base-path`).

3. **Dry-run preview**  
   ```bash
   npx echelon init --dry-run --report-json
   ```
   Emits a structured plan (topology, planned paths, routes, warnings) for CI and agents (**TGA-193**).

4. **Next steps for a “real” golden app**  
   Publish a separate reference repository that clones this topology, runs `echelon init` (or `echelon install`) in CI, then executes your stack’s build/test. Link that repo from your internal runbooks when it exists.

See also: [INSTALLER-DISCOVERY-CORPUS.md](./INSTALLER-DISCOVERY-CORPUS.md).
