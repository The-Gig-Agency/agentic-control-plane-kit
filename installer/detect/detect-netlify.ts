/**
 * Detect Netlify-hosted repo signals (netlify.toml or netlify/functions).
 */

import * as fs from 'fs';
import * as path from 'path';

export function detectNetlify(cwd: string): boolean {
  const netlifyToml = path.join(cwd, 'netlify.toml');
  if (fs.existsSync(netlifyToml)) {
    return true;
  }
  const functionsDir = path.join(cwd, 'netlify', 'functions');
  if (fs.existsSync(functionsDir)) {
    return true;
  }
  return false;
}
