# ACP Docs Index

This file defines the documentation split for the Agentic Control Plane (ACP) repos.

## Evaluator path

For external reviewers, read in this order:

1. [README.md](./README.md) (public CLI + SDK path first)
2. [INSTALL.md](./INSTALL.md)
3. [spec/ACP-SPEC.md](./spec/ACP-SPEC.md)
4. [THREE-REPO-CANONICAL-MODEL.md](./THREE-REPO-CANONICAL-MODEL.md) (maintainer / cross-repo depth)

## Canonical Source

`agentic-control-plane-kit` (Repo A) is the canonical source for cross-repo ACP architecture.

Use these files as the source of truth for ACP-wide concepts:

- [THREE-REPO-CANONICAL-MODEL.md](./THREE-REPO-CANONICAL-MODEL.md)
- [INTERNAL-ENDPOINTS-SECURITY.md](./INTERNAL-ENDPOINTS-SECURITY.md)
- [MCP-GATEWAY-THREE-REPO-ARCHITECTURE.md](./MCP-GATEWAY-THREE-REPO-ARCHITECTURE.md)
- [MCP-GATEWAY-SUMMARY.md](./MCP-GATEWAY-SUMMARY.md)
- [MCP-REGISTRATION-AND-CREDENTIAL-STORAGE-IMPLEMENTATION.md](./MCP-REGISTRATION-AND-CREDENTIAL-STORAGE-IMPLEMENTATION.md)
- [docs/MCP-SECURITY-GAP-ANALYSIS-AND-ROADMAP.md](./docs/MCP-SECURITY-GAP-ANALYSIS-AND-ROADMAP.md)
- [spec/ACP-SPEC.md](./spec/ACP-SPEC.md)

## Active Docs (Repo A)

These root docs are current and intended for active use:

- [README.md](./README.md)
- [INSTALL.md](./INSTALL.md)
- [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)
- [THREE-REPO-CANONICAL-MODEL.md](./THREE-REPO-CANONICAL-MODEL.md)
- [docs/Echelon-CONFIG-SCHEMA.md](./docs/Echelon-CONFIG-SCHEMA.md)
- [docs/MIGRATION-CONTROLPLANE-BINDINGS-TO-ECHELON-CONFIG.md](./docs/MIGRATION-CONTROLPLANE-BINDINGS-TO-ECHELON-CONFIG.md)
- [docs/SDK-EXPORT-MAP.md](./docs/SDK-EXPORT-MAP.md)
- [docs/INIT-PROTECT-STATE-MACHINE.md](./docs/INIT-PROTECT-STATE-MACHINE.md)
- [docs/GOLDEN-HYBRID-REFERENCE.md](./docs/GOLDEN-HYBRID-REFERENCE.md) (TGA-191 — hybrid Netlify + Supabase validation story)
- [docs/INSTALLER-DISCOVERY-CORPUS.md](./docs/INSTALLER-DISCOVERY-CORPUS.md) (TGA-189 — repo fingerprints + fixtures)
- [docs/ECHELON-PUBLIC-SURFACE-MAP.md](./docs/ECHELON-PUBLIC-SURFACE-MAP.md)
- [INTERNAL-ENDPOINTS-SECURITY.md](./INTERNAL-ENDPOINTS-SECURITY.md)
- [MCP-GATEWAY-THREE-REPO-ARCHITECTURE.md](./MCP-GATEWAY-THREE-REPO-ARCHITECTURE.md)
- [MCP-GATEWAY-SUMMARY.md](./MCP-GATEWAY-SUMMARY.md)
- [MCP-REGISTRATION-AND-CREDENTIAL-STORAGE-IMPLEMENTATION.md](./MCP-REGISTRATION-AND-CREDENTIAL-STORAGE-IMPLEMENTATION.md)
- [spec/ACP-SPEC.md](./spec/ACP-SPEC.md)

## Maintainer audits (tickets)

- [docs/maintainer/TGA-177-public-doc-leakage-audit.md](./docs/maintainer/TGA-177-public-doc-leakage-audit.md)
- [docs/maintainer/TGA-178-cli-packaging-audit.md](./docs/maintainer/TGA-178-cli-packaging-audit.md)

## Repo Roles

- Repo A: execution kernel, installer, canonical ACP docs
- Repo B: policy authority, audit storage, governance APIs
- Repo C: secrets and external API execution
- `echelon-control`: product UI, hosted-agent queue, tenant-facing integration surface
- `edge-bot`: hosted runtime, Railway packaging, worker processes

## Local Docs Rule

Each repo may keep local implementation docs, but those docs should:

- describe only that repo's behavior, APIs, schema, and operations
- link back here for ACP-wide architecture
- avoid re-stating the full three-repo model unless necessary

If a local doc conflicts with:

- repo code: repo code wins for that repo
- canonical ACP architecture here: this repo wins for cross-repo concepts

## Local Indexes

- Repo B: [../governance-hub/DOCS-INDEX.md](../governance-hub/DOCS-INDEX.md)
- Repo C: [../key-vault-executor/DOCS-INDEX.md](../key-vault-executor/DOCS-INDEX.md)
- Echelon: [../echelon-control/DOCS-INDEX.md](../echelon-control/DOCS-INDEX.md)
- `edge-bot`: [../edge-bot/DOCS-INDEX.md](../edge-bot/DOCS-INDEX.md)

## Maintenance Rule

When implementing a cross-repo change:

1. Update the canonical ACP doc here if the architecture changed.
2. Update the local repo docs only for the repos whose behavior changed.
3. Prefer links over duplicated explanations.
