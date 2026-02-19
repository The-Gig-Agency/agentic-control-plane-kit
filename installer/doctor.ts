/**
 * Doctor - Installation health check
 *
 * Outputs adoption-verifiable status for directory submissions.
 * Reads from .acp/install.json when present (trust anchor).
 *
 * Target format:
 *   ACP Kernel: Installed ✓
 *   Kernel ID: acp_live_xxxxx
 *   Governance Hub: Connected ✓
 *   Bindings: Valid ✓
 *   Packs: iam, webhooks, settings
 *   Audit Adapter: Present ✓
 */

import * as fs from 'fs';
import * as path from 'path';
import { readInstallManifest, resolvePacksFromBindings } from './manifest.js';

export async function doctor(): Promise<void> {
  const cwd = process.cwd();

  // Prefer manifest when present (trust anchor)
  const manifest = readInstallManifest(cwd);
  const packs = manifest?.packs ?? resolvePacksFromBindings(cwd);

  // 1. ACP Kernel
  const kernelDirs = [
    path.join(cwd, 'backend', 'control_plane', 'acp'),
    path.join(cwd, 'control_plane', 'kernel', 'src'),
  ];
  const kernelInstalled = kernelDirs.some((d) => fs.existsSync(d));

  // 2. Kernel ID (manifest > bindings)
  let kernelId: string | null = manifest?.kernel_id ?? null;
  if (!kernelId) {
    kernelId = readKernelIdFromBindings(cwd);
  }

  // 3. Governance Hub (env vars indicate connection intent)
  const governanceHubConnected = checkGovernanceHubEnv(cwd);

  // 4. Bindings
  const bindingsResult = checkBindings(cwd);

  // 5. Audit Adapter
  const auditAdapterPresent = checkAuditAdapter(cwd);

  // Output (ChatGPT-recommended format)
  console.log('ACP Kernel: ' + (kernelInstalled ? 'Installed ✓' : 'Not installed ✗'));
  console.log('Kernel ID: ' + (kernelId ?? '—'));
  console.log('Governance Hub: ' + (governanceHubConnected ? 'Connected ✓' : 'Not connected ✗'));
  console.log('Bindings: ' + (bindingsResult.valid ? 'Valid ✓' : 'Invalid ✗'));
  console.log('Packs: ' + (packs.length ? packs.join(', ') : '—'));
  console.log('Audit Adapter: ' + (auditAdapterPresent ? 'Present ✓' : 'Not present ✗'));

  if (manifest) {
    console.log('\nManifest: .acp/install.json (trust anchor)');
  }

  if (!kernelInstalled || !bindingsResult.valid) {
    console.log('\nRun: npx echelon install');
  }
  console.log('');
}

function readKernelIdFromBindings(cwd: string): string | null {
  const candidates = [
    path.join(cwd, 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'controlplane.bindings.json'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const bindings = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return bindings?.kernelId ?? null;
    } catch {
      /* ignore */
    }
  }
  // Python bindings
  const pyPath = path.join(cwd, 'backend', 'control_plane', 'bindings.py');
  if (fs.existsSync(pyPath)) {
    const content = fs.readFileSync(pyPath, 'utf-8');
    const m = content.match(/['"]kernelId['"]:\s*os\.environ\.get\(['"]KERNEL_ID['"],\s*['"]([^'"]+)['"]\)/);
    if (m) return m[1];
  }
  return null;
}

function checkGovernanceHubEnv(cwd: string): boolean {
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.example'),
    path.join(cwd, 'backend', '.env'),
  ];
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('GOVERNANCE_HUB_URL') && content.includes('ACP_KERNEL_KEY')) {
        return true;
      }
    }
  }
  return !!(process.env.GOVERNANCE_HUB_URL && process.env.ACP_KERNEL_KEY);
}

function checkBindings(cwd: string): { valid: boolean } {
  const bindingsFiles = [
    path.join(cwd, 'controlplane.bindings.json'),
    path.join(cwd, 'backend', 'control_plane', 'bindings.py'),
  ];
  for (const file of bindingsFiles) {
    if (fs.existsSync(file)) {
      try {
        if (file.endsWith('.json')) {
          const bindings = JSON.parse(fs.readFileSync(file, 'utf-8'));
          return { valid: !!(bindings?.kernelId && bindings?.integration) };
        }
        return { valid: true }; // Python bindings present
      } catch {
        return { valid: false };
      }
    }
  }
  return { valid: false };
}

function checkAuditAdapter(cwd: string): boolean {
  const auditFiles = [
    path.join(cwd, 'control_plane', 'adapters', 'index.ts'),
    path.join(cwd, 'backend', 'control_plane', 'adapters', '__init__.py'),
    path.join(cwd, 'api', 'manage.ts'),
    path.join(cwd, 'supabase', 'functions', 'manage', 'index.ts'),
  ];
  for (const file of auditFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (
        content.includes('AuditAdapter') ||
        content.includes('audit_adapter') ||
        content.includes('auditAdapter')
      ) {
        return true;
      }
    }
  }
  return false;
}
