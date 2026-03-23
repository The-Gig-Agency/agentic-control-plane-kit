# MCP Security Gap Analysis And Roadmap

## Purpose

This document translates current MCP security concerns into a concrete ACP roadmap.

It is based on:

- the current ACP implementation in [`gateway/`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway)
- the current hosted product and worker surfaces in [`/Users/rastakit/tga-workspace/repos/echelon-control`](/Users/rastakit/tga-workspace/repos/echelon-control)
- the current three-repo ACP model
- the security framing captured in [echelon_mcp_security_architecture_review.md](/Users/rastakit/Downloads/echelon_mcp_security_architecture_review.md)

This is the canonical cross-repo roadmap for:

- product positioning
- security hardening
- backward-compatible migration sequencing
- parallel work assignment across ACP repos

## Executive Summary

ACP is directionally correct, but it is not yet a complete MCP security layer.

What exists today:

- gateway-side authorization checks
- audit emission
- per-tenant server loading
- hosted signup and API-key issuance
- a basic hosted worker queue
- credential forwarding into Repo C

What is still missing or incomplete:

- strong tool identity and signed connector trust
- runtime isolation for downstream MCP execution
- actor-level identity in gateway authorization and audit
- strict gateway-only routing guarantees
- hard-fail audit guarantees for sensitive actions
- approval execution flow that is complete end-to-end
- worker isolation for hosted agent jobs

The right target state is:

- Echelon as the mandatory secure execution layer between agents and systems of record
- ACP as the cross-repo enforcement stack that provides identity, policy, execution control, audit, approval, and safe connector lifecycle management

## Current State Summary

### Repo A: gateway and ACP kernel surface

Current strengths:

- request-level authorization is enforced in [`gateway/policy.ts`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/policy.ts)
- tenant-aware server loading exists in [`gateway/server-registry.ts`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/server-registry.ts)
- hosted HTTP gateway resolves tenant from API key in [`gateway/auth.ts`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/auth.ts)
- discovery and signup-oriented developer UX exists in [`gateway/http-server.ts`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/http-server.ts)

Current limits:

- actor identity is still effectively the gateway itself
- audit emission is best-effort, not guaranteed
- downstream process execution is not sandboxed
- connector trust is logical, not cryptographic
- hosted and self-hosted server definitions can still resolve into executable commands without signed provenance

### Echelon product repo

Current strengths:

- consumer signup already issues per-tenant keys and verification-gated scopes in [`supabase/functions/consumer-signup/index.ts`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/consumer-signup/index.ts)
- credential storage is already proxied through Repo C in [`supabase/functions/credentials-proxy/index.ts`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/credentials-proxy/index.ts)
- hosted agent jobs support queue, fetch, ack, and user/tenant membership checks on submission

Current limits:

- hosted workers authenticate with one shared edge token
- worker fetch and ack paths are not tenant-scoped
- several edge functions still allow `Access-Control-Allow-Origin: *`
- admin-to-credential flows are role-based, but not yet approval-aware or policy-linked

## Gap Analysis

## 1. Actor Identity Is Too Weak

### Current state

