/**
 * Installer dry-run JSON report (TGA-193).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildDryRunReport } from '../installer/dry-run-report.js';

describe('buildDryRunReport', () => {
  it('returns v1 report with planned writes for each framework', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-dryrun-'));

    for (const fw of ['django', 'express', 'supabase', 'hybrid_netlify_supabase'] as const) {
      const r = await buildDryRunReport(dir, fw, {});
      expect(r.version).toBe(1);
      expect(r.framework).toBe(fw);
      expect(r.planned_writes.length).toBeGreaterThan(0);
      expect(r.routes.length).toBeGreaterThan(0);
      expect(r.classification).toBeDefined();
    }
  });

  it('surfaces hybrid warning for Netlify path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-dryrun-h-'));
    const r = await buildDryRunReport(dir, 'hybrid_netlify_supabase', {});
    expect(r.warnings.some((w) => w.includes('Netlify'))).toBe(true);
    expect(r.basePath).toContain('netlify');
  });
});
