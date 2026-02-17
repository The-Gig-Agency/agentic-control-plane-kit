/**
 * Detect Supabase framework
 */

import * as fs from 'fs';
import * as path from 'path';

export async function detectSupabase(cwd: string): Promise<boolean> {
  // Check for supabase/ directory
  const supabaseDir = path.join(cwd, 'supabase');
  if (fs.existsSync(supabaseDir)) {
    // Check for functions directory (Edge Functions)
    const functionsDir = path.join(supabaseDir, 'functions');
    if (fs.existsSync(functionsDir)) {
      return true;
    }
  }

  // Check for supabase/config.toml
  const configToml = path.join(cwd, 'supabase', 'config.toml');
  if (fs.existsSync(configToml)) {
    return true;
  }

  // Check package.json for Supabase dependencies
  const packageJson = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['@supabase/supabase-js'] || deps['supabase']) {
      return true;
    }
  }

  return false;
}
