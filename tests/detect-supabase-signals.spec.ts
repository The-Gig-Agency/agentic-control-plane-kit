/**
 * Supabase detection without local CLI config (TGA-189 / PR review).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectSupabase } from '../installer/detect/detect-supabase.js';
import { detectHybridNetlifySupabase } from '../installer/detect/detect-hybrid-netlify-supabase.js';

describe('detectSupabase extended signals', () => {
  it('detects from .env.example SUPABASE_* without supabase/config.toml', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-sb-env-'));
    fs.writeFileSync(
      path.join(cwd, '.env.example'),
      'SUPABASE_URL=https://x.supabase.co\nSUPABASE_ANON_KEY=x\n',
    );
    await expect(detectSupabase(cwd)).resolves.toBe(true);
  });

  it('detects VITE_SUPABASE_* in .env.example', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-sb-vite-'));
    fs.writeFileSync(
      path.join(cwd, '.env.example'),
      'VITE_SUPABASE_URL=https://x.supabase.co\n',
    );
    await expect(detectSupabase(cwd)).resolves.toBe(true);
  });

  it('detects from supabase/migrations directory', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-sb-mig-'));
    fs.mkdirSync(path.join(cwd, 'supabase', 'migrations'), { recursive: true });
    await expect(detectSupabase(cwd)).resolves.toBe(true);
  });

  it('detects @supabase/supabase-js in apps/<pkg>/package.json (monorepo)', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-sb-app-'));
    const appDir = path.join(cwd, 'apps', 'web');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ dependencies: { '@supabase/supabase-js': '^2.0.0' } }),
    );
    await expect(detectSupabase(cwd)).resolves.toBe(true);
  });

  it('returns false when no Supabase signals', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-sb-none-'));
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
    await expect(detectSupabase(cwd)).resolves.toBe(false);
  });

  it('hybrid matches Netlify + env Supabase without config.toml', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-hyb-env-'));
    fs.writeFileSync(path.join(cwd, 'netlify.toml'), '[build]\n');
    fs.writeFileSync(path.join(cwd, '.env.example'), 'SUPABASE_URL=https://x.supabase.co\n');
    await expect(detectHybridNetlifySupabase(cwd)).resolves.toBe(true);
  });
});
