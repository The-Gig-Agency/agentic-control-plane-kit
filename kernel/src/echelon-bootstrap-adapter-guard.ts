/**
 * Runtime guard for in-memory bootstrap adapters (TGA-194 / PR 21 follow-up).
 *
 * Express and hybrid Netlify installs default to DevDefault* adapters for smoke tests.
 * Production must not run them unless the operator explicitly opts in.
 */

const warned = new Set<string>();
const WARN_ONCE_KEY = '__echelon_bootstrap_adapter';

function nodeEnv(): string | undefined {
  return typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : undefined;
}

function adapterProfile(): string | undefined {
  return typeof process !== 'undefined' && process.env ? process.env.ECHELON_ADAPTER_PROFILE : undefined;
}

function allowBootstrapFlag(): boolean {
  return typeof process !== 'undefined' && process.env?.ECHELON_ALLOW_BOOTSTRAP_ADAPTERS === '1';
}

/**
 * Call from constructors of generated wrappers around DevDefault* adapters (Node / Netlify only).
 */
export function guardEchelonBootstrapAdapters(component: string): void {
  const env = nodeEnv();
  if (env === 'test') {
    return;
  }
  if (env !== 'production') {
    warnBootstrapAdaptersOnce(component);
    return;
  }
  if (adapterProfile() === 'bootstrap' || allowBootstrapFlag()) {
    return;
  }
  throw new Error(
    `[Echelon] ${component} uses in-memory bootstrap adapters, which are unsafe in production ` +
      `(no durable DB, audit, idempotency, or rate-limit state). Replace adapters with a real persistence ` +
      `implementation, or set ECHELON_ADAPTER_PROFILE=bootstrap for an explicit ephemeral deployment, or set ` +
      `ECHELON_ALLOW_BOOTSTRAP_ADAPTERS=1 only if you accept data loss on restart.`,
  );
}

export function warnBootstrapAdaptersOnce(_component: string): void {
  if (warned.has(WARN_ONCE_KEY)) return;
  warned.add(WARN_ONCE_KEY);
  const msg =
    '[Echelon] Using in-memory bootstrap adapters (OK for local smoke). ' +
    'Replace with durable persistence before production; see docs/ECHELON-INSTALLER-MODE-CONTRACT.md.';
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(msg);
  }
}

/** @internal */
export function resetEchelonBootstrapAdapterGuardForTests(): void {
  warned.clear();
}
