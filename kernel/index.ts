/**
 * Kernel entry point
 * Exports everything needed to embed the kernel in a host app
 */

export * from './src/types';
export * from './src/dev-default-adapters';
export * from './src/echelon-bootstrap-adapter-guard';
export * from './src/auth';
export * from './src/audit';
export * from './src/audit-event';
export * from './src/audit-adapter';
export * from './src/idempotency';
export * from './src/rate_limit';
export * from './src/ceilings';
export * from './src/validate';
export * from './src/openapi';
export * from './src/router';
export * from './src/pack';
export * from './src/meta-pack';
export * from './src/executor-adapter';
export * from './src/control-plane-adapter';

// Product-facing SDK facade
export * from './src/sdk';

// Re-export main router creator
export { createManageRouter } from './src/router';
export type { ManageRouter, RequestMeta } from './src/router';