Gateway actor extraction still collapses execution to a system actor in [`gateway/auth.ts:33`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/auth.ts#L33).

Hosted worker auth also uses one shared secret in [`_shared/agent-helpers.ts:82`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/_shared/agent-helpers.ts#L82).

### Why this matters

MCP security depends on knowing:

- which tenant initiated the request
- which API key initiated the request
- which human or agent identity initiated the request
- which runtime or worker executed it

Without that, ACP can authorize by tenant, but not by principal.

### Required outcome

- authorization requests carry tenant, api key, actor, runtime, and session context
- audit logs identify the caller and the executor separately
- hosted worker identity becomes per-worker or per-runtime, not one global secret

## 2. Hosted Worker Isolation Is Not Safe Enough

### Current state

Any caller with the shared worker token can claim the oldest queued job across all tenants in [`agent-next/index.ts:26`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/agent-next/index.ts#L26).

The same shared token can mark any job done or failed by id in [`agent-ack/index.ts:34`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/agent-ack/index.ts#L34).

### Why this matters

This is not strong execution isolation. It creates a cross-tenant blast radius inside the hosted runtime path.

### Required outcome

- worker claims must be scoped to allowed tenants or queues
- worker identities must be unique and revocable
- ack operations must verify worker ownership of the claim
- job lease, claim token, and replay protection must exist

## 3. Tool And Connector Identity Are Not Cryptographically Trusted

### Current state

Dynamic server loading accepts server definitions from Repo B and can directly execute `command` and `args` in self-hosted mode in [`gateway/server-registry.ts:197`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/server-registry.ts#L197).

Downstream stdio processes are spawned directly in [`gateway/process-manager.ts:78`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/process-manager.ts#L78).

### Why this matters

MCP introduces supply-chain risk at the tool layer. A malicious or tampered MCP server is not just a bad API. It is executable behavior with credentials and side effects.

### Required outcome

- signed connector manifests
- immutable version or digest pinning
- registry allowlists
- trust policy before spawn or connection
- staged connector rollout and revocation

## 4. Runtime Containment Is Incomplete

### Current state

The process manager handles lifecycle, but it does not enforce runtime isolation boundaries beyond spawning the command. There is no per-server egress policy, sandbox profile, UID drop, or syscall restriction in [`gateway/process-manager.ts:72`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/process-manager.ts#L72).

### Why this matters

Authorization does not protect against a compromised MCP server process after it starts running.

### Required outcome

- isolation class per connector
- outbound network allowlists
- container or microVM isolation for high-risk connectors
- short-lived execution sandboxes for untrusted connectors

## 5. Audit Is Best-Effort, Not Guaranteed

### Current state

Gateway audit emission explicitly fails silently in [`gateway/audit.ts:67`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/audit.ts#L67).

### Why this matters

For low-risk operations this is tolerable.
For approvals, write operations, and regulated actions, it is not.

### Required outcome

- risk-tiered audit semantics
- hard-fail if audit persistence is unavailable for sensitive classes of actions
- durable outbox and replay for audit transport

## 6. Prompt Injection And Tool Output Mediation Are Not Explicit Controls Yet

### Current state

Tool metadata and tool output are proxied through the gateway, but there is no first-class sanitization or trust classification layer in the current proxy flow. Tool aggregation largely passes descriptions through from downstream MCP servers in [`gateway/proxy.ts:232`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/proxy.ts#L232).

### Why this matters

MCP-specific prompt injection often enters through:

- tool descriptions
- prompt catalogs
- tool output content
- resources returned from connectors

### Required outcome

- treat all downstream tool metadata and output as untrusted
- support response filtering and trust annotations
- isolate policy instructions from model-consumable tool content

## 7. Approval Workflow Is Described Better Than It Is Enforced

### Current state

The gateway handles `require_approval` as an authorization denial path in [`gateway/policy.ts:118`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/policy.ts#L118), but the cross-repo execution of approval issuance, approval fulfillment, resumption, and replay-safe completion is not yet the primary documented runtime path.

### Why this matters

For enterprise buyers, approvals are not optional metadata. They are a core enforcement and accountability primitive.

### Required outcome

- approval objects with stable ids
- resumable execution after approval
- expiration, cancellation, and audit
- explicit product UX for pending approvals and release of execution

## 8. Backward Compatibility Must Be Managed Explicitly

### Current state

Hosted signup currently returns a single `api_key` and keeps verification gating in place in [`consumer-signup/index.ts:300`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/consumer-signup/index.ts#L300).

### Why this matters

ACP already has product-facing flows in the market. Security tightening cannot require a flag day.

### Required outcome

- preserve existing signup contract while introducing richer identity and key metadata
- preserve existing `X-API-Key` gateway auth while adding stronger key typing and actor mapping
- preserve existing hosted worker flows while introducing queue-scoped worker credentials

## Backward-Compatible Migration Rules

These rules apply to all phases.

### Rule 1: Keep current gateway request shape working

Current clients using:

- `X-API-Key`
- `/mcp`
- `/meta.discover`
- signup then verify-email flow

must keep working during the migration.

### Rule 2: Additive contracts first, enforcement later

Prefer:

- new fields
- new scopes
- new key metadata
- new audit fields
- new queue claim tokens

before removing old fields or tightening old paths.

### Rule 3: Separate identity enrichment from denial logic

Example:

- Phase A: attach `api_key_id`, `actor_type`, `worker_id`, `runtime_id` to audit and policy payloads
- Phase B: start enforcing worker-to-tenant binding and actor-specific rules

### Rule 4: Keep legacy connectors runnable while introducing trust levels

Connector trust model should be:

- `legacy_unverified`
- `verified_manifest`
- `signed_digest_pinned`

Policy can then deny high-risk usage of legacy connectors before fully removing them.

### Rule 5: Risk-tiered fail-closed rollout

Do not instantly fail-closed on all audit outages or trust metadata gaps.

Instead:

- tier 0 read/list operations can continue with warning
- tier 1 write operations require durable audit
- tier 2 financial, infra, and destructive actions require durable audit and approval

## Product And Security Roadmap

## Phase 0: Fix The Immediate Exposure Paths

Objective:

- remove the most dangerous current-state gaps without breaking product flows

### Repo work

#### Echelon product repo

- replace shared worker token model with worker registration records and per-worker secrets
- scope `agent-next` claims by allowed tenant set
- require claim ownership in `agent-ack`
- add job lease expiry and claim token
- tighten `credentials-proxy` and related admin edge functions to explicit allowed origins where browser access is needed

#### Repo A

- add actor enrichment to gateway auth and audit payloads without changing request contract
- emit `api_key_id` and `actor_type` when available
- add audit transport health metric

### Backward compatibility

- continue accepting current worker auth header for a temporary deprecation window
- issue new worker credentials alongside old global secret
- support both old and new audit event envelopes during transition

### Success criteria

- no shared worker token with cross-tenant claim power
- audit contains api key or runtime identity when available
- existing signup and gateway client flow unchanged

## Phase 1: Identity, Key Types, And Audit Hardening

Objective:

- make ACP principal-aware and traceable end-to-end

### Repo work

#### Repo B

- extend API key lookup to return:
  - `tenant_id`
  - `api_key_id`
  - `key_type`
  - `actor_type`
  - `status`
  - `scope_set`
- support worker identity and runtime identity records

#### Repo A

- update [`gateway/auth.ts`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/auth.ts) to map API key to actor identity, not just tenant
- include actor identity in authorization requests
- add durable audit outbox for tier 1 and tier 2 actions
- keep best-effort audit only for low-risk reads

#### Echelon product repo

- expose worker registration and revocation UX
- show audit identity fields in admin views

### Backward compatibility

- keep `extractTenantFromApiKey()` behavior, but return richer metadata behind the scenes
- keep the existing signup response field `api_key`
- add `api_key_id`, `key_type`, and `allowed_scopes` as additive fields

### Success criteria

- every execution trace has tenant, api key, actor, and runtime identity
- high-risk writes fail if durable audit cannot be recorded

## Phase 2: Tool Trust And Connector Registry Security

Objective:

- move from logical connectors to trusted connectors

### Repo work

#### Repo B

- add connector registry metadata:
  - trust level
  - signer
  - digest
  - version
  - risk class
  - allowed deployment modes

#### Repo A

- verify connector manifest before use
- block untrusted connectors for high-risk tenants by policy
- require digest pinning for hosted connectors
- mark self-hosted `command/args` connectors as `legacy_unverified` until verified

#### Repo C

- support per-connector execution profiles
- map connector trust level to execution isolation tier

### Backward compatibility

- do not break legacy connectors immediately
- allow tenants to continue using legacy connectors in low-risk mode
- provide warnings, trust labels, and policy enforcement knobs first

### Success criteria

- connectors have cryptographic identity and version trust metadata
- high-risk connector classes cannot run in anonymous legacy mode

## Phase 3: Runtime Isolation And Gateway-Only Execution

Objective:

- ensure policy is backed by real containment

### Repo work

#### Repo A

- introduce execution classes:
  - `local_low_risk`
  - `network_restricted`
  - `isolated_container`
  - `remote_executor_only`
- prevent direct spawn for connector classes that require isolated execution

#### Repo C

- become the default execution target for high-risk connectors
- enforce egress allowlists and short-lived credentials
- return sanitized responses to the gateway

#### Echelon product repo

- surface connector isolation class in admin UI
- show migration warnings when tenants use connector types scheduled for stricter isolation

### Backward compatibility

- keep direct stdio and HTTP connector execution for low-risk classes during transition
- require Repo C execution only for financial, cloud infra, destructive, or secret-heavy connectors first

### Success criteria

- approval and policy are not the only line of defense
- high-risk connectors execute only in hardened runtime paths

## Phase 4: Approval As A First-Class Execution Primitive

Objective:

- turn approval from a deny response into a resumable execution workflow

### Repo work

#### Repo B

- create approval objects and lifecycle state
- support approver identity, timeout, cancellation, and decision logs

#### Repo A

- emit `require_approval` as a structured pending result with approval id
- support replay-safe resume after approval
- bind approval to request hash, actor, and tenant

#### Echelon product repo

- add approval inbox and execution preview
- show what was blocked, why, and what will run if approved

### Backward compatibility

- existing deny behavior can remain for connectors or tenants that do not yet support resumable approval flow
- enable resumable approvals per action family

### Success criteria

- approvals are enforceable, auditable, and resumable
- enterprises can govern sensitive actions without breaking agent workflows

## Phase 5: Prompt-Injection-Resistant Tool Mediation

Objective:

- reduce trust in MCP metadata and tool output

### Repo work

#### Repo A

- classify downstream content as untrusted
- add optional output mediation filters
- add connector metadata fields for prompt-injection risk
- support policy on tool descriptions, prompts, and response classes

#### Repo B

- allow policies to gate tools by content trust class and connector trust class

### Backward compatibility

- start with observability mode
- log suspicious tool metadata and output patterns before enforcing blocks

### Success criteria

- ACP has explicit MCP-native defenses, not just generic API governance

## Recommended Work Split For Codex And Cursor

## Codex-first slices

- worker isolation redesign for [`echelon-control`](/Users/rastakit/tga-workspace/repos/echelon-control)
- gateway auth and audit identity enrichment in [`agentic-control-plane-kit/gateway`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway)
- backward-compatible contract docs and migration guides
- approval and audit state-model design docs

## Cursor-friendly slices

- admin UX for worker registration, revocation, and tenant binding
- audit UI additions
- approval inbox UI
- connector trust labeling UI
- migration warnings and status views in Echelon product surfaces

## Parallelizable workstreams

### Workstream A: Worker isolation

- repo: `echelon-control`
- scope: `agent-next`, `agent-ack`, worker credentials, queue claims

### Workstream B: Gateway identity and audit

- repo: `agentic-control-plane-kit`
- scope: `gateway/auth.ts`, `gateway/audit.ts`, `gateway/http-server.ts`

### Workstream C: Connector trust model

- repo: Repo B plus Repo A
- scope: registry schema, trust metadata, enforcement

### Workstream D: Approval lifecycle

- repo: Repo B plus Echelon product repo
- scope: approval objects, UX, resumable execution

## Immediate Implementation Order

1. Fix hosted worker isolation in `echelon-control`.
2. Add actor and api key identity enrichment to gateway authorization and audit.
3. Add durable audit semantics for high-risk actions.
4. Introduce connector trust levels and trust labels without hard breaks.
5. Gate high-risk connectors behind hardened execution classes.
6. Build resumable approvals.

## Repo-Specific Findings To Carry Forward

### Critical

- Shared hosted worker token and unscoped job claim path in [`agent-next/index.ts:26`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/agent-next/index.ts#L26)
- Shared hosted worker token and unrestricted job status update path in [`agent-ack/index.ts:34`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/agent-ack/index.ts#L34)

### High

- Gateway actor identity still collapses to system actor in [`gateway/auth.ts:33`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/auth.ts#L33)
- Audit emission is still best-effort in [`gateway/audit.ts:67`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/audit.ts#L67)
- Direct command execution from registry-supplied server definitions in [`gateway/server-registry.ts:197`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/server-registry.ts#L197)

### Medium

- Credentials proxy still allows wildcard CORS in [`credentials-proxy/index.ts:4`](/Users/rastakit/tga-workspace/repos/echelon-control/supabase/functions/credentials-proxy/index.ts#L4)
- Tool metadata aggregation is still passthrough-oriented in [`gateway/proxy.ts:232`](/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/gateway/proxy.ts#L232)

## Status

Planning only. This document does not itself change runtime behavior.
