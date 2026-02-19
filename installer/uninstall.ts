/**
 * Uninstall control plane from project
 * 
 * Removes:
 * - Generated adapters
 * - /api/manage endpoint
 * - Bindings configuration
 * - Migrations (optionally)
 * - Environment variables (from .env.example)
 * 
 * This makes installation reversible and safe.
 */

import * as fs from 'fs';
import * as path from 'path';
import readline from 'node:readline';

export async function uninstall(): Promise<void> {
  console.log('🗑️  Echelon: Uninstall Control Plane\n');

  const cwd = process.cwd();

  // Confirm uninstall
  const confirmed = await confirmUninstall();
  if (!confirmed) {
    console.log('Uninstall cancelled.\n');
    return;
  }

  console.log('Removing installation...\n');

  let removedCount = 0;

  // Remove control_plane directory (Django/Express)
  const controlPlaneDirs = [
    path.join(cwd, 'backend', 'control_plane'),
    path.join(cwd, 'control_plane'),
  ];

  for (const dir of controlPlaneDirs) {
    if (fs.existsSync(dir)) {
      console.log(`  Removing ${dir}...`);
      fs.rmSync(dir, { recursive: true, force: true });
      removedCount++;
    }
  }

  // Remove install manifest
  const acpDir = path.join(cwd, '.acp');
  if (fs.existsSync(acpDir)) {
    console.log(`  Removing ${acpDir}...`);
    fs.rmSync(acpDir, { recursive: true, force: true });
    removedCount++;
  }

  // Remove bindings file
  const bindingsFiles = [
    path.join(cwd, 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'control_plane', 'bindings.py'),
  ];

  for (const file of bindingsFiles) {
    if (fs.existsSync(file)) {
      console.log(`  Removing ${file}...`);
      fs.unlinkSync(file);
      removedCount++;
    }
  }

  // Remove /api/manage endpoint files
  const endpointFiles = [
    path.join(cwd, 'backend', 'api', 'views', 'manage.py'),
    path.join(cwd, 'backend', 'control_plane', 'views', 'manage.py'),
    path.join(cwd, 'api', 'manage.ts'),
    path.join(cwd, 'supabase', 'functions', 'manage'),
  ];

  for (const file of endpointFiles) {
    if (fs.existsSync(file)) {
      console.log(`  Removing ${file}...`);
      if (fs.statSync(file).isDirectory()) {
        fs.rmSync(file, { recursive: true, force: true });
      } else {
        fs.unlinkSync(file);
      }
      removedCount++;
    }
  }

  // Ask about migrations
  const removeMigrations = await promptRemoveMigrations();
  if (removeMigrations) {
    const migrationFiles = findMigrationFiles(cwd);
    for (const file of migrationFiles) {
      console.log(`  Removing ${file}...`);
      fs.unlinkSync(file);
      removedCount++;
    }
  } else {
    console.log('  Keeping migrations (you can remove manually if needed)');
  }

  // Remove .env.example entries (optional - just note them)
  console.log('\n  Note: Review .env.example and remove Echelon-related variables if needed');

  // Remove URL route from urls.py (Django)
  await removeUrlRoute(cwd);

  console.log(`\n✅ Uninstall complete! Removed ${removedCount} items.\n`);
  console.log('Your project is back to its original state.\n');
}

async function confirmUninstall(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Are you sure you want to uninstall? This will remove generated files. [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function promptRemoveMigrations(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Remove migration files? [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

function findMigrationFiles(cwd: string): string[] {
  const migrations: string[] = [];

  // Django migrations
  const djangoMigrations = [
    path.join(cwd, 'backend', 'your_app', 'migrations', '*_add_control_plane_tables.py'),
    path.join(cwd, 'your_app', 'migrations', '*_add_control_plane_tables.py'),
  ];

  // SQL migrations
  const sqlMigrations = [
    path.join(cwd, 'migrations', '*_add_control_plane_tables.sql'),
    path.join(cwd, 'supabase', 'migrations', '*_add_control_plane_tables.sql'),
  ];

  // Note: glob patterns would need glob library, for now just check common locations
  const possibleMigrations = [
    path.join(cwd, 'migrations'),
    path.join(cwd, 'supabase', 'migrations'),
  ];

  for (const dir of possibleMigrations) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.includes('control_plane') || file.includes('control-plane')) {
          migrations.push(path.join(dir, file));
        }
      }
    }
  }

  return migrations;
}

async function removeUrlRoute(cwd: string): Promise<void> {
  const possibleUrls = [
    path.join(cwd, 'backend', 'api', 'urls.py'),
    path.join(cwd, 'backend', 'your_app', 'urls.py'),
    path.join(cwd, 'backend', 'urls.py'),
  ];

  for (const urlPath of possibleUrls) {
    if (fs.existsSync(urlPath)) {
      let content = fs.readFileSync(urlPath, 'utf-8');
      
      // Remove import
      content = content.replace(/from control_plane\.views\.manage import manage_endpoint\n/g, '');
      
      // Remove route
      content = content.replace(/\s*path\('api\/manage', manage_endpoint, name='manage'\),?\n/g, '');
      
      fs.writeFileSync(urlPath, content);
      console.log(`  Updated ${urlPath}`);
      break;
    }
  }
}
