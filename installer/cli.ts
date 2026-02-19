#!/usr/bin/env node
/**
 * Echelon CLI - Agentic Control Plane Installer
 * 
 * Automates embedding the kernel into SaaS applications.
 * 
 * Usage:
 *   npx echelon install
 *   npx echelon install --env development
 *   npx echelon uninstall
 *   npx echelon doctor
 *   npx echelon status
 */

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

  // Prompt for environment if not specified
  let env: Environment = options.env || 'development';
  if (!options.env) {
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

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'install') {
    const options: InstallOptions = {};

    // Parse CLI arguments
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--framework':
          options.framework = args[++i] as any;
          break;
        case '--env':
          options.env = args[++i] as Environment;
          break;
        case '--kernel-id':
          options.kernelId = args[++i];
          break;
        case '--integration':
          options.integration = args[++i];
          break;
        case '--governance-hub-url':
          options.governanceHubUrl = args[++i];
          break;
        case '--kernel-api-key':
          options.kernelApiKey = args[++i];
          break;
        case '--cia-url':
          options.ciaUrl = args[++i];
          break;
        case '--cia-service-key':
          options.ciaServiceKey = args[++i];
          break;
        case '--cia-anon-key':
          options.ciaAnonKey = args[++i];
          break;
        case '--skip-registration':
          options.skipRegistration = true;
          break;
      }
    }

    install(options).catch((error) => {
      console.error('❌ Installation failed:', error);
      process.exit(1);
    });
  } else if (command === 'uninstall') {
    uninstall().catch((error) => {
      console.error('❌ Uninstall failed:', error);
      process.exit(1);
    });
  } else if (command === 'doctor') {
    doctor().catch((error) => {
      console.error('❌ Doctor check failed:', error);
      process.exit(1);
    });
  } else if (command === 'status') {
    status().catch((error) => {
      console.error('❌ Status check failed:', error);
      process.exit(1);
    });
  } else {
    console.log(`
Echelon - Agentic Control Plane Installer

Commands:
  install     Install control plane (safe, reversible in dev mode)
  uninstall   Remove control plane installation
  doctor      Check installation health
  status      Show current installation status

Usage:
  npx echelon install [options]
  npx echelon uninstall
  npx echelon doctor
  npx echelon status

Install Options:
  --framework <django|express|supabase|auto>  Framework (default: auto-detect)
  --env <development|staging|production>       Environment (default: development)
  --kernel-id <id>                            Kernel ID (auto-generated in dev)
  --integration <name>                        Integration name
  --governance-hub-url <url>                  Governance Hub URL (Repo B)
  --kernel-api-key <key>                      Kernel API key for Repo B
  --cia-url <url>                             Key Vault Executor URL (Repo C)
  --cia-service-key <key>                     Service key for Repo C
  --cia-anon-key <key>                        Supabase anon key for Repo C
  --skip-registration                         Skip kernel registration

Examples:
  npx echelon install
  npx echelon install --env development
  npx echelon install --framework django --env staging
  npx echelon uninstall
    `);
    process.exit(0);
  }
}
