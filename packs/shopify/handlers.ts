/**
 * Shopify Pack - Action Handlers
 * 
 * Handlers call CIQ Automations (CIA) endpoints via ShopifyExecutorAdapter.
 * Before write actions, they call Governance Hub /authorize.
 * After execution, they emit audit events to Governance Hub.
 */

import { ActionHandler, ImpactShape, ActionContext } from '../../kernel/src/types';
import { ExecutorAdapter, ExecutorResponse } from '../../kernel/src/executor-adapter';
import { ControlPlaneAdapter } from '../../kernel/src/control-plane-adapter';
import { emitAuditEvent, AuditEventContext, AuditEventOptions } from '../../kernel/src/audit-event';
import { sanitize, canonicalJson } from '../../kernel/src/sanitize';
import { hashPayload } from '../../kernel/src/audit';

// Helper to check if action is a write action
function isWriteAction(action: string): boolean {
  return action.includes('.create') || 
         action.includes('.update') || 
         action.includes('.delete') || 
         action.includes('.cancel');
}

// Helper to get params_summary (sanitized, small subset for policy evaluation)
function getParamsSummary(params: Record<string, any>, action: string): Record<string, any> {
  const summary: Record<string, any> = {};
  
  // Extract only essential fields for policy evaluation
  if (action.includes('products')) {
    if (params.title) summary.title = params.title;
    if (params.vendor) summary.vendor = params.vendor;
    if (params.product_type) summary.product_type = params.product_type;
    if (params.variants) {
      summary.variant_count = Array.isArray(params.variants) ? params.variants.length : 0;
    }
  } else if (action.includes('orders')) {
    if (params.email) summary.email = params.email;
    if (params.line_items) {
      summary.line_item_count = Array.isArray(params.line_items) ? params.line_items.length : 0;
    }
  }
  
  return summary;
}

