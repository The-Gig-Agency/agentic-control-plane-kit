/**
 * Default public URL path for /manage, per installer framework.
 * Keep in sync with generators and production preflight (route collision).
 */

export const DEFAULT_MANAGE_PATH = '/api/manage';

/** Netlify Function path for hybrid Netlify + Supabase topology. */
export const HYBRID_DEFAULT_MANAGE_PATH = '/.netlify/functions/echelon-manage';

export function defaultManageBasePath(framework: string): string {
  if (framework === 'hybrid_netlify_supabase') {
    return HYBRID_DEFAULT_MANAGE_PATH;
  }
  return DEFAULT_MANAGE_PATH;
}
