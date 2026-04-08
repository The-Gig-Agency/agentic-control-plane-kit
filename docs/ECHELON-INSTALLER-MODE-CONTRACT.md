# Echelon installer mode contract (TGA-194)

This document is the architecture guardrail for installer work: **bootstrap/dev** behavior and **production-oriented** behavior must never be confused in docs, CLI output, generated code, manifests, or readiness tooling.

## Modes

| Mode | Purpose | Persistence |
|------|---------|-------------|
| **Bootstrap / dev** | Local smoke, CI, demos | In-memory `DevDefault*` adapters (Express / hybrid Netlify path only) |
| **Production-oriented** | Real deployments | Durable, framework-faithful adapters (Django ORM + DB, Supabase PostgREST + Postgres) |

## Non-negotiables

1. A **production-oriented** install must **not** silently use dev-only or in-memory infrastructure.
2. **Framework targets** must preserve the persistence/runtime semantics implied by their names (`supabase` → Supabase/Postgres, not the same in-memory bundle as Express unless explicitly documented as a temporary exception).
3. **Truthfulness**: CLI help, dry-run `--report-json`, `.acp/install.json`, generated file headers, and `echelon doctor --json` must agree on adapter binding (`adapter_binding` / `adapterBinding`).
4. **Express / hybrid** generated adapters are **bootstrap_in_memory**; they **throw** at runtime when `NODE_ENV=production` unless the operator sets `ECHELON_ADAPTER_PROFILE=bootstrap` or `ECHELON_ALLOW_BOOTSTRAP_ADAPTERS=1`.
5. **Supabase** generated adapters use **PostgREST** against tables from the installer SQL migration (`supabase_postgrest_durable`).

## Environment variables (bootstrap escape hatch)

| Variable | Meaning |
|----------|---------|
| `ECHELON_ADAPTER_PROFILE=bootstrap` | Acknowledge intentional ephemeral / demo use in production-shaped environments. |
| `ECHELON_ALLOW_BOOTSTRAP_ADAPTERS=1` | Same intent; use when you accept data loss on restart. |

## Child tickets

Any change to generators, manifests, doctor, or dry-run reports that affects persistence or labeling **must** stay consistent with this contract and with [INSTALLER-DISCOVERY-CORPUS.md](./INSTALLER-DISCOVERY-CORPUS.md) for real-repo claims.
