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
import { registerKernel } from './register/register-kernel.js';
import { uninstall } from './uninstall.js';
import { doctor } from './doctor.js';
import { status } from './status.js';
import { writeInstallManifest, getKernelVersion, resolvePacksFromBindings } from './manifest.js';
import readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Environment = 'development' | 'staging' | 'production';

export interface InstallOptions {
  framework?: 'django' | 'express' | 'supabase' | 'auto';
  env?: Environment;
  kernelId?: string;
  integration?: string;
  governanceHubUrl?: string;
  kernelApiKey?: string;
  ciaUrl?: string;
  ciaServiceKey?: string;
  ciaAnonKey?: string;
  skipRegistration?: boolean;
  basePath?: string;  // Base path for ACP endpoint (default: /api/manage)
  // Phase 2: Migration Control
  noMigrations?: boolean;  // Code-only install (skip migration generation)
  migrationsOnly?: boolean;  // Generate migrations only (skip code installation)
  dryRun?: boolean;  // Show what would be generated (no writes)
}

export async function install(options: InstallOptions = {}): Promise<void> {
  console.log('🚀 Echelon: Agentic Control Plane Installer\n');

  // Phase 2: Handle dry-run mode (show diff, no writes)
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be written\n');
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
  });
  console.log('📋 Install manifest written to .acp/install.json\n');

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
  const basePath = options.basePath || '/api/manage';
  
  console.log('🔍 Running pre-install validation...\n');
  
  // 1. Route collision check
  const collision = await checkRouteCollision(cwd, framework, basePath);
  if (collision) {
    console.error(`❌ Route collision detected: ${basePath} already exists\n`);
    console.log('💡 Suggestions:');
    console.log(`   Use --base-path /api/acp`);
    console.log(`   Use --base-path /api/echelon`);
    console.log(`   Use --base-path /api/control-plane\n`);
    throw new Error(`Route collision: ${basePath} already exists. Use --base-path to specify alternative.`);
  }
  
  // 2. Production mode confirmation
  const confirmed = await promptConfirm('⚠️  Installing in PRODUCTION mode. Continue? [y/N]: ');
  if (!confirmed) {
    throw new Error('Installation cancelled by user');
  }
  
  console.log('✅ Pre-install validation passed\n');
}

/**
 * Check if route already exists in codebase
 */
