# TGA-178 — CLI packaging and publish audit (maintainer)

**Ticket:** [TGA-178](https://youtrack.thegig.agency/issue/TGA-178)  
**Goal:** Record blockers and fixes for shipping a real `echelon` binary from npm, without assuming a git checkout or `tsx` on the consumer machine.

## Resolved in this iteration

| Item | Before | After |
|------|--------|--------|
| `bin` pointed at TypeScript | `./cli/echelon.ts` (requires `tsx` / non-standard runners) | `./dist/echelon.mjs` — ESM bundle via `esbuild` |
| Bundled CLI broke kernel copy paths | Installers used `../..` from `installer/installers/*.ts` | [installer/kit-root.ts](../../installer/kit-root.ts) resolves package root by `package.json` `name` |
| No pre-publish build | Tarball could omit runnable CLI | `prepublishOnly` → `npm run build:cli` |
| Bloated or unclear publish set | Implicit pack rules | Explicit `package.json` `files` list (kernel, packs, installer sources for templates, `dist/echelon.mjs`, docs, spec, etc.) |

## Commands (maintainers)

```bash
npm install
npm run build:cli    # produces dist/echelon.mjs (gitignored; created on publish via prepublishOnly)
node dist/echelon.mjs verbs --public-only
```

## Remaining blockers / follow-ups

1. **`npm run build` (`tsc`)** — Full-repo `tsc` still fails on kernel `.ts` import extensions, tests typing, and a few installer/kernel strictness issues. The **CLI publish path does not depend on** that build; long-term, align `tsc` or split `tsconfig` for library emit.
2. **`package.json` `main` / `exports`** — Still point at TypeScript sources for deep imports. Consumers who `import from 'agentic-control-plane-kit'` rely on a TS-aware bundler or downstream tooling. Follow-up: emit `.js` + declarations for the public SDK surface only.
3. **Package naming** — Published name remains `agentic-control-plane-kit`. A future scoped rename (e.g. `@echelon/...`) is a product decision (see TGA-168).
4. **Global install smoke** — After publish, verify `npx echelon verbs` and `install --help` against the tarball in a clean directory.

## Docs / packaging mismatches to watch

- README `npx echelon …` assumes the published package exposes `bin`; contributors must run `npm run build:cli` locally before `npm link` or path-based bin tests.
- [installer/README.md](../../installer/README.md) should stay aligned with `build:cli` for repo development.
