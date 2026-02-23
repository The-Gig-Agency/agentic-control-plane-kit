/**
 * Main /manage router implementation
 * Pure function that returns a request handler
 */

import {
  ManageRequest,
  ManageResponse,
  ActionDef,
  ActionHandler,
  ActionContext,
  KernelConfig,
  ImpactShape,
  AuditEvent
} from './types.ts';
import { ExecutorAdapter } from './executor-adapter.ts';
import { ControlPlaneAdapter } from './control-plane-adapter.ts';
import { validateRequest, validateParams, ValidationError } from './validate.ts';
import { validateApiKey, hasScope } from './auth.ts';
import { generateRequestId } from './audit.ts';
import { sanitize } from './sanitize.ts';
import { emitAuditEvent } from './audit-event.ts';
import { getIdempotencyReplay, storeIdempotencyReplay } from './idempotency.ts';
import { checkRateLimit, getActionRateLimit } from './rate_limit.ts';
import { applyCeilings } from './ceilings.ts';
import { Pack, mergePacks, validatePack } from './pack.ts';
import { getMetaPack, setGlobalActionRegistry } from './meta-pack.ts';

export interface RequestMeta {
  request?: Request; // Raw HTTP request for auth validation
  ipAddress?: string;
  userAgent?: string;
  [key: string]: any;
}

export interface ManageRouter {
  (req: ManageRequest, meta?: RequestMeta): Promise<ManageResponse>;
}

