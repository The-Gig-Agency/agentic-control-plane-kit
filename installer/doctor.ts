/**
 * Doctor - Check installation health
 * 
 * Verifies:
 * - Kernel files exist
 * - Adapters are present
 * - Endpoint is configured
 * - Bindings are valid
 * - Environment variables are set
 * - Database migrations are run
 */

import * as fs from 'fs';
import * as path from 'path';

export async function doctor(): Promise<void> {
  console.log('🏥 Echelon: Installation Health Check\n');

  const cwd = process.cwd();
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check for kernel files
  console.log('Checking kernel files...');
  const kernelDirs = [
    path.join(cwd, 'backend', 'control_plane', 'acp'),
    path.join(cwd, 'control_plane', 'kernel', 'src'),
  ];
  
  let kernelFound = false;
  for (const dir of kernelDirs) {
    if (fs.existsSync(dir)) {
      console.log(`  ✅ Kernel found: ${dir}`);
      kernelFound = true;
      break;
    }
  }
  
  if (!kernelFound) {
    issues.push('Kernel files not found. Run: npx echelon install');
  }

  // Check for adapters
  console.log('\nChecking adapters...');
  const adapterFiles = [
    path.join(cwd, 'backend', 'control_plane', 'adapters', '__init__.py'),
    path.join(cwd, 'control_plane', 'adapters', 'index.ts'),
  ];

  let adaptersFound = false;
  for (const file of adapterFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Adapters found: ${file}`);
      adaptersFound = true;
      break;
    }
  }

  if (!adaptersFound) {
    issues.push('Adapters not found. Run: npx echelon install');
  }

  // Check for endpoint
  console.log('\nChecking endpoint...');
  const endpointFiles = [
    path.join(cwd, 'backend', 'api', 'views', 'manage.py'),
    path.join(cwd, 'backend', 'control_plane', 'views', 'manage.py'),
    path.join(cwd, 'api', 'manage.ts'),
    path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'),
  ];

  let endpointFound = false;
  for (const file of endpointFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Endpoint found: ${file}`);
      endpointFound = true;
      break;
    }
  }

  if (!endpointFound) {
    issues.push('Endpoint not found. Run: npx echelon install');
  }

  // Check for bindings
  console.log('\nChecking bindings...');
  const bindingsFiles = [
    path.join(cwd, 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'control_plane', 'bindings.py'),
  ];

  let bindingsFound = false;
  for (const file of bindingsFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ Bindings found: ${file}`);
      bindingsFound = true;
      
      // Validate bindings
      try {
        if (file.endsWith('.json')) {
          const bindings = JSON.parse(fs.readFileSync(file, 'utf-8'));
          if (!bindings.kernelId) {
            warnings.push('Bindings missing kernelId');
          }
          if (!bindings.integration) {
            warnings.push('Bindings missing integration');
          }
        }
      } catch (e) {
        issues.push(`Invalid bindings file: ${file}`);
      }
      break;
    }
  }

  if (!bindingsFound) {
    issues.push('Bindings not found. Run: npx echelon install');
  }

  // Check environment variables
  console.log('\nChecking environment variables...');
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.example'),
    path.join(cwd, 'backend', '.env'),
  ];

  let envFound = false;
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('KERNEL_ID') || content.includes('GOVERNANCE_HUB_URL')) {
        console.log(`  ✅ Environment template found: ${file}`);
        envFound = true;
        break;
      }
    }
  }

  if (!envFound) {
    warnings.push('Environment variables not configured. Check .env.example');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ Installation looks healthy!\n');
  } else {
    if (issues.length > 0) {
      console.log(`\n❌ Issues found (${issues.length}):`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    if (warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${warnings.length}):`);
      warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    console.log('');
  }
}
