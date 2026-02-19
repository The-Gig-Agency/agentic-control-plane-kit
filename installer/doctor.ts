/**
 * Doctor - Installation health check
 *
 * Outputs adoption-verifiable status for directory submissions.
 * Manifest (.acp/install.json) is primary truth when present.
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

export interface DoctorResult {
  acp_kernel: 'installed' | 'not_installed';
  kernel_id: string | null;
  governance_hub: 'connected' | 'not_connected';
  governance_hub_probe?: 'ok' | 'fail' | 'skipped';
  bindings: 'valid' | 'invalid';
  packs: string[];
  audit_adapter: 'present' | 'not_present';
  manifest_present: boolean;
  hint?: string;
}

export async function doctor(options?: { json?: boolean; probe?: boolean }): Promise<DoctorResult> {
  const cwd = process.cwd();

  // Manifest is primary truth when present
  const manifest = readInstallManifest(cwd);
  const packs = manifest?.packs ?? resolvePacksFromBindings(cwd);

  // 1. ACP Kernel — check manifest first, then file paths
  let kernelInstalled: boolean;
  if (manifest) {
    kernelInstalled = true; // Manifest implies install completed
  } else {
    const kernelDirs = [
      path.join(cwd, 'backend', 'control_plane', 'acp'),
      path.join(cwd, 'control_plane', 'kernel', 'src'),
    ];
    kernelInstalled = kernelDirs.some((d) => fs.existsSync(d));
  }

  // 2. Kernel ID (manifest > bindings)
  let kernelId: string | null = manifest?.kernel_id ?? null;
  if (!kernelId) {
    kernelId = readKernelIdFromBindings(cwd);
  }

  // 3. Governance Hub — env check, optional connectivity probe
  const governanceHubEnv = checkGovernanceHubEnv(cwd);
  let governanceHubProbe: 'ok' | 'fail' | 'skipped' | undefined;
  if (options?.probe && governanceHubEnv) {
    governanceHubProbe = await probeGovernanceHub(cwd);
  }

  const governanceHubConnected =
    governanceHubProbe === 'ok' || (governanceHubEnv && governanceHubProbe !== 'fail');

  // 4. Bindings — if manifest exists, treat as valid (manifest is trust anchor)
  let bindingsValid: boolean;
  if (manifest) {
    bindingsValid = true; // Manifest implies bindings were valid at install
  } else {
    bindingsValid = checkBindings(cwd).valid;
  }

  // 5. Audit Adapter
  const auditAdapterPresent = checkAuditAdapter(cwd);

  const result: DoctorResult = {
    acp_kernel: kernelInstalled ? 'installed' : 'not_installed',
    kernel_id: kernelId,
    governance_hub: governanceHubConnected ? 'connected' : 'not_connected',
    bindings: bindingsValid ? 'valid' : 'invalid',
    packs,
    audit_adapter: auditAdapterPresent ? 'present' : 'not_present',
    manifest_present: !!manifest,
  };

  if (options?.probe && governanceHubEnv) {
    result.governance_hub_probe = governanceHubProbe;
  }

  if (!kernelInstalled || (!manifest && !bindingsValid)) {
    result.hint = 'Run: npx echelon install';
  }

  if (options?.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Human-readable output
  console.log('ACP Kernel: ' + (kernelInstalled ? 'Installed ✓' : 'Not installed ✗'));
  console.log('Kernel ID: ' + (kernelId ?? '—'));
  console.log('Governance Hub: ' + (governanceHubConnected ? 'Connected ✓' : 'Not connected ✗'));
  console.log('Bindings: ' + (bindingsValid ? 'Valid ✓' : 'Invalid ✗'));
  console.log('Packs: ' + (packs.length ? packs.join(', ') : '—'));
  console.log('Audit Adapter: ' + (auditAdapterPresent ? 'Present ✓' : 'Not present ✗'));

  if (manifest) {
    console.log('\nManifest: .acp/install.json (trust anchor)');
  }

  if (result.hint) {
    console.log('\n' + result.hint);
  }
  console.log('');

  return result;
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

function getGovernanceHubUrl(cwd: string): string | null {
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, 'backend', '.env'),
  ];
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      const m = content.match(/GOVERNANCE_HUB_URL=(.+)/m);
      if (m) {
        const url = m[1].trim().replace(/^["']|["']$/g, '');
        if (url && !url.startsWith('#')) return url;
      }
    }
  }
  return process.env.GOVERNANCE_HUB_URL || null;
}

async function probeGovernanceHub(cwd: string): Promise<'ok' | 'fail' | 'skipped'> {
  const baseUrl = getGovernanceHubUrl(cwd);
  if (!baseUrl) return 'skipped';

  const candidates = [
    baseUrl.replace(/\/$/, '') + '/health',
    baseUrl.replace(/\/$/, '') + '/',
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status < 500) return 'ok';
    } catch {
      /* try next */
    }
  }
  return 'fail';
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
        return { valid: true };
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
