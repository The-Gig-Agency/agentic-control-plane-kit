/**
 * Fail-closed scan for installer-generated surfaces that must be completed for a runnable install (TGA-192).
 *
 * Scoped to **adapters** and **Netlify function** outputs — not the copied kernel tree (avoids false positives).
 */

import * as fs from 'node:fs';
import * as path from 'path';

/**
 * Sentinel strings from templates (your_app / packs) plus non-runnable adapter stubs.
 */
const PLACEHOLDER_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'your_app', re: /\byour_app\b/i },
  { name: 'your_domain', re: /\byour_domain\b/i },
  { name: 'yourDomainPack', re: /\byourDomainPack\b/ },
  { name: 'adapter_todo', re: /\bTODO\b/ },
  { name: 'adapter_not_implemented', re: /NotImplementedError/ },
  {
    name: 'adapter_implement_throw',
    re: /throw\s+new\s+Error\s*\(\s*['"]Implement/i,
  },
];

const SCANNABLE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.mts', '.cts']);

export interface PlaceholderHit {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function walkFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'dist') continue;
      walkFiles(p, out);
    } else {
      const ext = path.extname(name.name);
      if (SCANNABLE_EXT.has(ext)) out.push(p);
    }
  }
}

/** Only paths the Echelon installer generates or expects operators to complete first. */
function collectGeneratedSurfaceFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const adapterRoots = [
    path.join(projectRoot, 'control_plane', 'adapters'),
    path.join(projectRoot, 'backend', 'control_plane', 'adapters'),
  ];
  for (const dir of adapterRoots) {
    walkFiles(dir, files);
  }
  walkFiles(path.join(projectRoot, 'netlify', 'functions'), files);
  return files;
}

export function scanControlPlaneForPlaceholders(projectRoot: string): PlaceholderHit[] {
  const files = collectGeneratedSurfaceFiles(projectRoot);
  const hits: PlaceholderHit[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const { name, re } of PLACEHOLDER_PATTERNS) {
        if (re.test(line)) {
          hits.push({
            file: path.relative(projectRoot, file),
            line: idx + 1,
            rule: name,
            text: line.trim().slice(0, 200),
          });
        }
      }
    });
  }
  return hits;
}
