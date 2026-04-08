/**
 * Adapter / Netlify surface placeholder scan (TGA-192).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanControlPlaneForPlaceholders } from '../installer/runtime-placeholder-scan.js';

describe('scanControlPlaneForPlaceholders', () => {
  it('flags throw new Error("Implement…") in control_plane/adapters', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-ph-'));
    const adapters = path.join(cwd, 'control_plane', 'adapters');
    fs.mkdirSync(adapters, { recursive: true });
    fs.writeFileSync(
      path.join(adapters, 'index.ts'),
      "export async function x() {\n  throw new Error('Implement DbAdapter.query');\n}\n",
    );
    const hits = scanControlPlaneForPlaceholders(cwd);
    expect(hits.some((h) => h.rule === 'adapter_implement_throw')).toBe(true);
  });

  it('flags TODO in adapters but not under control_plane/kernel', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-ph-kernel-'));
    const kernel = path.join(cwd, 'control_plane', 'kernel', 'src');
    fs.mkdirSync(kernel, { recursive: true });
    fs.writeFileSync(path.join(kernel, 'x.ts'), '// TODO: internal kernel note\n');
    expect(scanControlPlaneForPlaceholders(cwd)).toHaveLength(0);
  });

  it('scans netlify/functions', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-ph-nf-'));
    const fn = path.join(cwd, 'netlify', 'functions');
    fs.mkdirSync(fn, { recursive: true });
    fs.writeFileSync(path.join(fn, 'manage.ts'), '// TODO: wire handler\n');
    const hits = scanControlPlaneForPlaceholders(cwd);
    expect(hits.some((h) => h.rule === 'adapter_todo')).toBe(true);
  });
});
