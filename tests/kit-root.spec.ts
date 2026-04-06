import { describe, expect, it } from 'vitest';
import { getAgenticKitPackageRoot } from '../installer/kit-root.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('getAgenticKitPackageRoot', () => {
  it('resolves to repo root with correct package name', () => {
    const root = getAgenticKitPackageRoot();
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { name?: string };
    expect(pkg.name).toBe('agentic-control-plane-kit');
    expect(existsSync(join(root, 'kernel'))).toBe(true);
  });
});
