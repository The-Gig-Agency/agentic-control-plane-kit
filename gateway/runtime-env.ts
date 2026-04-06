import { ConfigurationError } from './errors.ts';

export interface GatewayRuntimeEnv {
  environment: string;
  acpBaseUrl: string;
  acpOrigin: string;
  kernelApiKey?: string;
  allowedOrigins: string[];
  defaultCorsOrigin?: string;
  allowCredentials: boolean;
}

export function normalizeAcpBaseUrl(platformUrl?: string | null): string {
  return (platformUrl || 'https://governance-hub.supabase.co').replace(/\/functions\/v1\/?$/, '');
}

export function parseAllowedOrigins(value?: string | null): string[] {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function shouldAllowCorsCredentials(value?: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function getGatewayRuntimeEnv(env: Pick<typeof Deno, 'env'> = Deno): GatewayRuntimeEnv {
  const acpBaseUrl = normalizeAcpBaseUrl(env.env.get('ACP_BASE_URL'));
  const allowedOrigins = parseAllowedOrigins(env.env.get('ALLOWED_ORIGINS'));
  const defaultCorsOrigin = env.env.get('DEFAULT_CORS_ORIGIN')?.trim() || undefined;
  const environment = env.env.get('ENVIRONMENT')?.trim() || 'production';

  return {
    environment,
    acpBaseUrl,
    acpOrigin: (() => {
      try {
        return new URL(`${acpBaseUrl}/`).origin;
      } catch {
        return '(invalid URL)';
      }
    })(),
    kernelApiKey: env.env.get('ACP_KERNEL_KEY') || undefined,
    allowedOrigins,
    defaultCorsOrigin,
    allowCredentials: shouldAllowCorsCredentials(env.env.get('CORS_ALLOW_CREDENTIALS')),
  };
}

export function validateGatewayRuntimeEnv(
  runtimeEnv: GatewayRuntimeEnv,
  options: { requireControlPlane?: boolean; requireCorsInProd?: boolean } = {},
): void {
  if (options.requireControlPlane && !runtimeEnv.kernelApiKey) {
    throw new ConfigurationError(
      'ACP_KERNEL_KEY environment variable required. Set this to connect to Governance Hub.',
    );
  }

  if (options.requireCorsInProd && runtimeEnv.environment === 'production' && runtimeEnv.allowedOrigins.length === 0) {
    throw new ConfigurationError(
      'ALLOWED_ORIGINS must be configured in production for browser-facing gateway routes.',
    );
  }
}

export function getCorsHeaders(
  origin: string | null,
  runtimeEnv: GatewayRuntimeEnv,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Vary': 'Origin',
  };

  if (!origin) {
    return headers;
  }

  if (runtimeEnv.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (runtimeEnv.allowCredentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
  }

  if (
    runtimeEnv.environment !== 'production' &&
    runtimeEnv.allowedOrigins.length === 0 &&
    runtimeEnv.defaultCorsOrigin
  ) {
    headers['Access-Control-Allow-Origin'] = runtimeEnv.defaultCorsOrigin;
  }

  return headers;
}
