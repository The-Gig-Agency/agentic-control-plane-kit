/**
 * Status - Show current installation status
 * 
 * Displays:
 * - Installation environment
 * - Kernel ID
 * - Integration name
 * - Connected services (Repo B, Repo C)
 * - Framework detected
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectFramework } from './detect/index.js';

export async function status(): Promise<void> {
  console.log('📊 Echelon: Installation Status\n');

  const cwd = process.cwd();

  // Detect framework
  const framework = await detectFramework(cwd);
  console.log(`Framework: ${framework || 'Unknown'}\n`);

  // Read bindings
  const bindingsFiles = [
    path.join(cwd, 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'control_plane', 'bindings.py'),
  ];

  let kernelId: string | null = null;
  let integration: string | null = null;

  for (const file of bindingsFiles) {
    if (fs.existsSync(file)) {
      try {
        if (file.endsWith('.json')) {
          const bindings = JSON.parse(fs.readFileSync(file, 'utf-8'));
          kernelId = bindings.kernelId || null;
          integration = bindings.integration || null;
        } else if (file.endsWith('.py')) {
          // Parse Python bindings (simple regex)
          const content = fs.readFileSync(file, 'utf-8');
          const kernelIdMatch = content.match(/['"]kernelId['"]:\s*['"]([^'"]+)['"]/);
          const integrationMatch = content.match(/['"]integration['"]:\s*['"]([^'"]+)['"]/);
          kernelId = kernelIdMatch ? kernelIdMatch[1] : null;
          integration = integrationMatch ? integrationMatch[1] : null;
        }
        break;
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Detect environment from kernel ID
  const env = kernelId?.includes('-dev-') ? 'development' 
           : kernelId?.includes('-staging-') ? 'staging'
           : kernelId ? 'production'
           : 'unknown';

  console.log(`Environment: ${env.toUpperCase()}`);
  if (kernelId) {
    console.log(`Kernel ID: ${kernelId}`);
  }
  if (integration) {
    console.log(`Integration: ${integration}`);
  }

  // Check for Repo B connection
  console.log('\nConnected Services:');
  const envFiles = ['.env', '.env.example', 'backend/.env'];
  let repoBConnected = false;
  let repoCConnected = false;

  for (const envFile of envFiles) {
    const filePath = path.join(cwd, envFile);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('GOVERNANCE_HUB_URL') && content.includes('ACP_KERNEL_KEY')) {
        repoBConnected = true;
      }
      if (content.includes('CIA_URL') && content.includes('CIA_SERVICE_KEY')) {
        repoCConnected = true;
      }
    }
  }

  console.log(`  Governance Hub (Repo B): ${repoBConnected ? '✅ Connected' : '❌ Not connected'}`);
  console.log(`  Key Vault Executor (Repo C): ${repoCConnected ? '✅ Connected' : '❌ Not connected'}`);

  // Installation files
  console.log('\nInstallation Files:');
  const kernelDirs = [
    path.join(cwd, 'backend', 'control_plane', 'acp'),
    path.join(cwd, 'control_plane', 'kernel', 'src'),
  ];
  
  let kernelExists = false;
  for (const dir of kernelDirs) {
    if (fs.existsSync(dir)) {
      console.log(`  ✅ Kernel: ${dir}`);
      kernelExists = true;
      break;
    }
  }
  if (!kernelExists) {
    console.log('  ❌ Kernel: Not found');
  }

  const endpointFiles = [
    path.join(cwd, 'backend', 'api', 'views', 'manage.py'),
    path.join(cwd, 'api', 'manage.ts'),
    path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'),
  ];

  let endpointExists = false;
  for (const file of endpointFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Endpoint: ${file}`);
      endpointExists = true;
      break;
    }
  }
  if (!endpointExists) {
    console.log('  ❌ Endpoint: Not found');
  }

  console.log('');
}
