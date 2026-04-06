import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';

import {
  getCorsHeaders,
  getGatewayRuntimeEnv,
  normalizeAcpBaseUrl,
  parseAllowedOrigins,
  validateGatewayRuntimeEnv,
} from '../../runtime-env.ts';
import { ConfigurationError } from '../../errors.ts';

function createEnv(values: Record<string, string | undefined>) {
  return {
    env: {
      get(name: string) {
        return values[name];
      },
    },
  } as Pick<typeof Deno, 'env'>;
}

Deno.test('normalizeAcpBaseUrl strips trailing functions path', () => {
  assertEquals(
    normalizeAcpBaseUrl('https://example.supabase.co/functions/v1'),
    'https://example.supabase.co',
  );
});

Deno.test('parseAllowedOrigins trims and drops blanks', () => {
  assertEquals(
    parseAllowedOrigins(' https://a.test , ,https://b.test '),
    ['https://a.test', 'https://b.test'],
  );
});

Deno.test('validateGatewayRuntimeEnv requires ALLOWED_ORIGINS in production when requested', () => {
  const runtimeEnv = getGatewayRuntimeEnv(createEnv({
    ENVIRONMENT: 'production',
    ACP_BASE_URL: 'https://example.supabase.co',
    ACP_KERNEL_KEY: 'secret',
  }));

  assertThrows(
    () => validateGatewayRuntimeEnv(runtimeEnv, { requireCorsInProd: true }),
    ConfigurationError,
  );
});

Deno.test('getCorsHeaders denies unknown origins by default', () => {
  const runtimeEnv = getGatewayRuntimeEnv(createEnv({
    ENVIRONMENT: 'production',
    ACP_BASE_URL: 'https://example.supabase.co',
    ACP_KERNEL_KEY: 'secret',
    ALLOWED_ORIGINS: 'https://allowed.test',
  }));

  const denied = getCorsHeaders('https://blocked.test', runtimeEnv);
  const allowed = getCorsHeaders('https://allowed.test', runtimeEnv);

  assertEquals(denied['Access-Control-Allow-Origin'], undefined);
  assertEquals(allowed['Access-Control-Allow-Origin'], 'https://allowed.test');
  assertEquals(allowed['Access-Control-Allow-Credentials'], undefined);
});

Deno.test('getCorsHeaders only enables credentials when explicitly configured', () => {
  const runtimeEnv = getGatewayRuntimeEnv(createEnv({
    ENVIRONMENT: 'production',
    ACP_BASE_URL: 'https://example.supabase.co',
    ACP_KERNEL_KEY: 'secret',
    ALLOWED_ORIGINS: 'https://allowed.test',
    CORS_ALLOW_CREDENTIALS: 'true',
  }));

  const headers = getCorsHeaders('https://allowed.test', runtimeEnv);
  assertEquals(headers['Access-Control-Allow-Credentials'], 'true');
});
