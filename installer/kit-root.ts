import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the published `agentic-control-plane-kit` package root (directory
 * containing package.json with name `agentic-control-plane-kit`).
 *
 * Works when the CLI runs from TypeScript sources, from `dist/echelon.mjs`, or
 * from a global `node_modules` install — unlike `../..` from a nested installer
 * file path, which breaks after bundling.
 */
export function getAgenticKitPackageRoot(): string {
  const startDir = path.dirname(fileURLToPath(import.meta.url));
  let dir = startDir;
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'agentic-control-plane-kit') {
          return dir;
        }
      } catch {
        /* ignore invalid package.json */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Could not find agentic-control-plane-kit package root (expected package.json with name agentic-control-plane-kit).',
  );
}
