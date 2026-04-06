# TGA-177 — Public doc leakage audit (maintainer)

**Ticket:** [TGA-177](https://youtrack.thegig.agency/issue/TGA-177)  
**Goal:** Inventory where public-facing docs still expose internal multi-repo choreography, raw service URLs, or operator-only setup so we can prioritize rewrites toward the Echelon product surface.

## Summary

| Priority | Theme | Examples | Suggested action |
|----------|--------|----------|------------------|
| P0 | “Repo A / B / C” and canonical three-repo model in default onboarding | [THREE-REPO-CANONICAL-MODEL.md](../../THREE-REPO-CANONICAL-MODEL.md) linked early in [README.md](../../README.md) “Evaluator” path | Keep file for maintainers; frame README quick path as CLI/SDK-only; move deep links below the fold or into maintainer index |
| P1 | `controlplane.bindings.json` presented as the primary “truth” without `echelon.config` first | [INSTALL.md](../../INSTALL.md) manual section, legacy blocks in README | Lead with `echelon.config.ts` + migration doc; keep JSON path under “Legacy” |
| P1 | Installer copy references “Governance Hub (Repo B)” | [INSTALL.md](../../INSTALL.md) quick start | Rephrase to product language (“optional hosted registration”) per TGA-167 |
| P2 | Internal endpoint / security docs appropriate for operators mixed into root | [INTERNAL-ENDPOINTS-SECURITY.md](../../INTERNAL-ENDPOINTS-SECURITY.md), MCP hardening docs | Label clearly as maintainer/operator; ensure evaluator path does not require them for app integration |
| P2 | Examples that imply a fixed monorepo layout (`control_plane/`, copied kit paths) | [INSTALL.md](../../INSTALL.md), generator samples | Prefer neutral paths (`src/manage`, `echelon.config.ts`) in new examples |
| P3 | `gateway/` deploy docs (Railway, env) | [gateway/RAILWAY-DEPLOYMENT.md](../../gateway/RAILWAY-DEPLOYMENT.md) | Acceptable for self-hosters; cross-link from a “Deployment (advanced)” section rather than core onboarding |

## Examples / snippets to review next

- Root README legacy “Define Your Bindings” JSON block — keep but ensure preceded by public SDK + migration links.
- [INTEGRATION-GUIDE.md](../../INTEGRATION-GUIDE.md) (if present): scan for Repo letters and executor secrets in introductory paragraphs.

## Output for downstream work

This list should feed **TGA-167** (public rewrite) and README/INSTALL edits. Completed rewrites should shrink P0/P1 items and update this audit in follow-up PRs.
