/**
 * Production guard for in-memory bootstrap adapters (TGA-194 / PR 21 follow-up).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevDefaultDbAdapter } from '../kernel/src/dev-default-adapters';
import {
  guardEchelonBootstrapAdapters,
  resetEchelonBootstrapAdapterGuardForTests,
} from '../kernel/src/echelon-bootstrap-adapter-guard';

class GuardedDb extends DevDefaultDbAdapter {
  constructor() {
    super();
    guardEchelonBootstrapAdapters('GuardedDb');
  }
}

describe('guardEchelonBootstrapAdapters', () => {
  beforeEach(() => {
    resetEchelonBootstrapAdapterGuardForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetEchelonBootstrapAdapterGuardForTests();
    vi.unstubAllEnvs();
  });

  it('allows construction in test env', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => new GuardedDb()).not.toThrow();
  });

  it('throws in production without explicit bootstrap override', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ECHELON_ADAPTER_PROFILE;
    delete process.env.ECHELON_ALLOW_BOOTSTRAP_ADAPTERS;
    expect(() => new GuardedDb()).toThrow(/in-memory bootstrap adapters/);
  });

  it('allows production when ECHELON_ADAPTER_PROFILE=bootstrap', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ECHELON_ADAPTER_PROFILE', 'bootstrap');
    expect(() => new GuardedDb()).not.toThrow();
  });

  it('allows production when ECHELON_ALLOW_BOOTSTRAP_ADAPTERS=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ECHELON_ALLOW_BOOTSTRAP_ADAPTERS', '1');
    expect(() => new GuardedDb()).not.toThrow();
  });
});
