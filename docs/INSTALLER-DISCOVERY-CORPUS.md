# Installer discovery corpus

Corpus fixtures live under `installer/detect/corpus/<id>/` with a `corpus.json` metadata file.

| ID | Intent |
|----|--------|
| `sdr-like` | Netlify + Supabase hybrid SaaS (no `supabase/config.toml`; env + client SDK signals like many production repos); expect `hybrid_netlify_supabase` with high confidence. |

**API**

- `classifyRepo(cwd)` — topology, recommended target, confidence, signal tags.  
- `detectFramework(cwd)` — single selected `Framework`.

### Classification precedence

1. **Django** — if `manage.py`, Django in requirements, etc. (see `detect-django.ts`).  
2. **Hybrid Netlify + Supabase** — only if Django did *not* match and both Netlify and Supabase signals are present.  
3. **Express**, then **Supabase**, else unknown.

So a repo that genuinely mixes Django with Netlify/Supabase frontends is treated as **Django-first** unless the operator overrides with `--framework hybrid_netlify_supabase`.

**Tests**: `tests/detect-corpus.spec.ts`

Add new fixtures by copying a subtree of a sanitized real repo, listing `requiredPaths` in `corpus.json`, and extending tests.

For a **full golden host layout** used in onboarding and `echelon init` validation (not just detection), see [`examples/golden-hybrid-sdr-like/`](../examples/golden-hybrid-sdr-like/) and [GOLDEN-HYBRID-REFERENCE.md](./GOLDEN-HYBRID-REFERENCE.md).