export function createManageRouter(config: KernelConfig & { 
  packs: Pack[];
  executor?: ExecutorAdapter;
  controlPlane?: ControlPlaneAdapter;
}): ManageRouter {
  const {
    dbAdapter,
    auditAdapter,
    idempotencyAdapter,
    rateLimitAdapter,
    ceilingsAdapter,
    bindings,
    executor,
    controlPlane
  } = config;

  // Validate required bindings at startup (fail fast)
  if (!bindings.integration || typeof bindings.integration !== 'string' || bindings.integration.trim() === '') {
    throw new Error('bindings.integration is required and must be a non-empty string');
  }

  // Merge all packs (including meta pack)
  const metaPack = getMetaPack();
  const allPacks = [metaPack, ...config.packs];
  const { actions: allActions, handlers: allHandlers } = mergePacks(allPacks);
  
  // Set global registry for meta.actions
  setGlobalActionRegistry(allActions);
  
  // Build action registry map
  const actionRegistry = new Map<string, { def: ActionDef; handler: ActionHandler }>();
  for (const action of allActions) {
    actionRegistry.set(action.name, {
      def: action,
      handler: allHandlers[action.name]
    });
  }
  
  // Build scope map from actions
  const actionScopeMap: Record<string, string> = {};
  for (const action of allActions) {
    actionScopeMap[action.name] = action.scope;
  }

  return async (req: ManageRequest, meta: RequestMeta = {}): Promise<ManageResponse> => {
    const startTime = Date.now(); // For latency calculation
    const requestId = generateRequestId();
    let tenantId: string | undefined;
    let apiKeyId: string | undefined;
    let scopes: string[] = [];
    let keyPrefix: string | undefined;

    try {
      // 1. Validate request schema
      validateRequest(req);
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          ok: false,
          request_id: requestId,
          error: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      throw error;
    }

    const { action, params = {}, idempotency_key, dry_run = false } = req;

    // 2. Authenticate via API key
    if (!meta.request) {
      return {
        ok: false,
        request_id: requestId,
        error: 'Request object required for authentication',
        code: 'INVALID_API_KEY'
      };
    }

    const authResult = await validateApiKey(meta.request, dbAdapter, bindings);
    
    if (!authResult.success) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: '',
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: 'unknown',
        },
        action,
        request_payload: req,
        status: 'error',
        start_time: startTime,
      }, {
        error_code: 'INVALID_API_KEY',
        error_message: authResult.error || 'Authentication failed',
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: authResult.error || 'Authentication failed',
        code: 'INVALID_API_KEY'
      };
    }

    tenantId = authResult.tenantId!;
    apiKeyId = authResult.apiKeyId!;
    scopes = authResult.scopes || [];
    keyPrefix = authResult.keyPrefix;

    // 3. Lookup action in registry
    const actionEntry = actionRegistry.get(action);
    if (!actionEntry) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: tenantId!,
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: keyPrefix || 'unknown',
          api_key_id: apiKeyId,
        },
        action,
        request_payload: req,
        status: 'error',
        start_time: startTime,
      }, {
        error_code: 'NOT_FOUND',
        error_message: `Unknown action: ${action}`,
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Unknown action: ${action}`,
        code: 'NOT_FOUND'
      };
    }

    const { def: actionDef, handler } = actionEntry;

    // 4. Enforce dry_run support check
    // If action is a mutation (supports_dry_run exists) but doesn't support dry_run, reject
    if (dry_run && !actionDef.supports_dry_run) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: tenantId!,
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: keyPrefix || 'unknown',
          api_key_id: apiKeyId,
        },
        action,
        request_payload: req,
        status: 'error',
        start_time: startTime,
      }, {
        error_code: 'VALIDATION_ERROR',
        error_message: `Action ${action} does not support dry_run mode`,
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Action ${action} does not support dry_run mode`,
        code: 'VALIDATION_ERROR'
      };
    }

    // 5. Scope check (deny-by-default)
    const requiredScope = actionScopeMap[action] || actionDef.scope;
    if (requiredScope && !hasScope(scopes, requiredScope)) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: tenantId!,
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: keyPrefix || 'unknown',
          api_key_id: apiKeyId,
        },
        action,
        request_payload: req,
        status: 'denied',
        start_time: startTime,
      }, {
        error_code: 'SCOPE_DENIED',
        error_message: `Insufficient scope: requires '${requiredScope}'`,
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Insufficient scope: action '${action}' requires '${requiredScope}'`,
        code: 'SCOPE_DENIED'
      };
    }

    // 6. Rate limit: per-key + per-action
    const defaultRateLimit = 1000; // Should come from API key config
    const actionRateLimit = getActionRateLimit(action, defaultRateLimit);
    const effectiveLimit = Math.min(defaultRateLimit, actionRateLimit);

    const rateLimitResult = await checkRateLimit(
      rateLimitAdapter,
      apiKeyId,
      action,
      effectiveLimit
    );

    if (!rateLimitResult.allowed) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: tenantId!,
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: keyPrefix || 'unknown',
          api_key_id: apiKeyId,
        },
        action,
        request_payload: req,
        status: 'error',
        start_time: startTime,
      }, {
        error_code: 'RATE_LIMITED',
        error_message: `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`,
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`,
        code: 'RATE_LIMITED'
      };
    }

    // 7. Ceilings check for mutations
    if (!dry_run && actionDef.supports_dry_run) {
      try {
        await applyCeilings(ceilingsAdapter, action, params, tenantId!);
      } catch (error: any) {
        return {
          ok: false,
          request_id: requestId,
          error: error.message || 'Ceiling exceeded',
          code: 'CEILING_EXCEEDED'
        };
      }
    }

    // 8. Idempotency replay for non-dry-run mutations
    if (idempotency_key && !dry_run) {
      const replay = await getIdempotencyReplay(
        idempotencyAdapter,
        tenantId!,
        action,
        idempotency_key
      );

      if (replay) {
        await emitAuditEvent(auditAdapter, {
          tenant_id: tenantId!,
          integration: bindings.integration,
          actor: {
            type: 'api_key',
            id: keyPrefix || 'unknown',
            api_key_id: apiKeyId,
          },
          action,
          request_payload: req,
          status: 'success',
          start_time: startTime,
        }, {
          idempotency_key: idempotency_key,
          ip_address: meta.ipAddress,
          dry_run: false,
        });

        return {
          ok: true,
          request_id: requestId,
          data: replay,
          code: 'IDEMPOTENT_REPLAY'
        };
      }
    }

    // 9. Validate params against action schema
    try {
      validateParams(actionDef, params);
    } catch (error) {
      if (error instanceof ValidationError) {
        await emitAuditEvent(auditAdapter, {
          tenant_id: tenantId!,
          integration: bindings.integration,
          actor: {
            type: 'api_key',
            id: keyPrefix || 'unknown',
            api_key_id: apiKeyId,
          },
          action,
          request_payload: req,
          status: 'error',
          start_time: startTime,
        }, {
          error_code: 'VALIDATION_ERROR',
          error_message: error.message,
          ip_address: meta.ipAddress,
          dry_run: dry_run,
        });

        return {
          ok: false,
          request_id: requestId,
          error: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      throw error;
    }

    // 10. If dry_run: call handler with dryRun=true, require impact object
    // 11. Execute handler
    let result: any;
    let impact: ImpactShape | null = null;
    let beforeSnapshot: any = null;
    let afterSnapshot: any = null;

    try {
      const ctx: ActionContext = {
        tenantId: tenantId!,
        apiKeyId,
        scopes,
        dryRun: dry_run,
        requestId,
        db: dbAdapter,
        audit: auditAdapter,
        idempotency: idempotencyAdapter,
        rateLimit: rateLimitAdapter,
        ceilings: ceilingsAdapter,
        bindings,
        meta: {
          ...meta,
          executor,
          controlPlane,
          startTime,
        }
      };

      if (dry_run) {
        // Dry-run: handler should return { data, impact }
        const handlerResult = await handler(params, ctx);
        if (!handlerResult || !handlerResult.impact) {
          throw new Error('Dry-run handler must return { data, impact } with impact shape');
        }
        impact = handlerResult.impact;
        // For dry-run, return the impact shape as the main data
        result = impact;
      } else {
        // Real execution: handler returns { data, impact }
        const handlerResult = await handler(params, ctx);
        impact = handlerResult.impact || null;
        // Extract data for response
        result = handlerResult.data !== undefined ? handlerResult.data : handlerResult;
      }
    } catch (error: any) {
      await emitAuditEvent(auditAdapter, {
        tenant_id: tenantId!,
        integration: bindings.integration,
        actor: {
          type: 'api_key',
          id: keyPrefix || 'unknown',
          api_key_id: apiKeyId,
        },
        action,
        request_payload: req,
        status: 'error',
        start_time: startTime,
      }, {
        error_code: 'INTERNAL_ERROR',
        error_message: error.message,
        ip_address: meta.ipAddress,
        dry_run: dry_run,
      });

      return {
        ok: false,
        request_id: requestId,
        error: error.message || 'Internal error',
        code: 'INTERNAL_ERROR'
      };
    }

    // 12. Write audit log ALWAYS
    // Convert impact to result_meta format
    let result_meta: AuditEvent['result_meta'] | undefined;
    if (impact) {
      // Extract resource info from impact
      const firstCreate = impact.creates?.[0];
      const firstUpdate = impact.updates?.[0];
      const idsCreated = impact.creates
        ?.flatMap(c => c.details?.ids || [])
        .filter(Boolean) as string[] | undefined;
      
      result_meta = {
        resource_type: firstCreate?.type || firstUpdate?.type,
        resource_id: firstUpdate?.id,
        count: firstCreate?.count || impact.deletes?.[0]?.count,
        ids_created: idsCreated && idsCreated.length > 0 ? idsCreated : undefined,
      };
      
      // Remove undefined fields
      if (!result_meta.resource_type) delete result_meta.resource_type;
      if (!result_meta.resource_id) delete result_meta.resource_id;
      if (result_meta.count === undefined) delete result_meta.count;
      if (!result_meta.ids_created) delete result_meta.ids_created;
      
      // If no useful metadata, set to undefined
      if (Object.keys(result_meta).length === 0) {
        result_meta = undefined;
      }
    }
    
    await emitAuditEvent(auditAdapter, {
      tenant_id: tenantId!,
      integration: bindings.integration,
      actor: {
        type: 'api_key',
        id: keyPrefix || 'unknown',
        api_key_id: apiKeyId,
      },
      action,
      request_payload: req,
      status: 'success',
      start_time: startTime,
    }, {
      result_meta,
      idempotency_key: idempotency_key,
      ip_address: meta.ipAddress,
      dry_run: dry_run,
    });

    // 13. Store idempotency result for non-dry-run mutations
    if (idempotency_key && !dry_run) {
      await storeIdempotencyReplay(
        idempotencyAdapter,
        tenantId!,
        action,
        idempotency_key,
        result
      );
    }

    // Return response
    const response: ManageResponse = {
      ok: true,
      request_id: requestId,
      data: result,
      dry_run: dry_run,
      constraints_applied: [
        `tenant_scoped: ${tenantId}`,
        `rate_limit: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`
      ]
    };

    return response;
  };
}
