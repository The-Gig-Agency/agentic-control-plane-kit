/**
 * CLI registry invariants (TGA-171).
 */

import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import {
  ECHELON_PUBLIC_VERBS,
  ECHELON_LEGACY_VERBS,
  ECHELON_META_VERBS,
  listAllVerbMeta,
  registerEchelonCommands,
} from '../installer/cli-registry.js';

describe('cli-registry', () => {
  it('lists expected public verbs', () => {
    const names = ECHELON_PUBLIC_VERBS.map((v) => v.name);
    expect(names).toContain('init');
    expect(names).toContain('login');
    expect(names).toContain('audit');
  });

  it('includes legacy and meta verbs in full list', () => {
    const all = listAllVerbMeta().map((v) => v.name);
    expect(all).toContain('install');
    expect(all).toContain('verbs');
    expect(all.length).toBe(
      ECHELON_PUBLIC_VERBS.length + ECHELON_LEGACY_VERBS.length + ECHELON_META_VERBS.length
    );
  });

  it('registerEchelonCommands wires commander without throwing', () => {
    const program = new Command();
    registerEchelonCommands(program, {
      install: vi.fn().mockResolvedValue(undefined),
      uninstall: vi.fn().mockResolvedValue(undefined),
      doctor: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue(undefined),
    });
    expect(program.commands.length).toBeGreaterThan(0);
  });
});