async function checkRouteCollision(cwd: string, framework: string, basePath: string): Promise<boolean> {
  // Normalize base path (remove leading/trailing slashes for matching)
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
    // Check urls.py files
    const possibleUrls = [
      path.join(cwd, 'backend', 'api', 'urls.py'),
      path.join(cwd, 'backend', 'urls.py'),
      path.join(cwd, 'api', 'urls.py'),
      path.join(cwd, 'urls.py'),
    ];
    
    for (const urlPath of possibleUrls) {
      if (fs.existsSync(urlPath)) {
        const content = fs.readFileSync(urlPath, 'utf-8');
        // Check for any of the path patterns
        for (const pattern of pathPatterns) {
          if (content.includes(pattern)) {
            return true;  // Collision found
          }
        }
      }
    }
  } else if (framework === 'express' || framework === 'supabase') {
    // Check for route definitions in common locations
    const searchPaths = [
      path.join(cwd, 'api', 'manage.ts'),
      path.join(cwd, 'api', 'manage.js'),
      path.join(cwd, 'routes', 'manage.ts'),
      path.join(cwd, 'pages', 'api', 'manage.ts'),
      path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'),
    ];
    
    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        return true;  // File exists, assume collision
      }
    }
    
    // Also check route registrations in main files
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
            return true;  // Collision found
          }
        }
      }
    }
  }
  
  return false;  // No collision
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
  const framework = options.framework === 'auto' || !options.framework
    ? await detectFramework()
    : options.framework;

  if (!framework) {
    console.error('❌ Could not detect framework. Please specify with --framework');
    process.exit(1);
  }

  console.log(`📦 Would detect framework: ${framework}\n`);
  console.log('📋 Files that would be generated:\n');

  // Show what would be generated
  const cwd = process.cwd();
  const backendDir = fs.existsSync(path.join(cwd, 'backend')) 
    ? path.join(cwd, 'backend')
    : cwd;

  if (framework === 'django') {
    console.log('  📁 Kernel files:');
    console.log(`     ${path.join(backendDir, 'control_plane', 'acp', '**/*.py')}`);
    console.log('\n  🔧 Adapters:');
    console.log(`     ${path.join(backendDir, 'control_plane', 'adapters', '__init__.py')}`);
    console.log('\n  🌐 Endpoint:');
    console.log(`     ${path.join(backendDir, 'control_plane', 'views', 'manage.py')}`);
    console.log('\n  ⚙️  Bindings:');
    console.log(`     ${path.join(backendDir, 'control_plane', 'bindings.py')}`);
    
    if (!options.noMigrations) {
      console.log('\n  🗄️  Migrations:');
      console.log(`     ${path.join(backendDir, 'your_app', 'migrations', 'XXXX_add_control_plane_tables.py')}`);
    } else {
      console.log('\n  ⚠️  Migrations: SKIPPED (--no-migrations)');
    }
    
    console.log('\n  🔗 URL Route:');
    console.log(`     Would add to: ${path.join(backendDir, 'api', 'urls.py')} (or similar)`);
    console.log(`     Route: path('${options.basePath || '/api/manage'}', manage_endpoint)`);
    
    console.log('\n  📝 Environment:');
    console.log(`     ${path.join(backendDir, '.env.example')}`);
  }

  console.log('\n✅ Dry-run complete. Use without --dry-run to actually install.\n');
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

  program
    .command('install')
    .description('Install control plane (safe, reversible in dev mode)')
    .option('-f, --framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('-e, --env <env>', 'Environment (development|staging|production)', 'development')
    .option('--kernel-id <id>', 'Kernel ID (auto-generated in dev)')
    .option('--integration <name>', 'Integration name')
    .option('--governance-hub-url <url>', 'Governance Hub URL (Repo B)')
    .option('--kernel-api-key <key>', 'Kernel API key for Repo B')
    .option('--cia-url <url>', 'Key Vault Executor URL (Repo C)')
    .option('--cia-service-key <key>', 'Service key for Repo C')
    .option('--cia-anon-key <key>', 'Supabase anon key for Repo C')
    .option('--skip-registration', 'Skip kernel registration')
    .option('--base-path <path>', 'Base path for endpoint (default: /api/manage)')
    .option('--no-migrations', 'Code-only install (skip migration generation)')
    .option('--migrations-only', 'Generate migrations only (skip code installation)')
    .option('--dry-run', 'Show what would be generated (no writes)')
    .action(async (opts) => {
      const options: InstallOptions = {
        framework: opts.framework as InstallOptions['framework'],
        env: opts.env as Environment,
        kernelId: opts.kernelId,
        integration: opts.integration,
        governanceHubUrl: opts.governanceHubUrl,
        kernelApiKey: opts.kernelApiKey,
        ciaUrl: opts.ciaUrl,
        ciaServiceKey: opts.ciaServiceKey,
        ciaAnonKey: opts.ciaAnonKey,
        skipRegistration: opts.skipRegistration,
        basePath: opts.basePath,
        noMigrations: opts.noMigrations,
        migrationsOnly: opts.migrationsOnly,
        dryRun: opts.dryRun,
      };
      try {
        await install(options);
      } catch (error) {
        console.error('❌ Installation failed:', error);
        process.exit(1);
      }
    });

  program
    .command('uninstall')
    .description('Remove control plane installation')
    .action(async () => {
      try {
        await uninstall();
      } catch (error) {
        console.error('❌ Uninstall failed:', error);
        process.exit(1);
      }
    });

  program
    .command('doctor')
    .description('Check installation health')
    .option('--json', 'Output machine-readable JSON')
    .option('--probe', 'Probe Governance Hub connectivity')
    .action(async (opts) => {
      try {
        await doctor({ json: opts.json, probe: opts.probe });
      } catch (error) {
        console.error('❌ Doctor check failed:', error);
        process.exit(1);
      }
    });

  program
    .command('status')
    .description('Show current installation status')
    .action(async () => {
      try {
        await status();
      } catch (error) {
        console.error('❌ Status check failed:', error);
        process.exit(1);
      }
    });

  program.parse(argv);
}

// CLI entrypoint when run directly (cross-platform)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  runCli();
}
