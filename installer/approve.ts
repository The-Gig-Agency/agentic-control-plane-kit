function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '').replace(/\/functions\/v1\/?$/, '');
}

export interface ApproveOptions {
  governanceHubUrl?: string;
  kernelApiKey?: string;
  approvalId?: string;
  decisionId?: string;
  actorId?: string;
  endpointUrlOverride?: string;
}

export interface ApproveResult {
  ok: boolean;
  approval_id?: string;
  decision_id?: string;
  status?: 'approved' | 'rejected' | 'unknown';
  message?: string;
}

export async function approve(opts: ApproveOptions): Promise<ApproveResult> {
  const governanceHubUrl = opts.governanceHubUrl || process.env.GOVERNANCE_HUB_URL;
  const kernelApiKey = opts.kernelApiKey || process.env.ACP_KERNEL_KEY;

  if (!governanceHubUrl) {
    return {
      ok: false,
      message: 'GOVERNANCE_HUB_URL is required for `echelon approve`.',
    };
  }
  if (!kernelApiKey) {
    return {
      ok: false,
      message: 'ACP_KERNEL_KEY is required for `echelon approve`.',
    };
  }

  if (!opts.approvalId && !opts.decisionId) {
    return {
      ok: false,
      message: 'Provide --approval-id or --decision-id.',
    };
  }

  const base = normalizeBaseUrl(governanceHubUrl);
  const url =
    opts.endpointUrlOverride ||
    // Default to an approvals endpoint; governance hub implementations may differ, so allow override.
    `${base}/functions/v1/approval-approve`;

  const body = {
    approval_id: opts.approvalId,
    decision_id: opts.decisionId,
    actor_id: opts.actorId,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kernelApiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      approval_id: opts.approvalId,
      decision_id: opts.decisionId,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }

  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      approval_id: opts.approvalId,
      decision_id: opts.decisionId,
      message: payload?.message || payload?.error || `Approve failed: ${res.status}`,
    };
  }

  return {
    ok: payload?.ok ?? true,
    approval_id: payload?.approval_id ?? opts.approvalId,
    decision_id: payload?.decision_id ?? opts.decisionId,
    status: payload?.status ?? 'unknown',
    message: payload?.message,
  };
}

