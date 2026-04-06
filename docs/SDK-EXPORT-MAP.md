# SDK export map and adapter shim (TGA-179)

This document describes the **stable import paths** published from `agentic-control-plane-kit` and how the **adapter shim** bridges public config to the legacy kernel.

## Package `exports` (Node / bundlers)

The root `package.json` `exports` field defines:

| Import path | Resolves to | Purpose |
|-------------|-------------|---------|
| `agentic-control-plane-kit` | `kernel/index.ts` | Full kernel surface + re-exports |
| `agentic-control-plane-kit/sdk` | `kernel/src/sdk.ts` | **Product-facing** API: `defineConfig`, `protect`, `toBindings`, `createClient`, `builtInPacks`, … |
| `agentic-control-plane-kit/packs` | `packs/index.ts` | Built-in packs (`iamPack`, `webhooksPack`, …) |

TypeScript projects that resolve `.ts` sources directly (e.g. via `tsx` or path mapping) use these paths as-is. Published npm builds may compile to `.js` under `dist/` in a future release; the export map will be updated accordingly.

## Adapter shim (`kernel/src/sdk.ts`)

The shim keeps **existing** `Bindings` + `createManageRouter` behavior while introducing a **public** `EchelonConfig`:

- **`defineConfig(config)`** — No-op wrapper; stable hook for tooling and docs.
- **`toBindings(config, opts?)`** — Maps `EchelonConfig.bindings` + optional `integration` override into kernel `Bindings`.
- **`fromBindings(bindings, packs?)`** — Gradual migration from legacy JSON/bindings objects.
- **`protect(config, deps, opts?)`** — Builds a `ManageRouter` using `toBindings` + your framework adapters.
- **`middleware(router, meta?)`** — Thin Fetch-style wrapper (experimental).
- **`createClient(opts)`** — HTTP client for `/manage`-style endpoints.
- **`builtInPacks(['iam','webhooks','settings'])`** — Avoid deep pack import paths in product code.

Host repos continue to implement `DbAdapter`, `AuditAdapter`, etc. The shim does **not** generate framework-specific adapters (see installer generators for scaffolding).

## Related docs

- [Echelon-CONFIG-SCHEMA.md](./Echelon-CONFIG-SCHEMA.md) — Public `echelon.config.ts` shape
- [INSTALLER-V2-CONTRACT.md](../installer/INSTALLER-V2-CONTRACT.md) — Kit vs project ownership
