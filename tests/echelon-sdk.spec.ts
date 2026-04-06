import { describe, expect, it } from 'vitest';

import { defineConfig, fromBindings, toBindings } from '../kernel/src/sdk.ts';
import type { Bindings } from '../kernel/src/types.ts';

describe('echelon sdk compatibility bridge', () => {
  it('translates public config into legacy bindings without dropping integration', () => {
    const config = defineConfig({
      bindings: {
        tenant: {
          table: 'brands',
          id_column: 'id',
          get_tenant_fn: 'get_brand_id',
          is_admin_fn: 'is_admin',
        },
        auth: {
          keys_table: 'api_keys',
          key_prefix: 'ock_',
          prefix_length: 12,
          key_hash_column: 'key_hash',
          key_prefix_column: 'prefix',
          scopes_column: 'scopes',
        },
        database: {
          adapter: 'supabase',
        },
        integration: 'mom-walk-connect',
      },
      packs: [],
    });

    const bindings = toBindings(config);

    expect(bindings.integration).toBe('mom-walk-connect');
    expect(bindings.tenant.table).toBe('brands');
    expect(bindings.auth.key_prefix).toBe('ock_');
  });

  it('provides a safe fallback integration when the public config omits one', () => {
    const config = defineConfig({
      bindings: {
        tenant: {
          table: 'tenants',
          id_column: 'id',
          get_tenant_fn: 'get_tenant_id',
          is_admin_fn: 'is_admin',
        },
        auth: {
          keys_table: 'api_keys',
          key_prefix: 'ock_',
          prefix_length: 12,
          key_hash_column: 'key_hash',
          key_prefix_column: 'prefix',
          scopes_column: 'scopes',
        },
        database: {
          adapter: 'custom',
        },
      },
      packs: [],
    });

    expect(toBindings(config).integration).toBe('echelon-integration');
    expect(toBindings(config, { integration: 'ciq-automations' }).integration).toBe('ciq-automations');
  });

  it('can wrap an existing legacy bindings object without changing its runtime shape', () => {
    const bindings: Bindings = {
      integration: 'ciq-automations',
      tenant: {
        table: 'brands',
        id_column: 'id',
        get_tenant_fn: 'get_brand_id',
        is_admin_fn: 'is_admin',
      },
      auth: {
        keys_table: 'api_keys',
        key_prefix: 'ock_',
        prefix_length: 12,
        key_hash_column: 'key_hash',
        key_prefix_column: 'prefix',
        scopes_column: 'scopes',
      },
      database: {
        adapter: 'supabase',
      },
    };

    const config = fromBindings(bindings);

    expect(config.bindings.integration).toBe('ciq-automations');
    expect(config.bindings.tenant).toEqual(bindings.tenant);
    expect(config.bindings.auth).toEqual(bindings.auth);
    expect(config.bindings.database).toEqual(bindings.database);
  });
});
