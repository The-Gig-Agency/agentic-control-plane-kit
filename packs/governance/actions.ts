/**
 * Governance Pack - Action Definitions
 */

import { ActionDef } from '../../kernel/src/types';

export const governanceActions: ActionDef[] = [
  {
    name: 'governance.propose_policy',
    scope: 'manage.governance',
    description: 'Propose a policy, limit, or runbook to Governance Hub for review and approval',
    params_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          maxLength: 120,
          description: 'Short title for the proposal (max 120 chars)',
        },
        summary: {
          type: 'string',
          maxLength: 300,
          description: 'Brief summary of the proposal (max 300 chars)',
        },
        proposal_kind: {
          type: 'string',
          enum: ['policy', 'limit', 'runbook', 'revocation_suggestion'],
          description: 'Type of proposal',
        },
        proposal: {
          type: 'object',
          description: 'The proposal payload (LimitPolicy or RequireApprovalPolicy)',
          properties: {
            type: {
              type: 'string',
              enum: ['LimitPolicy', 'RequireApprovalPolicy'],
            },
            data: {
              type: 'object',
              description: 'Proposal-specific data',
            },
          },
          required: ['type', 'data'],
        },
        rationale: {
          type: 'string',
          maxLength: 2000,
          description: 'Explanation for why this proposal is needed (max 2000 chars)',
        },
        evidence: {
          type: 'object',
          description: 'Supporting evidence (optional)',
          properties: {
            audit_event_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Audit event IDs that support this proposal',
            },
            links: {
              type: 'array',
              items: { type: 'string' },
              description: 'URLs to relevant documentation or evidence',
            },
          },
        },
      },
      required: ['title', 'summary', 'proposal_kind', 'proposal', 'rationale'],
    },
    supports_dry_run: true,
  },
];
