/**
 * Hybrid topology: Netlify (serverless edge) + Supabase (data/functions config).
 * Typical of SDR-style SaaS repos (frontend + Netlify Functions + Supabase backend).
 */

import { detectNetlify } from './detect-netlify.js';
import { detectSupabase } from './detect-supabase.js';

export async function detectHybridNetlifySupabase(cwd: string): Promise<boolean> {
  const netlify = detectNetlify(cwd);
  const supabase = await detectSupabase(cwd);
  return netlify && supabase;
}
