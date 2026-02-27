# Decision Token Implementation Checklist

Status: planning only. Do not implement from this file until the rollout order is approved.

## Purpose

Close the current trust gap where Repo C can execute allowlisted actions with only a service key, without cryptographic proof that Repo B approved the specific request.

The target control is:

- Repo B issues a short-lived signed decision token for `allow` decisions.
- Repo A forwards that token with the exact execution request sent to Repo C.
- Repo C verifies the token signature, expiry, and request binding before execution.

## Repos In Scope

- Repo B: `governance-hub`
- Repo C: `key-vault-executor`
- Repo A installs in this workspace:
- `agentic-control-plane-kit`
- `ciq-automations`
- `api-docs-template`
- Additional Repo A installs not currently present here should follow the same Repo A checklist (for example, `onsite-affiliate` when available).

## Shared Contract

- [ ] Choose token format: compact signed token (JWT-style `HS256` is the shortest path).
- [ ] Add `DECISION_SIGNING_SECRET` to Repo B and Repo C environments.
- [ ] Use `X-Decision-Token` as the Repo A -> Repo C transport header.
- [ ] Keep `request_hash` as the binding mechanism for the exact execution payload.
- [ ] Define a single canonical hashing rule for Repo A:
- Hash the exact Repo C payload fields: `tenant_id`, `integration`, `action`, `params`.
- Do not hash a looser pre-normalized object.
- [ ] Standardize token TTL (recommended: 30 to 60 seconds).

## Token Claims

- [ ] `iss = governance-hub`
- [ ] `aud = key-vault-executor`
- [ ] `jti` unique token id
- [ ] `decision_id`
- [ ] `decision = allow`
- [ ] `org_id`
- [ ] `kernel_id`
- [ ] `tenant_id`
- [ ] `integration`
- [ ] `action`
- [ ] `request_hash`
- [ ] `policy_id` (if present)
- [ ] `policy_version`
- [ ] `iat`
- [ ] `exp`

## Repo B Checklist (`governance-hub`)

- [ ] Add a small signing helper for base64url + `HS256`.
- [ ] Add `decision_token` to the `/functions/v1/authorize` response contract.
- [ ] Update `supabase/functions/authorize/index.ts`:
- Derive claims from authenticated values, not only request body values.
- Mint a token only when `decision === "allow"`.
- Do not mint a token for `deny` or `require_approval`.
- [ ] Update request validation as needed so Repo B can bind the token to `integration` as well as `action`, `tenantId`, and `request_hash`.
- [ ] Keep existing response fields unchanged for backward compatibility.
- [ ] Add tests:
- `allow` returns `decision_token`
- `deny` does not return `decision_token`
- token claims match expected values
- kernel-authenticated callers cannot spoof `kernelId`

## Repo A Checklist (apply to every install)

- [ ] Update the Repo B authorize client type to include `decisionToken` / `decision_token`.
- [ ] Update the Repo B authorize request payload to include `integration` if Repo B does not already receive it.
- [ ] Build the exact Repo C execution payload first.
- [ ] Compute `request_hash` from that final Repo C payload.
- [ ] Send that same `request_hash` to Repo B during authorization.
- [ ] Preserve the returned `decision_token` after an `allow` result.
- [ ] Send `X-Decision-Token` when calling Repo C.
- [ ] Continue sending `policy_decision_id` for audit correlation.
- [ ] Add a temporary feature flag for migration safety (example: `ACP_REQUIRE_DECISION_TOKEN`).
- In soft mode: warn if Repo B does not return a token.
- In hard mode: fail closed for write actions if the token is missing.
- [ ] Add tests:
- authorize returns and propagates `decision_token`
- the same `request_hash` is used for authorize and execute
- deny and approval-required flows still stop before Repo C execution

## Repo A Install Targets In This Workspace

### `agentic-control-plane-kit`

- [ ] Patch the shared kernel/control-plane adapter to parse and expose `decision_token`.
- [ ] Patch the Repo C execution client to send `X-Decision-Token`.
- [ ] Update any docs or examples that describe Repo B authorize or Repo C execute.

### `ciq-automations`

- [ ] Patch `supabase/functions/_shared/control-plane/kernel/control-plane-adapter.ts`.
- [ ] Patch `supabase/functions/_shared/control-plane/kernel/router.ts`.
- [ ] Patch any Repo C execution call path to forward `X-Decision-Token`.
- [ ] Update `INTEGRATION.md` and any executor docs.

### `api-docs-template`

- [ ] Identify the active Repo A control-plane adapter and execution call path in the current branch.
- [ ] Patch authorize response parsing and execution forwarding.
- [ ] Update onboarding and integration docs to include the token requirement.

### Future Repo A installs (for example `onsite-affiliate`)

- [ ] Apply the same Repo A checklist before Repo C hard enforcement is enabled.
- [ ] Verify that direct Repo C calls are not bypassing the shared adapter.

## Repo C Checklist (`key-vault-executor`)

- [ ] Add a token verification helper for parse + `HS256` verification.
- [ ] Update `supabase/functions/execute/index.ts` to read `X-Decision-Token`.
- [ ] Verify:
- signature
- `iss`
- `aud`
- `exp`
- `decision === "allow"`
- claim match for `tenant_id`
- claim match for `integration`
- claim match for `action`
- claim match for `request_hash`
- [ ] Keep service key authentication in place.
- Repo C should require both a valid service key and a valid decision token.
- [ ] Add a soft-enforcement env flag (example: `REQUIRE_DECISION_TOKEN`).
- Soft mode: log missing or invalid tokens and allow temporarily.
- Hard mode: reject missing or invalid tokens.
- [ ] Decide whether to add replay protection:
- Phase 1: rely on short TTL
- Phase 2: track `jti` briefly and reject reuse
- [ ] Add tests:
- missing token
- invalid signature
- expired token
- mismatched `request_hash`
- mismatched `tenant_id`
- valid token succeeds

## Rollout Sequence

- [ ] Step 1: deploy Repo B token issuance first (non-breaking).
- [ ] Step 2: deploy Repo A updates across all installed kernels.
- [ ] Step 3: deploy Repo C with soft enforcement only.
- [ ] Step 4: monitor for callers still missing tokens.
- [ ] Step 5: patch remaining Repo A installs.
- [ ] Step 6: switch Repo C to hard enforcement.
- [ ] Step 7: remove any legacy assumption that a service key alone is sufficient for execution authorization.

## Validation Gates Before Hard Enforcement

- [ ] Every active Repo A install sends `X-Decision-Token`.
- [ ] Every active Repo A install uses the same `request_hash` in authorize and execute.
- [ ] Repo C logs show no missing-token calls during the observation window.
- [ ] Repo B authorize responses are stable and backward compatible.
- [ ] Incident rollback plan exists:
- switch Repo C back to soft mode
- keep Repo B token issuance enabled

## Done Criteria

- [ ] Repo C can no longer execute a write-capable request with only a service key.
- [ ] A direct Repo C call without a valid Repo B token is rejected.
- [ ] Authorized Repo A calls continue to succeed.
- [ ] Audit records still preserve `policy_decision_id` correlation across Repo A, Repo B, and Repo C.
