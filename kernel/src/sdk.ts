/**
 * Public (product-facing) SDK surface.
 *
 * Ticket goals:
 * - TGA-166: hide kernel router internals behind stable helpers
 * - TGA-163: provide a compatibility bridge from public config -> legacy Bindings
 *
 * These helpers are intentionally additive: existing ACP adopters can keep
 * `controlplane.bindings.json`, while new product-facing code can use
 * `echelon.config.ts` and translate back to the current kernel shape.
 */

import type { Bindings, ManageRequest, ManageResponse, DbAdapter, AuditAdapter, IdempotencyAdapter, RateLimitAdapter, CeilingsAdapter } from './types';
import { createManageRouter } from './router';
import type { ManageRouter } from './router';
import { iamPack, webhooksPack, settingsPack } from '../../packs/index';
import type { Pack } from './pack';

export type PublicBindings = Omit<Bindings, 'integration'> & {
  /**
   * Public schema should not require internal installer keys.
   * `integration` defaults to a safe placeholder and can be overridden.
   */
  integration?: string;
};

export interface EchelonConfig {
  /**
   * Repo-/project-owned bindings (public shape).
   * Internal installer-generated keys are intentionally not required here.
   */
  bindings: PublicBindings;
  /**
   * Packs to install into the router.
   *
   * Domain packs are typically repo-owned, so this is intentionally allowed to be any Pack.
   */
  packs: Pack[];
}

export function defineConfig(config: EchelonConfig): EchelonConfig {
  // No-op wrapper for now; keeps a stable public import point.
  return config;
}

export type EchelonEnvironment = 'development' | 'staging' | 'production';

export interface ToBindingsOptions {
  /**
   * Override the integration identifier used by the legacy kernel bindings.
   * Existing adopters often already have a stable integration string that should win.
   */
  integration?: string;
}

export interface TranslationOptions extends ToBindingsOptions {
  kernelId?: string;
  env?: EchelonEnvironment;
  basePath?: string;
  endpointPath?: string;
  dashboardBaseUrl?: string;
  registrationBaseUrl?: string;
}

export interface RuntimeRegistrationPlan {
  integration: string;
  kernelId: string;
  env: EchelonEnvironment;
  packs: string[];
  dashboardUrl?: string;
  registrationUrl?: string;
}

export interface ConfigTranslationArtifacts {
  bindings: Bindings;
  bindingsJson: string;
  env: Record<string, string>;
  registration: RuntimeRegistrationPlan;
}

export class ConfigTranslationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Invalid Echelon config:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigTranslationError';
    this.issues = issues;
  }
}

function validateConfigForTranslation(config: EchelonConfig): void {
  const issues: string[] = [];
  const bindings = config.bindings;

  if (!bindings.tenant?.table?.trim()) issues.push('bindings.tenant.table is required');
  if (!bindings.tenant?.id_column?.trim()) issues.push('bindings.tenant.id_column is required');
  if (!bindings.tenant?.get_tenant_fn?.trim()) issues.push('bindings.tenant.get_tenant_fn is required');
  if (!bindings.tenant?.is_admin_fn?.trim()) issues.push('bindings.tenant.is_admin_fn is required');
  if (!bindings.auth?.keys_table?.trim()) issues.push('bindings.auth.keys_table is required');
  if (!bindings.auth?.key_prefix?.trim()) issues.push('bindings.auth.key_prefix is required');
  if (!Number.isInteger(bindings.auth?.prefix_length) || (bindings.auth?.prefix_length ?? 0) < 1) {
    issues.push('bindings.auth.prefix_length must be a positive integer');
  }
  if (!bindings.auth?.key_hash_column?.trim()) issues.push('bindings.auth.key_hash_column is required');
  if (!bindings.auth?.key_prefix_column?.trim()) issues.push('bindings.auth.key_prefix_column is required');
  if (!bindings.auth?.scopes_column?.trim()) issues.push('bindings.auth.scopes_column is required');
  if (!bindings.database?.adapter?.trim()) issues.push('bindings.database.adapter is required');

  if (issues.length > 0) {
    throw new ConfigTranslationError(issues);
  }
}

