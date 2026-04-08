/**
 * Pre-install route / endpoint collision checks (shared for tests + cli).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export function checkRouteCollision(cwd: string, framework: string, basePath: string): boolean {
  const normalizedPath = basePath.replace(/^\/+|\/+$/g, '');
  const pathPatterns = [
    normalizedPath,
    basePath,
    `'${basePath}'`,
    `"${basePath}"`,
    `path('${normalizedPath}'`,
    `path("${normalizedPath}"`,
  ];

  if (framework === 'django') {
    const possibleUrls = [
      path.join(cwd, 'backend', 'api', 'urls.py'),
      path.join(cwd, 'backend', 'urls.py'),
      path.join(cwd, 'api', 'urls.py'),
      path.join(cwd, 'urls.py'),
    ];

    for (const urlPath of possibleUrls) {
      if (fs.existsSync(urlPath)) {
        const content = fs.readFileSync(urlPath, 'utf-8');
        for (const pattern of pathPatterns) {
          if (content.includes(pattern)) {
            return true;
          }
        }
      }
    }
  } else if (framework === 'express' || framework === 'supabase' || framework === 'hybrid_netlify_supabase') {
    const searchPaths = [
      path.join(cwd, 'api', 'manage.ts'),
      path.join(cwd, 'api', 'manage.js'),
      path.join(cwd, 'routes', 'manage.ts'),
      path.join(cwd, 'pages', 'api', 'manage.ts'),
      path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'),
      path.join(cwd, 'netlify', 'functions', 'echelon-manage.ts'),
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        return true;
      }
    }

    const mainFiles = [
      path.join(cwd, 'app.ts'),
      path.join(cwd, 'app.js'),
      path.join(cwd, 'server.ts'),
      path.join(cwd, 'server.js'),
      path.join(cwd, 'index.ts'),
      path.join(cwd, 'index.js'),
    ];

    for (const mainFile of mainFiles) {
      if (fs.existsSync(mainFile)) {
        const content = fs.readFileSync(mainFile, 'utf-8');
        for (const pattern of pathPatterns) {
          if (content.includes(pattern)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
