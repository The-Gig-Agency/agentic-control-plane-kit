/**
 * ACP Install Manifest
 *
 * Machine-readable trust anchor written to .acp/install.json after install.
 * Used for directory verification and adoption proof.
 *
 * @see docs/INSTALLER-ARCHITECTURE.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface InstallManifest {
  kernel_version: string;
  kernel_hash: string;
  kernel_id: string;
  installed_at: string;
  framework: 'django' | 'express' | 'supabase';
  packs: string[];
}

const DEFAULT_PACKS = ['iam', 'webhooks', 'settings'];
const MANIFEST_DIR = '.acp';
const MANIFEST_FILE = 'install.json';

/**
 * Write install manifest to .acp/install.json
 */
export function writeInstallManifest(
  projectRoot: string,
  manifest: Omit<InstallManifest, 'kernel_hash'> & { kernel_hash?: string }
): void {
  const dir = path.join(projectRoot, MANIFEST_DIR);
  fs.mkdirSync(dir, { recursive: true });

  const kernelHash =
    manifest.kernel_hash ??
    createHash('sha256')
      .update(`${manifest.kernel_version}:${manifest.kernel_id}:${manifest.installed_at}`)
      .digest('hex')
      .slice(0, 16);

  const full: InstallManifest = {
    ...manifest,
    kernel_hash: kernelHash,
  };

  const filePath = path.join(dir, MANIFEST_FILE);
  fs.writeFileSync(filePath, JSON.stringify(full, null, 2), 'utf-8');
}

/**
 * Read install manifest from .acp/install.json
 */
export function readInstallManifest(projectRoot: string): InstallManifest | null {
  const filePath = path.join(projectRoot, MANIFEST_DIR, MANIFEST_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as InstallManifest;
  } catch {
    return null;
  }
}

/**
 * Get kernel version from package.json (kit or project)
 */
export function getKernelVersion(projectRoot?: string): string {
  const root = projectRoot ?? getKitRoot();
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return '0.1.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function getKitRoot(): string {
  const installerDir = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(installerDir, '..');
}

/**
 * Resolve packs from bindings if present, else default
 */
export function resolvePacksFromBindings(projectRoot: string): string[] {
  const candidates = [
    path.join(projectRoot, 'controlplane.bindings.json'),
    path.join(projectRoot, 'backend', 'controlplane.bindings.json'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const bindings = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const enabled = bindings?.packs?.enabled;
      if (Array.isArray(enabled) && enabled.length > 0) return enabled;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_PACKS;
}
