/**
 * Discovery precedence (Django before hybrid).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyRepo, detectFramework } from '../installer/detect/index.js';

describe('classifyRepo precedence', () => {
  it('prefers django when manage.py exists alongside Netlify + Supabase signals', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-prec-'));
    fs.writeFileSync(path.join(cwd, 'manage.py'), '# django\n');
    fs.writeFileSync(path.join(cwd, 'netlify.toml'), '[build]\n');
    fs.mkdirSync(path.join(cwd, 'supabase'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'supabase', 'config.toml'), '[api]\n');

    await expect(detectFramework(cwd)).resolves.toBe('django');
    const c = await classifyRepo(cwd);
    expect(c.framework).toBe('django');
    expect(c.signals).toContain('netlify');
    expect(c.signals).toContain('supabase');
  });
});
