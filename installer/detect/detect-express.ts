/**
 * Detect Express/Node.js framework
 */

import * as fs from 'fs';
import * as path from 'path';

export async function detectExpress(cwd: string): Promise<boolean> {
  // Check for package.json
  const packageJson = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJson)) {
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));

  // Check for Express in dependencies
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.express || deps['@express/express']) {
    return true;
  }

  // Check for Next.js
  if (deps.next) {
    return true;
  }

  // Check for common Node.js patterns
  if (pkg.main && (pkg.main.includes('server') || pkg.main.includes('app'))) {
    return true;
  }

  return false;
}