function slugifyIntegration(value: string): string {
  let result = '';
  let previousWasDash = false;

  for (const char of value.toLowerCase()) {
    const isAlphaNumeric = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
    if (isAlphaNumeric) {
      result += char;
      previousWasDash = false;
      continue;
    }

    if (!previousWasDash && result.length > 0) {
      result += '-';
      previousWasDash = true;
    }
  }

  if (result.endsWith('-')) {
    result = result.slice(0, -1);
  }

  return result || 'echelon-integration';
}

function buildKernelId(integration: string, env: EchelonEnvironment): string {
  return `${slugifyIntegration(integration)}-${env}`;
}

function joinUrl(baseUrl: string | undefined, ...segments: string[]): string | undefined {
  if (!baseUrl) return undefined;

  const trimSlashes = (input: string): string => {
    let start = 0;
    let end = input.length;

    while (start < end && input[start] === '/') {
      start += 1;
    }
    while (end > start && input[end - 1] === '/') {
      end -= 1;
    }

    return input.slice(start, end);
  };

  const trimmed = trimSlashes(baseUrl);
  return [trimmed, ...segments.map((segment) => trimSlashes(segment))].join('/');
}

/**
 * Translate the product-facing Echelon config into the current kernel Bindings shape.
 *
 * This is the core compatibility bridge for existing ACP implementations:
 * new product code can adopt `echelon.config.ts` without changing the current
 * kernel router, installer, or runtime contract.
 */
export function toBindings(config: EchelonConfig, opts?: ToBindingsOptions): Bindings {
  validateConfigForTranslation(config);
  return {
    ...(config.bindings as Omit<Bindings, 'integration'>),
    integration:
      opts?.integration ??
      config.bindings.integration ??
      // Safe fallback; production adopters should set this explicitly.
      'echelon-integration',
  };
}

export function translateConfig(config: EchelonConfig, opts: TranslationOptions = {}): ConfigTranslationArtifacts {
  const bindings = toBindings(config, opts);
  const env = opts.env || 'development';
  const kernelId = opts.kernelId || buildKernelId(bindings.integration, env);
  const basePath = opts.basePath || '/api/manage';
  const endpointPath = opts.endpointPath || basePath;
  const packNames = config.packs.map((pack) => pack.name);
  const dashboardUrl = joinUrl(opts.dashboardBaseUrl, 'projects', bindings.integration, env);
  const registrationUrl = joinUrl(opts.registrationBaseUrl ?? opts.dashboardBaseUrl, 'onboard', bindings.integration);

  const envMap: Record<string, string> = {
    ACP_KERNEL_ID: kernelId,
    ACP_INTEGRATION: bindings.integration,
    ACP_DATABASE_ADAPTER: bindings.database.adapter,
    ACP_TENANT_TABLE: bindings.tenant.table,
    ACP_API_KEYS_TABLE: bindings.auth.keys_table,
    ACP_KEY_PREFIX: bindings.auth.key_prefix,
    ACP_BASE_PATH: basePath,
    ACP_ENDPOINT_PATH: endpointPath,
    ECHELON_ENV: env,
  };

  return {
    bindings,
    bindingsJson: JSON.stringify(bindings, null, 2),
    env: envMap,
    registration: {
      integration: bindings.integration,
      kernelId,
      env,
      packs: packNames,
      dashboardUrl,
      registrationUrl,
    },
  };
}

/**
 * Create a public-facing config object from an existing legacy Bindings object.
 *
 * This supports gradual migration: current ACP adopters can keep their generated
 * bindings and expose an `echelon.config.ts` facade alongside them.
 */
export function fromBindings(bindings: Bindings, packs: Pack[] = []): EchelonConfig {
  return defineConfig({
    bindings: {
      tenant: bindings.tenant,
      auth: bindings.auth,
      database: bindings.database,
      integration: bindings.integration,
    },
    packs,
  });
}

