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

import type { Bindings, ManageRequest, ManageResponse, DbAdapter, AuditAdapter, IdempotencyAdapter, RateLimitAdapter, CeilingsAdapter } from './types.ts';
import { createManageRouter } from './router.ts';
import type { ManageRouter } from './router.ts';
import { iamPack, webhooksPack, settingsPack } from '../../packs/index.ts';
import type { Pack } from './pack.ts';

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

export interface ToBindingsOptions {
  /**
   * Override the integration identifier used by the legacy kernel bindings.
   * Existing adopters often already have a stable integration string that should win.
   */
  integration?: string;
}

/**
 * Translate the product-facing Echelon config into the current kernel Bindings shape.
 *
 * This is the core compatibility bridge for existing ACP implementations:
 * new product code can adopt `echelon.config.ts` without changing the current
 * kernel router, installer, or runtime contract.
 */
export function toBindings(config: EchelonConfig, opts?: ToBindingsOptions): Bindings {
  return {
    ...(config.bindings as Omit<Bindings, 'integration'>),
    integration:
      opts?.integration ??
      config.bindings.integration ??
      // Safe fallback; production adopters should set this explicitly.
      'echelon-integration',
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
