/**
 * E2E-ish: `echelon init` / `install` with `--dry-run --report-json` (stdout = JSON only).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const echelonCli = path.join(repoRoot, 'cli', 'echelon.ts');

const REQUIRED_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'version',
  'framework',
  'classification',
  'basePath',
  'planned_writes',
  'routes',
  'migrations',
  'env_templates',
  'dependency_hints',
  'blockers',
  'warnings',
] as const;

function runEchelon(args: string[], cwd: string): string {
  return execFileSync('npx', ['tsx', echelonCli, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env },
  });
}

function parseReport(stdout: string) {
  const trimmed = stdout.trim();
  expect(trimmed.startsWith('{')).toBe(true);
  return JSON.parse(trimmed) as Record<string, unknown>;
}

describe('CLI dry-run --report-json', () => {
  it('init prints valid JSON with stable shape', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-init-json-'));
    const out = runEchelon(['init', '--dry-run', '--report-json', '--framework', 'express'], cwd);
    expect(out).not.toMatch(/🚀|DRY RUN/);
    const report = parseReport(out);
    for (const k of REQUIRED_TOP_LEVEL_KEYS) {
      expect(report).toHaveProperty(k);
    }
    expect(report.schemaVersion).toBe(1);
    expect(report.version).toBe(1);
    expect(report.framework).toBe('express');
  });

  it('legacy install prints the same top-level shape as init', () => {
    const cwdA = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-inst-a-'));
    const cwdB = fs.mkdtempSync(path.join(os.tmpdir(), 'echelon-inst-b-'));
    const outInit = runEchelon(['init', '--dry-run', '--report-json', '--framework', 'supabase'], cwdA);
    const outInstall = runEchelon(
      ['install', '--dry-run', '--report-json', '-f', 'supabase'],
      cwdB,
    );
    const keysInit = Object.keys(parseReport(outInit)).sort();
    const keysInstall = Object.keys(parseReport(outInstall)).sort();
    expect(keysInit).toEqual(keysInstall);
  });
});
