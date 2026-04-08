import { describe, it, expect } from 'vitest';
import {
  defaultManageBasePath,
  DEFAULT_MANAGE_PATH,
  HYBRID_DEFAULT_MANAGE_PATH,
} from '../installer/default-base-path.js';

describe('defaultManageBasePath', () => {
  it('uses Netlify function path for hybrid only', () => {
    expect(defaultManageBasePath('hybrid_netlify_supabase')).toBe(HYBRID_DEFAULT_MANAGE_PATH);
    expect(defaultManageBasePath('express')).toBe(DEFAULT_MANAGE_PATH);
    expect(defaultManageBasePath('supabase')).toBe(DEFAULT_MANAGE_PATH);
    expect(defaultManageBasePath('django')).toBe(DEFAULT_MANAGE_PATH);
  });
});
