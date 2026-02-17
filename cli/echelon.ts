#!/usr/bin/env node
/**
 * Echelon CLI - Published entrypoint
 * 
 * This is the published CLI that users run with:
 *   npx echelon install
 *   npx echelon uninstall
 *   npx echelon doctor
 *   npx echelon status
 * 
 * It delegates to the installer in ../installer/cli.ts
 */

import { install } from '../installer/cli.js';
import { uninstall } from '../installer/uninstall.js';
import { doctor } from '../installer/doctor.js';
import { status } from '../installer/status.js';

// Re-export for direct import
export { install, uninstall, doctor, status };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'install') {
    const options: any = {};
    
    // Parse arguments
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--framework':
          options.framework = args[++i];
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
  --env <development|staging|production>     Environment (default: development)
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
  npx echelon doctor
  npx echelon status
    `);
    process.exit(0);
  }
}
