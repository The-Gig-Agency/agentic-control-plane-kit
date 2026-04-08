/**
 * TGA-191 — exercise echelon init against the golden hybrid template (SDR-like topology).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const echelonBundle = path.join(repoRoot, 'dist', 'echelon.mjs');
const goldenSrc = path.join(repoRoot, 'examples', 'golden-hybrid-sdr-like');

beforeAll(() => {
  const onCi = !!process.env.CI;
  if (!onCi || !fs.existsSync(echelonBundle)) {
    // Locally always rebuild (avoids stale dist). On CI reuse workflow-built bundle when present.
    execFileSync('npm', ['run', 'build:cli'], { cwd: repoRoot, stdio: 'inherit' });
  }
  if (!fs.existsSync(echelonBundle)) {
    throw new Error('dist/echelon.mjs missing; run npm run build:cli from repo root');
  }
});

describe('golden hybrid SDR-like template', () => {
  it('echelon init hybrid_netlify_supabase produces expected artifacts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-golden-'));
    fs.cpSync(goldenSrc, tmp, { recursive: true });

    execFileSync(process.execPath, [echelonBundle, 'init', '--framework', 'hybrid_netlify_supabase', '--env', 'development'], {
      cwd: tmp,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' },
    });

    expect(fs.existsSync(path.join(tmp, 'netlify', 'functions', 'echelon-manage.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'control_plane', 'adapters', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'control_plane', 'kernel', 'src', 'types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'controlplane.bindings.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.acp', 'install.json'))).toBe(true);

    const migDir = path.join(tmp, 'migrations');
    expect(fs.existsSync(migDir)).toBe(true);
    const sqlFiles = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, '.acp', 'install.json'), 'utf-8')) as {
      framework: string;
      adapter_binding?: string;
    };
    expect(manifest.framework).toBe('hybrid_netlify_supabase');
    expect(manifest.adapter_binding).toBe('bootstrap_in_memory');

    const adapters = fs.readFileSync(path.join(tmp, 'control_plane', 'adapters', 'index.ts'), 'utf-8');
    expect(adapters).toContain('guardEchelonBootstrapAdapters');
    expect(adapters).toContain('createAdapters');
  });
});
