/**
 * Kernel Bridge - Re-exports kernel modules using absolute paths
 * 
 * This bridge file isolates the absolute file:///kernel/... imports
 * so the rest of the gateway code can use relative imports.
 * 
 * In the container:
 * - Gateway is at /app/gateway/
 * - Kernel is at /kernel/
 * - Relative path ../kernel/ doesn't work (would go to /app/kernel/)
 * - So we use absolute path file:///kernel/... here
 */

// Debug: Show the path being used
console.log("KERNEL_BRIDGE_PATH", "file:///kernel/src/sanitize.ts");

// Control Plane Adapter
export type {
  ControlPlaneAdapter,
  AuthorizationRequest,
  AuthorizationResponse,
} from 'file:///kernel/src/control-plane-adapter.ts';
export { HttpControlPlaneAdapter } from 'file:///kernel/src/control-plane-adapter.ts';

// Audit
export type { AuditEvent } from 'file:///kernel/src/types.ts';
export { HttpAuditAdapter } from 'file:///kernel/src/audit-adapter.ts';
export { hashPayload } from 'file:///kernel/src/audit.ts';

// Sanitize
export { canonicalJson, sanitize } from 'file:///kernel/src/sanitize.ts';
