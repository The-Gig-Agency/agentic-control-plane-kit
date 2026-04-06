# Migration: `controlplane.bindings.json` → `echelon.config.ts`

This guide is for teams that adopted ACP using **`controlplane.bindings.json`** (or `bindings.json`) and want to move to the **public Echelon config** shape (`echelon.config.ts` + `defineConfig`).

## Why migrate

- **Product-shaped onboarding:** One TypeScript module is easier to validate, document, and pair with the Echelon CLI.
- **Stable SDK:** Server wiring uses `protect(config, deps)` and related helpers on the package export surface (see [README.md](../README.md) and [docs/Echelon-CONFIG-SCHEMA.md](./Echelon-CONFIG-SCHEMA.md)).

## You do not have to migrate immediately

The runtime bridge **`toBindings()` / `fromBindings()`** on the public SDK is the supported compatibility path. Existing JSON bindings remain valid while you migrate incrementally.

## Mapping (conceptual)

| JSON bindings area | Echelon config |
|--------------------|----------------|
| `tenant.*` | Tenant resolution / admin checks in config adapters or `defineConfig` fields (see schema doc) |
| `auth.*` | API key tables, prefix, hash columns — expressed in config + adapters |
| `database.*` | Adapter selection and env-driven connection |
| `packs.enabled` | Enabled packs / connectors on the config object |
| `domain.*` | Domain namespace / pack hooks |

Exact field names depend on your `defineConfig` version; treat [docs/Echelon-CONFIG-SCHEMA.md](./Echelon-CONFIG-SCHEMA.md) and [examples/echelon.config.minimal.ts](../examples/echelon.config.minimal.ts) as source of truth.

## Suggested steps

1. Add **`echelon.config.ts`** beside your app entry (or `src/`) using `defineConfig` from `agentic-control-plane-kit`.
2. **Dual-run:** In one environment, build the manage router from `echelon.config` while keeping JSON for rollback.
3. **Swap adapters:** Point `protect(config, deps)` at the same DB/audit/idempotency/rate-limit/ceilings implementations you used with JSON-driven `createManageRouter`.
4. **Remove JSON** once parity tests pass (conformance / your integration tests).

## References

- [docs/Echelon-CONFIG-SCHEMA.md](./Echelon-CONFIG-SCHEMA.md)
- [docs/SDK-EXPORT-MAP.md](./SDK-EXPORT-MAP.md)
- Package `exports`: `.`, `./sdk`, `./packs` in `package.json`
