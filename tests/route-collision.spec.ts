/**
 * Route collision heuristics (hybrid Netlify path, etc.).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkRouteCollision } from '../installer/route-collision.js';
import { HYBRID_DEFAULT_MANAGE_PATH } from '../installer/default-base-path.js';

describe('checkRouteCollision', () => {
  it('production safety: hybrid install would see collision when echelon-manage already exists (uses hybrid default path)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-collide-'));
    const fnFile = path.join(cwd, 'netlify', 'functions', 'echelon-manage.ts');
    fs.mkdirSync(path.dirname(fnFile), { recursive: true });
    fs.writeFileSync(fnFile, '// stub\n');
    expect(checkRouteCollision(cwd, 'hybrid_netlify_supabase', HYBRID_DEFAULT_MANAGE_PATH)).toBe(true);
  });

  it('returns false when hybrid manage function is absent', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-nocollide-'));
    expect(checkRouteCollision(cwd, 'hybrid_netlify_supabase', HYBRID_DEFAULT_MANAGE_PATH)).toBe(false);
  });

  it('detects express api/manage.ts when present', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-exp-'));
    const f = path.join(cwd, 'api', 'manage.ts');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'export {};\n');
    expect(checkRouteCollision(cwd, 'express', '/api/manage')).toBe(true);
  });
});
