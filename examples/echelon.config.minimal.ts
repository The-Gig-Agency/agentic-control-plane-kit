/**
 * Minimal `echelon.config.ts` example (TGA-172).
 *
 * Copy into your application repo and adjust `bindings` for your schema.
 * When consumed as the npm package, import from `agentic-control-plane-kit` instead of relative paths.
 *
 * @see docs/Echelon-CONFIG-SCHEMA.md
 * @see config/echelon.config.schema.json
 */

import { defineConfig, builtInPacks } from '../kernel/src/sdk';

export default defineConfig({
  bindings: {
    tenant: {
      table: 'tenants',
      id_column: 'id',
      get_tenant_fn: 'get_tenant_id',
      is_admin_fn: 'is_platform_admin',
    },
    auth: {
      keys_table: 'api_keys',
      key_prefix: 'mcp_',
      prefix_length: 12,
      key_hash_column: 'key_hash',
      key_prefix_column: 'prefix',
      scopes_column: 'scopes',
    },
    database: {
      adapter: 'supabase',
      connection_env: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    integration: 'my-product',
  },
  packs: builtInPacks(['iam', 'webhooks', 'settings']),
});
