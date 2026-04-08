/**
 * Fail-closed scan for obvious runtime placeholders in generated control_plane (TGA-192).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Focus on installer-known sentinel strings; adapter TODOs are tracked separately (TGA-192). */
const PLACEHOLDER_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'your_app', re: /\byour_app\b/i },
  { name: 'your_domain', re: /\byour_domain\b/i },
  { name: 'yourDomainPack', re: /\byourDomainPack\b/ },
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

export function scanControlPlaneForPlaceholders(projectRoot: string): PlaceholderHit[] {
  const roots = [
    path.join(projectRoot, 'control_plane'),
    path.join(projectRoot, 'backend', 'control_plane'),
  ];
  const files: string[] = [];
  for (const r of roots) {
    walkFiles(r, files);
  }

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
