/**
 * Machine-readable dry-run / install preview (TGA-193).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Framework } from './detect/index.js';
import { classifyRepo } from './detect/index.js';
import type { InstallOptions } from './cli-types.js';
import { defaultManageBasePath } from './default-base-path.js';

export interface DryRunPlannedWrite {
  path: string;
  category: 'kernel' | 'adapters' | 'bindings' | 'endpoint' | 'migrations' | 'env' | 'manifest' | 'other';
  description?: string;
}

export interface DryRunReport {
  /** Contract version for `--report-json` consumers (bump when shape changes). */
  schemaVersion: 1;
  /** @deprecated Prefer schemaVersion; kept for backward compatibility. */
  version: 1;
  framework: Framework;
  classification: Awaited<ReturnType<typeof classifyRepo>>;
  basePath: string;
  planned_writes: DryRunPlannedWrite[];
  routes: string[];
  migrations: { mode: 'generated' | 'skipped' };
  env_templates: string[];
  dependency_hints: string[];
  blockers: string[];
  warnings: string[];
}

function backendDir(cwd: string): string {
  return fs.existsSync(path.join(cwd, 'backend')) ? path.join(cwd, 'backend') : cwd;
}

export async function buildDryRunReport(
  cwd: string,
  framework: Framework,
  options: InstallOptions,
): Promise<DryRunReport> {
  const classification = await classifyRepo(cwd);
  const basePath = options.basePath || (framework ? defaultManageBasePath(framework) : '/api/manage');
  const backend = backendDir(cwd);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const planned: DryRunPlannedWrite[] = [];
  const routes: string[] = [];
  const envTemplates: string[] = [];
  const deps: string[] = [];

  if (!framework) {
    blockers.push('framework_undetected');
  }

  if (framework === 'django') {
    planned.push(
      { path: path.join(backend, 'control_plane', 'acp', '**/*.py'), category: 'kernel' },
      { path: path.join(backend, 'control_plane', 'adapters', '__init__.py'), category: 'adapters' },
      { path: path.join(backend, 'control_plane', 'views', 'manage.py'), category: 'endpoint' },
      { path: path.join(backend, 'control_plane', 'bindings.py'), category: 'bindings' },
    );
    routes.push(`${basePath} (Django view)`);
    envTemplates.push(path.join(backend, '.env.example'));
    if (!options.noMigrations) {
      planned.push({
        path: path.join(backend, 'your_app', 'migrations', 'XXXX_add_control_plane_tables.py'),
        category: 'migrations',
      });
    } else {
      warnings.push('migrations_skipped_by_flag');
    }
  }

  if (framework === 'express') {
    planned.push(
      { path: path.join(cwd, 'control_plane', 'kernel', 'src', '**/*.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'kernel', 'index.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'adapters', 'index.ts'), category: 'adapters' },
      { path: path.join(cwd, 'controlplane.bindings.json'), category: 'bindings' },
      { path: path.join(cwd, 'api', 'manage.ts'), category: 'endpoint' },
    );
    routes.push(`${basePath} (Express / Node handler)`);
    envTemplates.push(path.join(cwd, '.env.example'));
    deps.push('@supabase/supabase-js');
    if (!options.noMigrations) {
      planned.push({ path: path.join(cwd, 'migrations', '*.sql'), category: 'migrations' });
    } else {
      warnings.push('migrations_skipped_by_flag');
    }
  }

  if (framework === 'supabase') {
    planned.push(
      { path: path.join(cwd, 'control_plane', 'kernel', 'src', '**/*.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'kernel', 'index.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'adapters', 'index.ts'), category: 'adapters' },
      { path: path.join(cwd, 'controlplane.bindings.json'), category: 'bindings' },
      { path: path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'), category: 'endpoint' },
    );
    routes.push(`${basePath} (Supabase Edge Function)`);
    envTemplates.push(path.join(cwd, '.env.example'));
    if (!options.noMigrations) {
      planned.push({ path: path.join(cwd, 'migrations', '*.sql'), category: 'migrations' });
    } else {
      warnings.push('migrations_skipped_by_flag');
    }
  }

  if (framework === 'hybrid_netlify_supabase') {
    planned.push(
      { path: path.join(cwd, 'control_plane', 'kernel', 'src', '**/*.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'kernel', 'index.ts'), category: 'kernel' },
      { path: path.join(cwd, 'control_plane', 'adapters', 'index.ts'), category: 'adapters' },
      { path: path.join(cwd, 'controlplane.bindings.json'), category: 'bindings' },
      { path: path.join(cwd, 'netlify', 'functions', 'echelon-manage.ts'), category: 'endpoint' },
    );
    routes.push(`${basePath} (Netlify Function)`);
    envTemplates.push(path.join(cwd, '.env.example'));
    deps.push('@supabase/supabase-js', '@netlify/functions (devDependency)');
    warnings.push(
      'hybrid: ensure Netlify redirects or client calls match /.netlify/functions/echelon-manage (or override --base-path).',
    );
    if (!options.noMigrations) {
      planned.push({ path: path.join(cwd, 'migrations', '*.sql'), category: 'migrations' });
    } else {
      warnings.push('migrations_skipped_by_flag');
    }
  }

  planned.push({
    path: path.join(cwd, '.acp', 'install.json'),
    category: 'manifest',
    description: 'Written only on real install, not dry-run',
  });

  return {
    schemaVersion: 1,
    version: 1,
    framework,
    classification,
    basePath,
    planned_writes: planned,
    routes,
    migrations: { mode: options.noMigrations ? 'skipped' : 'generated' },
    env_templates: envTemplates,
    dependency_hints: deps,
    blockers,
    warnings,
  };
}