export interface ProtectDeps {
  dbAdapter: DbAdapter;
  auditAdapter: AuditAdapter;
  idempotencyAdapter: IdempotencyAdapter;
  rateLimitAdapter: RateLimitAdapter;
  ceilingsAdapter: CeilingsAdapter;
}

/**
 * Build a kernel-backed Manage router handler using the product-facing config.
 * This is the runtime counterpart to `defineConfig()`.
 */
export function protect(
  config: EchelonConfig,
  deps: ProtectDeps,
  opts?: {
    /**
     * Override the kernel `bindings.integration` value.
     * Useful when a single product deploy serves multiple “integrations”.
     */
    integration?: string;
    /**
     * Optional override for built-in pack selection helpers.
     * (Kept for future expansion; not used currently.)
     */
    defaultBuiltInPacks?: Array<'iam' | 'webhooks' | 'settings'>;
  }
): ManageRouter {
  const bindings = toBindings(config, {
    integration: opts?.integration,
  });

  return createManageRouter({
    dbAdapter: deps.dbAdapter,
    auditAdapter: deps.auditAdapter,
    idempotencyAdapter: deps.idempotencyAdapter,
    rateLimitAdapter: deps.rateLimitAdapter,
    ceilingsAdapter: deps.ceilingsAdapter,
    bindings,
    packs: config.packs,
  } as any);
}

/**
 * Thin alias for future “middleware” expansion.
 * For now, it returns a wrapper that adapts Fetch API style Request+JSON body to ManageRouter.
 */
export function middleware(
  router: ManageRouter,
  meta?: Omit<Parameters<ManageRouter>[1], 'request'> & { ipAddress?: string; userAgent?: string }
) {
  return async (req: Request, request: ManageRequest): Promise<ManageResponse> => {
    return router(request, {
      ...(meta || {}),
      request: req,
      ipAddress: meta?.ipAddress ?? req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: meta?.userAgent ?? req.headers.get('user-agent') ?? undefined,
    } as any);
  };
}

export interface ManageClientOptions {
  /**
   * Base URL where the host repo exposes the manage endpoint.
   * Example: https://example.com/api/manage
   */
  endpointUrl: string;
  /**
   * Value sent as `x-api-key`.
   */
  apiKey: string;
  /**
   * Optional: default idempotency key to attach to write requests.
   */
  defaultIdempotencyKey?: string;
}

export function createClient(opts: ManageClientOptions) {
  return {
    /**
     * Call a manage action.
     * The kernel expects `{ action, params, idempotency_key?, dry_run? }` as the JSON body.
     */
    async call<TData = any>(
      action: string,
      params: Record<string, any> = {},
      callOpts?: { idempotencyKey?: string; dryRun?: boolean }
    ): Promise<ManageResponse & { data?: TData }> {
      const body: ManageRequest = {
        action,
        params,
        idempotency_key: callOpts?.idempotencyKey ?? opts.defaultIdempotencyKey,
        dry_run: callOpts?.dryRun ?? false,
      };

      const res = await fetch(opts.endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
        },
        body: JSON.stringify(body),
      });

      // Host endpoints may return either ManageResponse JSON or a wrapper object.
      const txt = await res.text();
      try {
        return JSON.parse(txt) as any;
      } catch {
        return {
          ok: res.ok,
          request_id: 'client-response',
          error: txt,
          code: res.status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
        } as any;
      }
    },
  };
}

/**
 * Convenience helper for built-in packs.
 * Keeps product code free from remembering pack import paths.
 */
export function builtInPacks(packs: Array<'iam' | 'webhooks' | 'settings'>): Pack[] {
  const map: Record<string, Pack> = {
    iam: iamPack,
    webhooks: webhooksPack,
    settings: settingsPack,
  };
  return packs.map((p) => map[p]);
}

export type { ManageRequest, ManageResponse, ManageRouter, Bindings };
