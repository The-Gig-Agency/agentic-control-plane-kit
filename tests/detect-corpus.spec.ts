/**
 * Discovery corpus regression (TGA-189).
 */

import { describe, it, expect } from 'vitest';
import { classifyRepo, detectFramework } from '../installer/detect/index.js';
import { assertCorpusPathsExist, getCorpusFixtureDir, loadCorpusEntry } from '../installer/detect/corpus.js';

describe('discovery corpus', () => {
  it('sdr-like fixture is complete on disk', () => {
    assertCorpusPathsExist('sdr-like');
    const meta = loadCorpusEntry('sdr-like');
    expect(meta.id).toBe('sdr-like');
    expect(meta.expected.framework).toBe('hybrid_netlify_supabase');
  });

  it('detects hybrid_netlify_supabase for Netlify + Supabase signals', async () => {
    const root = getCorpusFixtureDir('sdr-like');
    await expect(detectFramework(root)).resolves.toBe('hybrid_netlify_supabase');
    const c = await classifyRepo(root);
    expect(c.framework).toBe('hybrid_netlify_supabase');
    expect(c.topology).toBe('netlify_serverless_plus_supabase');
    expect(c.recommendedTarget).toBe('hybrid_netlify_supabase');
    expect(c.confidence).toBe('high');
    expect(c.signals).toContain('netlify');
    expect(c.signals).toContain('supabase');
  });
});
