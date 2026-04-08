#!/usr/bin/env node
/**
 * Echelon CLI - Agentic Control Plane Installer
 *
 * Automates embedding the kernel into SaaS applications.
 * Uses commander for argument parsing, validation, and help.
 */

import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { detectFramework } from './detect/index.js';
import { installDjango } from './installers/django-installer.js';
import { installExpress } from './installers/express-installer.js';
import { installSupabase } from './installers/supabase-installer.js';
import { installHybridNetlifySupabase } from './installers/hybrid-netlify-supabase-installer.js';
import { buildDryRunReport } from './dry-run-report.js';
import { checkRouteCollision } from './route-collision.js';
import { defaultManageBasePath } from './default-base-path.js';
import { registerKernel } from './register/register-kernel.js';
import { uninstall } from './uninstall.js';
import { doctor } from './doctor.js';
import { status } from './status.js';
import {
  writeInstallManifest,
  getKernelVersion,
  resolvePacksFromBindings,
  plannedAdapterBinding,
} from './manifest.js';
import { registerEchelonCommands } from './cli-registry.js';
import type { Environment, InstallOptions } from './cli-types.js';
import readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type { Environment, InstallOptions } from './cli-types.js';

function adapterBindingForFramework(
  framework: 'django' | 'express' | 'supabase' | 'hybrid_netlify_supabase',
): AdapterBinding {
  if (framework === 'express' || framework === 'hybrid_netlify_supabase') {
    return 'bootstrap_in_memory';
  }
  if (framework === 'supabase') {
    return 'supabase_postgrest_durable';
  }
  return 'django_durable';
}

export async function install(options: InstallOptions = {}): Promise<void> {
  const machineDryRun = !!(options.dryRun && options.reportJson);
  if (!machineDryRun) {
    console.log('🚀 Echelon: Agentic Control Plane Installer\n');
  }

  // Phase 2: Handle dry-run mode (show diff, no writes)
  if (options.dryRun) {
    if (!machineDryRun) {
      console.log('🔍 DRY RUN MODE - No files will be written\n');
    }
    await dryRunInstall(options);
    return;
  }

  // Prompt for environment if not specified (skip in CI/non-TTY)
  let env: Environment = options.env || 'development';
  if (!options.env && process.stdin.isTTY) {
    env = await promptEnvironment();
  }

  console.log(`🌍 Environment: ${env.toUpperCase()}\n`);
  
  // Phase 2: Handle migrations-only mode
  if (options.migrationsOnly) {
    console.log('📦 MIGRATIONS-ONLY MODE - Generating migrations only\n');
    await migrationsOnlyInstall(options, env);
    return;
  }

  // Detect framework if not specified
  const framework = options.framework === 'auto' || !options.framework
    ? await detectFramework()
    : options.framework;

  if (!framework) {
    console.error('❌ Could not detect framework. Please specify with --framework');
    process.exit(1);
  }

  console.log(`📦 Detected framework: ${framework}\n`);

  // Pre-install validation (Phase 1: Critical Safety)
  if (env === 'production') {
    await validatePreInstall(options, framework);
  }

  // In dev mode, use safe defaults
  if (env === 'development') {
    console.log('🔒 Development mode: Safe defaults enabled\n');
    if (!options.kernelId) {
      options.kernelId = `${framework}-dev-${Date.now()}`;
    }
    if (!options.integration) {
      options.integration = `${framework}-dev`;
    }
    // Use dev Governance Hub if not specified
    if (!options.governanceHubUrl) {
      options.governanceHubUrl = process.env.ECHELON_DEV_GOVERNANCE_HUB_URL || '';
    }
    // Use dev Vault if not specified
    if (!options.ciaUrl) {
      options.ciaUrl = process.env.ECHELON_DEV_VAULT_URL || '';
    }
  }

  // Run framework-specific installer
  let installResult;
  switch (framework) {
    case 'django':
      installResult = await installDjango({ ...options, env });
      break;
    case 'express':
      installResult = await installExpress({ ...options, env });
      break;
    case 'supabase':
      installResult = await installSupabase({ ...options, env });
      break;
    case 'hybrid_netlify_supabase':
      installResult = await installHybridNetlifySupabase({ ...options, env });
      break;
    default:
      console.error(`❌ Unsupported framework: ${framework}`);
      process.exit(1);
  }

  // Register kernel with Governance Hub (Repo B) if configured
  // In dev mode, registration is optional and non-blocking
  if (!options.skipRegistration && options.governanceHubUrl && options.kernelApiKey) {
    console.log('\n📡 Registering kernel with Governance Hub...');
    try {
      await registerKernel({
        governanceHubUrl: options.governanceHubUrl,
        kernelApiKey: options.kernelApiKey,
        kernelId: installResult.kernelId,
        integration: installResult.integration,
      });
      console.log('✅ Kernel registered successfully\n');
    } catch (error) {
      if (env === 'development') {
        console.warn(`⚠️  Kernel registration failed (non-fatal in dev): ${error}\n`);
        console.warn('   You can register manually later or skip for now.\n');
      } else {
        console.warn(`⚠️  Kernel registration failed: ${error}\n`);
      }
    }
  } else if (env === 'development') {
    console.log('\n💡 Development mode: Skipping kernel registration');
    console.log('   You can register manually later or use production environment.\n');
  }

  // Emit machine-readable install manifest (.acp/install.json)
  const projectRoot = process.cwd();
  const packs = resolvePacksFromBindings(projectRoot);
  writeInstallManifest(projectRoot, {
    kernel_version: getKernelVersion(),
    kernel_id: installResult.kernelId,
    installed_at: new Date().toISOString(),
    framework,
    packs,
    adapter_binding: plannedAdapterBinding(framework),
  });
  console.log('📋 Install manifest written to .acp/install.json\n');

  if (framework === 'express' || framework === 'hybrid_netlify_supabase') {
    console.log(
      '⚠️  Adapter binding: bootstrap_in_memory (OK for dev/smoke). Production requires durable DB-backed adapters or explicit ECHELON_ADAPTER_PROFILE=bootstrap / ECHELON_ALLOW_BOOTSTRAP_ADAPTERS=1.\n' +
        '   See docs/ECHELON-INSTALLER-MODE-CONTRACT.md\n',
    );
  }

  console.log('✅ Installation complete!\n');
  
  if (env === 'development') {
    console.log('🔒 Installed in DEVELOPMENT mode (safe, reversible, non-authoritative)\n');
    console.log('Next steps:');
    console.log('  1. Review generated files');
    console.log('  2. Run database migrations (optional in dev)');
    console.log('  3. Test: curl -X POST http://localhost:8000/api/manage -H "X-API-Key: test" -d \'{"action":"meta.actions"}\'');
    console.log('  4. To remove: npx echelon uninstall\n');
  } else {
    console.log('Next steps:');
    console.log('  1. Review generated files');
    console.log('  2. Run database migrations');
    console.log('  3. Set environment variables');
    console.log('  4. Test endpoint');
    console.log('  5. Configure policies in Governance Hub\n');
  }
}

