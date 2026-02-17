/**
 * Governance Pack - Action Handlers
 * 
 * Handlers forward policy proposals to Governance Hub (Repo B).
 * Repo A never stores or activates policies - it only forwards proposals.
 */

import { ActionHandler, ActionContext } from '../../kernel/src/types';
import { ControlPlaneAdapter } from '../../kernel/src/control-plane-adapter';
import { emitAuditEvent, AuditEventContext, AuditEventOptions } from '../../kernel/src/audit-event';
import { sanitize } from '../../kernel/src/sanitize';

export interface ProposalRequest {
  org_id: string;
  title: string;
  summary: string;
  proposal_kind: 'policy' | 'limit' | 'runbook' | 'revocation_suggestion';
  proposal_spec_version: number;
  proposal: {
    type: 'LimitPolicy' | 'RequireApprovalPolicy';
    data: Record<string, any>;
  };
  rationale: string;
  evidence?: {
    audit_event_ids?: string[];
    links?: string[];
  };
  author_type: 'agent' | 'user' | 'system';
  author_id: string;
}

export interface ProposalResponse {
  proposal_id: string;
  status: 'proposed' | 'approved' | 'rejected' | 'published';
  message?: string;
}

/**
 * Handle governance.propose_policy action
 * 
 * Forwards proposal to Repo B's /functions/v1/policy-propose endpoint.
 * Repo A never stores or activates policies - it only forwards proposals.
 */
export const handleProposePolicy: ActionHandler = async (params: Record<string, any>, ctx: ActionContext) => {
  const { controlPlane } = ctx.meta || {};
  
  if (!controlPlane) {
    throw new Error('ControlPlaneAdapter not configured. Set controlPlane in router config.');
  }

  // Get org_id from bindings or derive from tenant
  const orgId = (ctx.bindings as any).org_id || (ctx.bindings as any).organization_id;
  if (!orgId) {
    throw new Error('org_id not found in bindings. Add org_id to bindings or derive from tenant.');
  }

  // Validate proposal structure
  if (!params.proposal || !params.proposal.type || !params.proposal.data) {
    throw new Error('Invalid proposal structure. Must have type and data fields.');
  }

  // Build proposal request
  const proposalRequest: ProposalRequest = {
    org_id: orgId,
    title: params.title,
    summary: params.summary,
    proposal_kind: params.proposal_kind,
    proposal_spec_version: 1,
    proposal: {
      type: params.proposal.type,
      data: params.proposal.data,
    },
    rationale: params.rationale,
    evidence: params.evidence || {},
    author_type: 'agent',
    author_id: ctx.apiKeyId,
  };

  // Validate proposal_kind
  const validKinds = ['policy', 'limit', 'runbook', 'revocation_suggestion'];
  if (!validKinds.includes(proposalRequest.proposal_kind)) {
    throw new Error(`Invalid proposal_kind: ${proposalRequest.proposal_kind}. Must be one of: ${validKinds.join(', ')}`);
  }

  // Validate proposal type
  const validTypes = ['LimitPolicy', 'RequireApprovalPolicy'];
  if (!validTypes.includes(proposalRequest.proposal.type)) {
    throw new Error(`Invalid proposal type: ${proposalRequest.proposal.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // Forward to Repo B
  let proposalResponse: ProposalResponse;
  const startTime = Date.now();
  const sanitizedParams = sanitize(params);
  
  // Check if proposePolicy method exists
  if (!controlPlane.proposePolicy) {
    throw new Error('ControlPlaneAdapter does not support proposePolicy. Use HttpControlPlaneAdapter.');
  }
  
  try {
    proposalResponse = await controlPlane.proposePolicy(proposalRequest);
  } catch (error: any) {
    // Emit audit event for failed proposal
    const auditCtx: AuditEventContext = {
      tenant_id: ctx.tenantId,
      integration: ctx.bindings.integration,
      actor: {
        type: 'api_key',
        id: ctx.apiKeyId,
        api_key_id: ctx.apiKeyId,
      },
      action: 'governance.propose_policy',
      request_payload: sanitizedParams,
      status: 'error',
      start_time: startTime,
    };

    const auditOptions: AuditEventOptions = {
      pack: 'governance',
      error_code: 'PROPOSAL_FAILED',
      error_message: error.message || 'Unknown error',
      result_meta: {
        resource_type: 'policy_proposal',
        proposal_title: params.title,
        proposal_kind: params.proposal_kind,
      },
      ip_address: ctx.meta?.ip_address,
      dry_run: ctx.dryRun,
    };

    await emitAuditEvent(ctx.audit, auditCtx, auditOptions);

    throw new Error(`Failed to propose policy: ${error.message}`);
  }

  // Emit audit event for successful proposal
  const auditCtx: AuditEventContext = {
    tenant_id: ctx.tenantId,
    integration: ctx.bindings.integration,
    actor: {
      type: 'api_key',
      id: ctx.apiKeyId,
      api_key_id: ctx.apiKeyId,
    },
    action: 'governance.propose_policy',
    request_payload: sanitizedParams,
    status: 'success',
    start_time: startTime,
  };

  const auditOptions: AuditEventOptions = {
    pack: 'governance',
    result_meta: {
      resource_type: 'policy_proposal',
      resource_id: proposalResponse.proposal_id,
      proposal_title: params.title,
      proposal_kind: params.proposal_kind,
      proposal_status: proposalResponse.status,
    },
    ip_address: ctx.meta?.ip_address,
    dry_run: ctx.dryRun,
  };

  await emitAuditEvent(ctx.audit, auditCtx, auditOptions);

  return {
    proposal_id: proposalResponse.proposal_id,
    status: proposalResponse.status,
    message: proposalResponse.message || 'Proposal submitted successfully',
  };
};
