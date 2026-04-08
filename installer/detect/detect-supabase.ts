/**
 * Detect Supabase framework / data-plane usage (local CLI, client SDK, env, migrations, monorepos).
 *
 * Many production SaaS repos use hosted Supabase without `supabase/config.toml` (e.g. SDR-style layouts).
 */

import * as fs from 'fs';
import * as path from 'path';

function readPackageJsonDeps(filePath: string): Record<string, string> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return null;
  }
}

function depsHaveSupabase(deps: Record<string, string> | null): boolean {
  if (!deps) return false;
  return !!(deps['@supabase/supabase-js'] || deps['supabase']);
}

function packageJsonHasSupabaseClient(packageJsonPath: string): boolean {
  return depsHaveSupabase(readPackageJsonDeps(packageJsonPath));
}

/**
 * Shallow scan: `apps/<pkg>/package.json`, `packages/<pkg>/package.json`, etc.
 * Covers common monorepos without walking all of node_modules.
 */
function nestedPackageJsonsMentionSupabase(cwd: string): boolean {
  const roots = ['apps', 'packages', 'services', 'clients', 'frontend', 'web'];
  for (const root of roots) {
    const base = path.join(cwd, root);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const pj = path.join(base, ent.name, 'package.json');
      if (packageJsonHasSupabaseClient(pj)) return true;
    }
  }
  return false;
}

function envTemplatesMentionSupabase(cwd: string): boolean {
  const names = [
    '.env.example',
    '.env.sample',
    '.env.template',
    '.env.local.example',
    '.env.development.example',
  ];
  const re =
    /(?:^|\n)\s*(?:VITE_|NEXT_PUBLIC_)?SUPABASE_(URL|ANON|PUBLISHABLE|SERVICE_ROLE|JWT)\s*=/im;
  for (const n of names) {
    const p = path.join(cwd, n);
    if (!fs.existsSync(p)) continue;
    try {
      if (re.test(fs.readFileSync(p, 'utf-8'))) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function hasSupabaseMigrationsDir(cwd: string): boolean {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  return fs.existsSync(migrationsDir) && fs.statSync(migrationsDir).isDirectory();
}

export async function detectSupabase(cwd: string): Promise<boolean> {
  const supabaseDir = path.join(cwd, 'supabase');
  if (fs.existsSync(supabaseDir)) {
    const functionsDir = path.join(supabaseDir, 'functions');
    if (fs.existsSync(functionsDir)) {
      return true;
    }
  }

  const configToml = path.join(cwd, 'supabase', 'config.toml');
  if (fs.existsSync(configToml)) {
    return true;
  }

  if (hasSupabaseMigrationsDir(cwd)) {
    return true;
  }

  const rootPkg = path.join(cwd, 'package.json');
  if (packageJsonHasSupabaseClient(rootPkg)) {
    return true;
  }

  if (nestedPackageJsonsMentionSupabase(cwd)) {
    return true;
  }

  if (envTemplatesMentionSupabase(cwd)) {
    return true;
  }

  return false;
}
