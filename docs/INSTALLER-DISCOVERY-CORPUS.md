# Installer discovery corpus

Corpus fixtures live under `installer/detect/corpus/<id>/` with a `corpus.json` metadata file.

| ID | Intent |
|----|--------|
| `sdr-like` | Netlify + Supabase hybrid SaaS; expect `hybrid_netlify_supabase` with high confidence. |

**API**

- `classifyRepo(cwd)` — topology, recommended target, confidence, signal tags.  
- `detectFramework(cwd)` — single selected `Framework` (hybrid preferred when Netlify + Supabase both match).

**Tests**: `tests/detect-corpus.spec.ts`

Add new fixtures by copying a subtree of a sanitized real repo, listing `requiredPaths` in `corpus.json`, and extending tests.
