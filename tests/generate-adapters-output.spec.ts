/**
 * Generated adapter files must be truthfully labeled (TGA-194 / PR 21 review).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateAdapters } from '../installer/generators/generate-adapters.js';

describe('generateAdapters output contract', () => {
  it('tags Express adapters as bootstrap_in_memory and wires production guard', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-gen-exp-'));
    const controlPlane = path.join(root, 'control_plane');
    fs.mkdirSync(controlPlane, { recursive: true });
    await generateAdapters({ framework: 'express', outputDir: controlPlane, integration: 't' });
    const src = fs.readFileSync(path.join(controlPlane, 'adapters', 'index.ts'), 'utf-8');
    expect(src).toMatch(/ECHELON_ADAPTER_SURFACE\s*=\s*['"]bootstrap_in_memory['"]/);
    expect(src).toContain('guardEchelonBootstrapAdapters');
    expect(src).toContain('createAdapters');
  });

  it('copies Supabase Deno adapters tagged supabase_postgrest_durable', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-gen-sb-'));
    const controlPlane = path.join(root, 'control_plane');
    fs.mkdirSync(controlPlane, { recursive: true });
    await generateAdapters({ framework: 'supabase', outputDir: controlPlane, integration: 't' });
    const src = fs.readFileSync(path.join(controlPlane, 'adapters', 'index.ts'), 'utf-8');
    expect(src).toMatch(/ECHELON_ADAPTER_SURFACE\s*=\s*['"]supabase_postgrest_durable['"]/);
    expect(src).toContain('createClient');
    expect(src).toContain("from('api_keys')");
    expect(src).not.toContain('DevDefaultDbAdapter');
  });
});
