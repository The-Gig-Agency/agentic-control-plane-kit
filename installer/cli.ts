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
}

export async function install(options: InstallOptions = {}): Promise<void> {
  console.log('🚀 Echelon: Agentic Control Plane Installer\n');

  // Prompt for environment if not specified (skip in CI/non-TTY)
  let env: Environment = options.env || 'development';
  if (!options.env && process.stdin.isTTY) {
    env = await promptEnvironment();
  }

  console.log(`🌍 Environment: ${env.toUpperCase()}\n`);

  // Detect framework if not specified
  const framework = options.framework === 'auto' || !options.framework
    ? await detectFramework()
    : options.framework;

  if (!framework) {
    console.error('❌ Could not detect framework. Please specify with --framework');
    process.exit(1);
  }

  console.log(`📦 Detected framework: ${framework}\n`);

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
