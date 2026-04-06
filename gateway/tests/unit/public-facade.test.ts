import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

import {
  buildPublicDiscoverResponse,
  buildPublicEvaluateResponse,
  buildPublicExecuteBlockedResponse,
  buildPublicExecuteSuccessResponse,
  buildPublicRegisterResponse,
  deriveToolName,
  normalizePlatformBaseUrl,
} from '../../public-facade.ts';

Deno.test('normalizePlatformBaseUrl removes trailing functions path', () => {
  assertEquals(
    normalizePlatformBaseUrl('https://example.supabase.co/functions/v1'),
    'https://example.supabase.co',
  );
});

Deno.test('deriveToolName composes connector prefix and action', () => {
  assertEquals(deriveToolName('shopify', 'create_order'), 'shopify.create_order');
  assertEquals(deriveToolName('shopify.', '.create_order'), 'shopify.create_order');
});

Deno.test('public discover response exposes stable command aliases', () => {
  const response = buildPublicDiscoverResponse({
    gatewayName: 'Echelon MCP Gateway',
    version: '1.2.3',
    docsUrl: 'https://docs.example.com',
    connectors: [
      {
        id: 'shopify',
        slug: 'shopify',
        name: 'Shopify',
        status: 'available',
        capabilities: ['shopify.'],
      },
    ],
  });

  assertEquals(response.commands.discover, '/discover');
  assertEquals(response.commands.register, '/register');
  assertEquals(response.connectors[0].slug, 'shopify');
});

Deno.test('register response stays product-shaped', () => {
  const response = buildPublicRegisterResponse(
    { project: 'mom-walk-connect', env: 'production', connector: 'shopify' },
    'https://example.com/onboard',
  );

  assertEquals(response.project_id, 'mom-walk-connect');
  assertEquals(response.environment_id, 'mom-walk-connect:production');
  assertEquals(response.dashboard_url, 'https://example.com/onboard');
});

Deno.test('evaluate and execute mappings preserve approval state', () => {
  const evaluation = buildPublicEvaluateResponse({
    decision_id: 'dec_123',
    decision: 'require_approval',
    reason: 'Needs approval',
    policy_id: 'policy_1',
  });
  const blocked = buildPublicExecuteBlockedResponse({
    executionId: 'exec_123',
    approvalRequired: true,
    auditId: 'dec_123',
  });
  const completed = buildPublicExecuteSuccessResponse({
    executionId: 'exec_456',
    result: { ok: true },
    decisionId: 'dec_456',
  });

  assertEquals(evaluation.approval.required, true);
  assertEquals(evaluation.risk, 'medium');
  assertEquals(blocked.status, 'pending_approval');
  assertEquals(completed.status, 'completed');
  assertEquals(completed.audit_id, 'dec_456');
});