/**
 * Pre-install validation (Phase 1: Critical Safety)
 * - Route collision detection
 * - Production mode confirmation
 */
async function validatePreInstall(options: InstallOptions, framework: string): Promise<void> {
  const cwd = process.cwd();
  const basePath = options.basePath || defaultManageBasePath(framework);

  console.log('🔍 Running pre-install validation...\n');

  // 1. Route collision check (basePath must match the path the installer will actually use)
  const collision = checkRouteCollision(cwd, framework, basePath);
  if (collision) {
    console.error(`❌ Route collision detected for planned route ${basePath}\n`);
    console.log('💡 Suggestions:');
    if (framework === 'hybrid_netlify_supabase') {
      console.log('   Remove or relocate the existing Netlify function (e.g. netlify/functions/echelon-manage.ts).');
      console.log('   Or pass --base-path with a different public path and align redirects.\n');
    } else {
      console.log(`   Use --base-path /api/acp`);
      console.log(`   Use --base-path /api/echelon`);
      console.log(`   Use --base-path /api/control-plane\n`);
    }
    throw new Error(
      `Route collision: ${basePath} already exists or conflicts with existing files. Use --base-path to specify an alternative.`,
    );
  }
  
  // 2. Production mode confirmation
  const confirmed = await promptConfirm('⚠️  Installing in PRODUCTION mode. Continue? [y/N]: ');
  if (!confirmed) {
    throw new Error('Installation cancelled by user');
  }
  
  console.log('✅ Pre-install validation passed\n');
}

/**
 * Prompt for yes/no confirmation
 */
async function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const confirmed = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
      resolve(confirmed);
    });
  });
}

/**
 * Phase 2: Dry-run mode - show what would be generated without writing
 */