// Helper to authorize write actions
async function authorizeWriteAction(
  ctx: ActionContext,
  action: string,
  params: Record<string, any>,
  controlPlane?: ControlPlaneAdapter
): Promise<{ allowed: boolean; decision_id?: string; reason?: string }> {
  if (!isWriteAction(action)) {
    return { allowed: true }; // Read actions don't need authorization
  }

  if (!controlPlane) {
    // If no control plane adapter, allow (degraded mode - can be changed to deny)
    console.warn(`[ShopifyPack] No ControlPlaneAdapter configured, allowing action: ${action}`);
    return { allowed: true };
  }

  try {
    // Get kernel ID from bindings (should be set in bindings.json)
    const kernelId = (ctx.bindings as any).kernelId || 'unknown-kernel';
    
    // Create request hash
    const sanitizedParams = sanitize(params);
    const canonicalParams = canonicalJson(sanitizedParams);
    const request_hash = await hashPayload(canonicalParams);
    
    // Get params_summary (small, sanitized subset)
    const params_summary = getParamsSummary(params, action);
    
    // Call Governance Hub /authorize
    const decision = await controlPlane.authorize({
      kernelId,
      tenantId: ctx.tenantId,
      actor: {
        type: 'api_key',
        id: ctx.apiKeyId,
        api_key_id: ctx.apiKeyId,
      },
      action,
      request_hash,
      params_summary,
      params_summary_schema_id: 'shopify-v1',
    });

    if (decision.decision === 'deny') {
      return {
        allowed: false,
        decision_id: decision.decision_id,
        reason: decision.reason || 'Policy denied',
      };
    }

    if (decision.decision === 'require_approval') {
      // For now, treat require_approval as deny (can be enhanced later)
      return {
        allowed: false,
        decision_id: decision.decision_id,
        reason: decision.reason || 'Approval required',
      };
    }

    return {
      allowed: true,
      decision_id: decision.decision_id,
    };
  } catch (error) {
    // If platform is unreachable, fail-closed (deny)
    console.error(`[ShopifyPack] Authorization failed:`, error);
    return {
      allowed: false,
      reason: `Platform unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Helper to emit audit event
async function emitShopifyAuditEvent(
  ctx: ActionContext,
  action: string,
  status: 'success' | 'error' | 'denied',
  executorResponse?: ExecutorResponse,
  error?: Error,
  decision_id?: string
): Promise<void> {
  const sanitizedParams = sanitize(ctx.meta?.params || {});
  const canonicalParams = canonicalJson(sanitizedParams);
  const request_hash = await hashPayload(canonicalParams);

  const auditCtx: AuditEventContext = {
    tenant_id: ctx.tenantId,
    integration: ctx.bindings.integration,
    actor: {
      type: 'api_key',
      id: ctx.apiKeyId,
      api_key_id: ctx.apiKeyId,
    },
    action,
    request_payload: sanitizedParams,
    status,
    start_time: ctx.meta?.startTime || Date.now(),
  };

  const options: AuditEventOptions = {
    pack: 'shopify',
    policy_decision_id: decision_id,
    result_meta: executorResponse
      ? {
          resource_type: executorResponse.resource_type || 'shopify_resource',
          resource_id: executorResponse.resource_ids?.[0],
          count: executorResponse.count || executorResponse.resource_ids?.length,
          ids_created: executorResponse.resource_ids,
        }
      : undefined,
    error_code: error ? 'EXECUTION_ERROR' : undefined,
    error_message: error?.message,
    ip_address: ctx.meta?.ipAddress,
    dry_run: ctx.dryRun,
  };

  await emitAuditEvent(ctx.audit, auditCtx, options);
}

// Get executor adapter from context (should be injected)
function getExecutorAdapter(ctx: ActionContext): ExecutorAdapter {
  const executor = (ctx as any).executor as ExecutorAdapter;
  if (!executor) {
    throw new Error('ShopifyExecutorAdapter not configured. Set ctx.executor in router config.');
  }
  return executor;
}

// Get control plane adapter from context (should be injected)
function getControlPlaneAdapter(ctx: ActionContext): ControlPlaneAdapter | undefined {
  return (ctx as any).controlPlane as ControlPlaneAdapter | undefined;
}

// List products
export const handleShopifyProductsList: ActionHandler = async (params, ctx) => {
  const executor = getExecutorAdapter(ctx);
  const response = await executor.execute<{ products: any[] }>(
    '/api/tenants/{tenantId}/shopify/products.list',
    params,
    ctx.tenantId,
    {
      kernel_id: (ctx.bindings as any).kernelId,
      actor_id: ctx.apiKeyId,
    }
  );

  await emitShopifyAuditEvent(ctx, 'shopify.products.list', 'success', response);
  return { data: response.data };
};

// Get product
export const handleShopifyProductsGet: ActionHandler = async (params, ctx) => {
  const executor = getExecutorAdapter(ctx);
  const response = await executor.execute(
    '/api/tenants/{tenantId}/shopify/products.get',
    params,
    ctx.tenantId,
    {
      kernel_id: (ctx.bindings as any).kernelId,
      actor_id: ctx.apiKeyId,
    }
  );

  await emitShopifyAuditEvent(ctx, 'shopify.products.get', 'success', response);
  return { data: response.data };
};

// Create product
export const handleShopifyProductsCreate: ActionHandler = async (params, ctx) => {
  const controlPlane = getControlPlaneAdapter(ctx);
  
  // Authorize before write action
  const authResult = await authorizeWriteAction(ctx, 'shopify.products.create', params, controlPlane);
  if (!authResult.allowed) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.create',
      'denied',
      undefined,
      new Error(authResult.reason),
      authResult.decision_id
    );
    throw new Error(authResult.reason || 'Action denied by policy');
  }

  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [{ type: 'shopify_product', count: 1, details: { title: params.title } }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: [],
    };
    return { data: { product_id: 'preview', ...params }, impact };
  }

  try {
    const executor = getExecutorAdapter(ctx);
    const response = await executor.execute(
      '/api/tenants/{tenantId}/shopify/products.create',
      params,
      ctx.tenantId,
      {
        kernel_id: (ctx.bindings as any).kernelId,
        policy_decision_id: authResult.decision_id,
        actor_id: ctx.apiKeyId,
      }
    );

    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.create',
      'success',
      response,
      undefined,
      authResult.decision_id
    );

    const impact: ImpactShape = {
      creates: [
        {
          type: 'shopify_product',
          count: 1,
          details: { id: response.resource_ids?.[0], title: params.title },
        },
      ],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: [],
    };

    return { data: response.data, impact };
  } catch (error) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.create',
      'error',
      undefined,
      error instanceof Error ? error : new Error('Unknown error'),
      authResult.decision_id
    );
    throw error;
  }
};

// Update product
export const handleShopifyProductsUpdate: ActionHandler = async (params, ctx) => {
  const controlPlane = getControlPlaneAdapter(ctx);
  
  const authResult = await authorizeWriteAction(ctx, 'shopify.products.update', params, controlPlane);
  if (!authResult.allowed) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.update',
      'denied',
      undefined,
      new Error(authResult.reason),
      authResult.decision_id
    );
    throw new Error(authResult.reason || 'Action denied by policy');
  }

  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'shopify_product', id: params.product_id, fields: Object.keys(params) }],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: [],
    };
    return { data: { product_id: params.product_id, ...params }, impact };
  }

  try {
    const executor = getExecutorAdapter(ctx);
    const response = await executor.execute(
      '/api/tenants/{tenantId}/shopify/products.update',
      params,
      ctx.tenantId,
      {
        kernel_id: (ctx.bindings as any).kernelId,
        policy_decision_id: authResult.decision_id,
        actor_id: ctx.apiKeyId,
      }
    );

    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.update',
      'success',
      response,
      undefined,
      authResult.decision_id
    );

    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'shopify_product', id: params.product_id }],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: [],
    };

    return { data: response.data, impact };
  } catch (error) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.update',
      'error',
      undefined,
      error instanceof Error ? error : new Error('Unknown error'),
      authResult.decision_id
    );
    throw error;
  }
};

// Delete product
export const handleShopifyProductsDelete: ActionHandler = async (params, ctx) => {
  const controlPlane = getControlPlaneAdapter(ctx);
  
  const authResult = await authorizeWriteAction(ctx, 'shopify.products.delete', params, controlPlane);
  if (!authResult.allowed) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.delete',
      'denied',
      undefined,
      new Error(authResult.reason),
      authResult.decision_id
    );
    throw new Error(authResult.reason || 'Action denied by policy');
  }

  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [],
      updates: [],
      deletes: [{ type: 'shopify_product', count: 1, details: { id: params.product_id } }],
      side_effects: [],
      risk: 'high',
      warnings: ['This will permanently delete the product'],
    };
    return { data: { product_id: params.product_id, deleted: true }, impact };
  }

  try {
    const executor = getExecutorAdapter(ctx);
    const response = await executor.execute(
      '/api/tenants/{tenantId}/shopify/products.delete',
      params,
      ctx.tenantId,
      {
        kernel_id: (ctx.bindings as any).kernelId,
        policy_decision_id: authResult.decision_id,
        actor_id: ctx.apiKeyId,
      }
    );

    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.delete',
      'success',
      response,
      undefined,
      authResult.decision_id
    );

    const impact: ImpactShape = {
      creates: [],
      updates: [],
      deletes: [{ type: 'shopify_product', count: 1, details: { id: params.product_id } }],
      side_effects: [],
      risk: 'high',
      warnings: ['Product has been deleted'],
    };

    return { data: response.data, impact };
  } catch (error) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.products.delete',
      'error',
      undefined,
      error instanceof Error ? error : new Error('Unknown error'),
      authResult.decision_id
    );
    throw error;
  }
};

// List orders
export const handleShopifyOrdersList: ActionHandler = async (params, ctx) => {
  const executor = getExecutorAdapter(ctx);
  const response = await executor.execute<{ orders: any[] }>(
    '/api/tenants/{tenantId}/shopify/orders.list',
    params,
    ctx.tenantId,
    {
      kernel_id: (ctx.bindings as any).kernelId,
      actor_id: ctx.apiKeyId,
    }
  );

  await emitShopifyAuditEvent(ctx, 'shopify.orders.list', 'success', response);
  return { data: response.data };
};

// Get order
export const handleShopifyOrdersGet: ActionHandler = async (params, ctx) => {
  const executor = getExecutorAdapter(ctx);
  const response = await executor.execute(
    '/api/tenants/{tenantId}/shopify/orders.get',
    params,
    ctx.tenantId,
    {
      kernel_id: (ctx.bindings as any).kernelId,
      actor_id: ctx.apiKeyId,
    }
  );

  await emitShopifyAuditEvent(ctx, 'shopify.orders.get', 'success', response);
  return { data: response.data };
};

// Create order
export const handleShopifyOrdersCreate: ActionHandler = async (params, ctx) => {
  const controlPlane = getControlPlaneAdapter(ctx);
  
  const authResult = await authorizeWriteAction(ctx, 'shopify.orders.create', params, controlPlane);
  if (!authResult.allowed) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.create',
      'denied',
      undefined,
      new Error(authResult.reason),
      authResult.decision_id
    );
    throw new Error(authResult.reason || 'Action denied by policy');
  }

  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [{ type: 'shopify_order', count: 1 }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: [],
    };
    return { data: { order_id: 'preview', ...params }, impact };
  }

  try {
    const executor = getExecutorAdapter(ctx);
    const response = await executor.execute(
      '/api/tenants/{tenantId}/shopify/orders.create',
      params,
      ctx.tenantId,
      {
        kernel_id: (ctx.bindings as any).kernelId,
        policy_decision_id: authResult.decision_id,
        actor_id: ctx.apiKeyId,
      }
    );

    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.create',
      'success',
      response,
      undefined,
      authResult.decision_id
    );

    const impact: ImpactShape = {
      creates: [{ type: 'shopify_order', count: 1, details: { id: response.resource_ids?.[0] } }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: [],
    };

    return { data: response.data, impact };
  } catch (error) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.create',
      'error',
      undefined,
      error instanceof Error ? error : new Error('Unknown error'),
      authResult.decision_id
    );
    throw error;
  }
};

// Cancel order
export const handleShopifyOrdersCancel: ActionHandler = async (params, ctx) => {
  const controlPlane = getControlPlaneAdapter(ctx);
  
  const authResult = await authorizeWriteAction(ctx, 'shopify.orders.cancel', params, controlPlane);
  if (!authResult.allowed) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.cancel',
      'denied',
      undefined,
      new Error(authResult.reason),
      authResult.decision_id
    );
    throw new Error(authResult.reason || 'Action denied by policy');
  }

  if (ctx.dryRun) {
    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'shopify_order', id: params.order_id, fields: ['status'] }],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: ['This will cancel the order'],
    };
    return { data: { order_id: params.order_id, cancelled: true }, impact };
  }

  try {
    const executor = getExecutorAdapter(ctx);
    const response = await executor.execute(
      '/api/tenants/{tenantId}/shopify/orders.cancel',
      params,
      ctx.tenantId,
      {
        kernel_id: (ctx.bindings as any).kernelId,
        policy_decision_id: authResult.decision_id,
        actor_id: ctx.apiKeyId,
      }
    );

    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.cancel',
      'success',
      response,
      undefined,
      authResult.decision_id
    );

    const impact: ImpactShape = {
      creates: [],
      updates: [{ type: 'shopify_order', id: params.order_id, fields: ['status'] }],
      deletes: [],
      side_effects: [],
      risk: 'medium',
      warnings: ['Order has been cancelled'],
    };

    return { data: response.data, impact };
  } catch (error) {
    await emitShopifyAuditEvent(
      ctx,
      'shopify.orders.cancel',
      'error',
      undefined,
      error instanceof Error ? error : new Error('Unknown error'),
      authResult.decision_id
    );
    throw error;
  }
};
