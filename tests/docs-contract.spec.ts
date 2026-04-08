/**
 * Keep top-level docs aligned with package.json engines and install contract.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('docs vs package metadata', () => {
  it('INSTALL.md documents Node 20+ and does not claim Node 18+ as baseline', () => {
    const install = fs.readFileSync(path.join(root, 'INSTALL.md'), 'utf-8');
    expect(install).toMatch(/Node\.js\s*20/i);
    expect(install).not.toMatch(/Node\.js\s*18\+/i);
  });

  it('README supported matrix mentions Node 20 and package engines', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8');
    expect(readme).toMatch(/Node\.js[\s\S]*20/i);
    expect(readme).toContain('engines.node');
  });

  it('package.json declares Node ^20 engines', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      engines?: { node?: string };
    };
    expect(pkg.engines?.node).toMatch(/^[\^~]?20/);
  });

  it('optional peer @supabase/supabase-js is declared in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(pkg.peerDependencies?.['@supabase/supabase-js']).toBeTruthy();
    expect(pkg.peerDependenciesMeta?.['@supabase/supabase-js']?.optional).toBe(true);
  });
});