async function dryRunInstall(options: InstallOptions): Promise<void> {
  const framework =
    options.framework === 'auto' || !options.framework ? await detectFramework() : options.framework;

  if (!framework) {
    console.error('❌ Could not detect framework. Please specify with --framework');
    process.exit(1);
  }

  const cwd = process.cwd();
  const report = await buildDryRunReport(cwd, framework, options);

  if (options.reportJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`📦 Framework: ${framework}`);
  console.log(`🔎 Topology: ${report.classification.topology} (confidence: ${report.classification.confidence})`);
  if (report.classification.signals.length) {
    console.log(`   Signals: ${report.classification.signals.join(', ')}`);
  }
  console.log(`🌐 Planned public route: ${report.basePath}\n`);

  if (report.blockers.length) {
    console.log('⛔ Blockers:');
    report.blockers.forEach((b) => console.log(`   - ${b}`));
    console.log('');
  }
  if (report.warnings.length) {
    console.log('⚠️  Warnings:');
    report.warnings.forEach((w) => console.log(`   - ${w}`));
    console.log('');
  }

  console.log('📋 Planned writes:');
  for (const w of report.planned_writes) {
    console.log(`   [${w.category}] ${w.path}${w.description ? ` — ${w.description}` : ''}`);
  }
  console.log('\n🔗 Routes:');
  report.routes.forEach((r) => console.log(`   - ${r}`));
  console.log('\n📝 Env templates:');
  report.env_templates.forEach((e) => console.log(`   - ${e}`));
  if (report.dependency_hints.length) {
    console.log('\n📦 Dependency hints:');
    report.dependency_hints.forEach((d) => console.log(`   - ${d}`));
  }
  console.log(`\n🗄️  Migrations: ${report.migrations.mode}\n`);
  console.log('✅ Dry-run complete. Use without --dry-run to apply changes.\n');
}

/**
 * Phase 2: Migrations-only mode - generate migrations without installing code
 */
async function migrationsOnlyInstall(options: InstallOptions, env: Environment): Promise<void> {
  const framework = options.framework === 'auto' || !options.framework
    ? await detectFramework()
    : options.framework;

  if (!framework) {
    console.error('❌ Could not detect framework. Please specify with --framework');
    process.exit(1);
  }

  console.log(`📦 Framework: ${framework}\n`);

  // Import migration generator
  const { generateMigrations, validateMigrations } = await import('./generators/generate-migrations.js');
  
  const cwd = process.cwd();
  const backendDir = fs.existsSync(path.join(cwd, 'backend')) 
    ? path.join(cwd, 'backend')
    : cwd;

  // Validate migrations before generating
  console.log('🔍 Validating migrations...');
  const validationResult = await validateMigrations(framework);
  if (!validationResult.valid) {
    console.error(`❌ Migration validation failed:\n${validationResult.errors.join('\n')}\n`);
    process.exit(1);
  }
  console.log('✅ Migration validation passed\n');

  // Generate migrations
  console.log('🗄️  Generating database migrations...');
  const migrationFiles = await generateMigrations({
    framework,
    outputDir: backendDir,
  });
  
  console.log(`✅ Migrations generated:\n`);
  migrationFiles.forEach(file => console.log(`   ${file}`));
  console.log('\n📋 Next steps:');
  console.log('   1. Review the generated migration files');
  console.log('   2. Run migrations: python manage.py migrate (Django) or supabase db push (Supabase)');
  console.log('   3. Install code: npx echelon install --no-migrations\n');
}


async function promptEnvironment(): Promise<Environment> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('Select environment:');
    console.log('  1) Development (safe, reversible, non-authoritative)');
    console.log('  2) Staging');
    console.log('  3) Production');
    console.log('');
    
    rl.question('Environment [1]: ', (answer) => {
      rl.close();
      const choice = answer.trim() || '1';
      switch (choice) {
        case '1':
          resolve('development');
          break;
        case '2':
          resolve('staging');
          break;
        case '3':
          resolve('production');
          break;
        default:
          console.warn('Invalid choice, defaulting to development');
          resolve('development');
      }
    });
  });
}

/**
 * Run the CLI (used by both installer/cli.ts and cli/echelon.ts)
 */
export function runCli(argv = process.argv): void {
  const program = new Command();

  program
    .name('echelon')
    .description('Agentic Control Plane Installer')
    .version('0.1.0');

  registerEchelonCommands(program, {
    install,
    uninstall,
    doctor: async (opts) => {
      await doctor(opts);
    },
    status,
  });

  program.parse(argv);
}

// CLI entrypoint when run directly (cross-platform)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  runCli();
}
