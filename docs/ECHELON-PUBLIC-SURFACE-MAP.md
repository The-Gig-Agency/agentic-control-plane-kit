# Echelon Public Surface Map

Status: maintainer planning reference

Purpose:

- map the current ACP public surface to the target Echelon product contract
- identify where ACP still leaks internal topology or low-level implementation details
- give follow-on tickets one source of truth for CLI, config, SDK, package, and gateway cleanup

## Current Public Surface

### CLI

Current public entrypoint:

- `cli/echelon.ts`

Current public commands:

- `init`
- `login`
- `link`
- `protect <connector>`
- `dev`
- `deploy`
- `status`
- `audit`
- `approve`

Legacy (operator-only / deprecated):
- `install`
- `uninstall`
- `doctor`

Current public framing:

- the published `echelon` entrypoint now exposes product-shell verbs as first-class commands
- legacy `install` remains available, but is described as deprecated/operator-only
- new public verbs avoid exposing governance/kernel/executor service key flags in their normal command args

Current leaked internal flags:

Only the legacy `install` command surfaces these as `[operator-only]` options; public verbs do not add them.

Evidence:

- `cli/echelon.ts`
- `installer/cli.ts`

### Config

Current generated config artifacts:

- `controlplane.bindings.json`
- `control_plane/bindings.py`

Current generated config shape:

- `kernelId`
- `integration`
- `base_path`
- `endpoint_path`
- `tenant`
- `auth`
- `database`

Current schema shape:

- repo-specific tenant table definitions
- API key table definitions
- adapter-specific database configuration
- pack and scope internals

Why this is a product-shell problem:

- the public config is a translation target, not a product model
- users are exposed to implementation details instead of project, env, connector, and rule concepts
- there is no single canonical `echelon.config.ts`

Evidence:

- `installer/generators/generate-bindings.ts`
- `config/bindings.schema.json`
- `README.md`

### SDK and Package Surface

Current package identity:

- package name: `agentic-control-plane-kit`
- package description: `/manage` starter kit for multi-tenant SaaS
- package `main`: `kernel/index.ts`
- package `types`: `kernel/index.ts`
- package `bin.echelon`: `./cli/echelon.ts`

Current public usage story:

- `npx echelon install`
- manual kernel embedding
- direct imports from `agentic-control-plane-kit`
- direct bindings and adapter wiring in docs

Current gap:

- packaging still tells a starter-kit story, not a product-shell story
- CLI publish path assumes a TypeScript file path
- public exports are kernel-oriented, not `defineConfig`, `protect`, `middleware`, or client helpers

Evidence:

- `package.json`
- `README.md`

### Gateway

Current public discovery surface:

- `GET /meta.discover`
- discovery payload exposes `registry_endpoints`
- discovery payload exposes `governance_endpoints`
- discovery payload returns raw `functions/v1` URLs

Current leaked endpoint vocabulary:

- `mcp-servers-list`
- `mcp-servers-register`
- `mcp-servers-update`
- `mcp-servers-delete`
- `connectors-list`
- `policy-propose`

Current leaked internal nouns:

- registry
- governance
- available servers
- connector list from Repo B

Why this is a product-shell problem:

- discovery returns backend wiring instead of a stable product contract
- agents can infer repo boundaries from endpoint names alone
- public discovery does not yet present the target facade of `/register`, `/evaluate`, `/execute`, `/audit`, `/discover`
- app-specific bootstrap helpers currently exist outside the public contract, so onboarding is not yet standardized

Evidence:

- `gateway/http-server.ts`
- `gateway/discovery.ts`
- `gateway/server-registry.ts`
- `gateway/proxy.ts`
- `gateway/docs/DISCOVERY-PROTOCOL.md`

### Public Docs

Current public repo framing still leaks:

- `/manage` starter kit language
- bindings JSON as a first-class user concern
- repo-topology documentation in the evaluator path
- Governance Hub and executor terminology in install and gateway docs

Evidence:

- `README.md`
- `INSTALL.md`
- `THREE-REPO-CANONICAL-MODEL.md`
- `gateway/README.md`
- `gateway/docs/AGENT-DISCOVERY-GUIDE.md`

## Target Public Contract

### CLI

Target public verbs:

- `echelon init`
- `echelon login`
- `echelon link`
- `echelon protect <connector>`
- `echelon dev`
- `echelon deploy`
- `echelon status`
- `echelon audit`
- `echelon approve`

Rules:

- installer-era commands become legacy or operator-only
- no public help text should mention kernel, governance hub, executor, or CIA
- no public workflow should require raw service URLs or service keys

### Config

Target public config:

- `echelon.config.ts`

Target concepts:

- `project`
- `env`
- `connectors`
- `policyDefaults`

Rules:

- public config is product-shaped
- internal binding translation happens behind the CLI and SDK
- `controlplane.bindings.json` becomes an implementation detail or migration source

### SDK

Target public exports:

- `defineConfig()`
- `protect()`
- `middleware()`
- `createClient()`
- `client.execute()`
- `client.audit()`

Rules:

- hide kernel-specific adapter names
- hide transport details between Repo A, Repo B, and Repo C
- keep copy-paste integrations product-oriented

### Gateway

Target public endpoint vocabulary:

- `/register`
- `/evaluate`
- `/execute`
- `/audit`
- `/discover`

Rules:

- onboarding/bootstrap flows should converge on `/register` as the public product story
- current app-local bootstrap wrappers may remain during migration, but should become thin adapters over the public registration contract

- no public discovery payload should expose raw `functions/v1` paths
- no public discovery payload should expose registry or governance as user-facing concepts
- public payloads should use product nouns such as project, connector, protect, approve, and audit

## Contract Delta By Area

### CLI Delta

Current:

- installer wrapper with `install`, `uninstall`, `doctor`, `status`

Target:

- lifecycle orchestrator with product verbs

Implementation implication:

- command registry must be refactored before new workflows can land cleanly

### Config Delta

Current:

- low-level bindings generator and schema

Target:

- single product config that fans out internally

Implementation implication:

- define `echelon.config.ts` first, then build the translation layer

### SDK Delta

Current:

- kernel-first package surface

Target:

- product-shaped helper surface

Implementation implication:

- map current adapter entrypoints to a stable shim layer before changing docs

### Gateway Delta

Current:

- public discovery leaks backend endpoint topology

Target:

- product facade with stable nouns and paths

Implementation implication:

- define facade schemas first, then adapt discovery and HTTP routing

### Packaging Delta

Current:

- package, entrypoints, and docs tell different stories

Target:

- package name, bin, and docs align with the Echelon public contract

Implementation implication:

- package and build cleanup should happen after the public contract and CLI shape are defined

## Recommended Execution Order

1. Freeze the public contract and keep this map updated as the baseline.
2. Refactor the CLI registry so product verbs exist as first-class commands.
3. Define `echelon.config.ts` and the public SDK export map.
4. Implement the config translation layer and workflow scaffolding.
5. Define and implement the gateway facade schemas.
6. Align packaging and rewrite public docs last, after the contract is real.

## Ticket Crosswalk

- `TGA-165`: use this doc as the contract-gap inventory
- `TGA-162`: refactor CLI command registry around the target verbs
- `TGA-164`: replace public config concepts with `echelon.config.ts`
- `TGA-166`: define public SDK exports and adapter shims
- `TGA-169`: define the gateway facade from the current discovery leaks
- `TGA-170`: implement workflow scaffolding on top of the refactored CLI
- `TGA-167`: use the public-doc leak inventory here as the rewrite input
- `TGA-168`: use the packaging delta here as the package cleanup input
