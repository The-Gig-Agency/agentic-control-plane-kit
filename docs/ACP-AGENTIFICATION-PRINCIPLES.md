# ACP Agentification Principles

This document defines the default architectural rule for agentifying an existing SaaS, internal tool, or worker system with ACP.

## Default Rule

When adopting ACP, treat the host application's internal runtime as a protected implementation detail.

ACP should integrate through a narrow, explicit `/manage` control surface, not by being installed directly into core business processes.

In practice:

- keep the host application's core request handlers, workers, jobs, and business logic where they are
- expose a small management facade on top of those internals
- let ACP govern that facade
- avoid giving ACP direct, arbitrary access to internal services, database tables, or runtime code paths

This is the default pattern for ACP-powered agentification.

## Why This Is The Default

### Stability

Core product execution should stay decoupled from agent control.

The host app can evolve its internal implementation without breaking the ACP contract, and ACP can evolve its governance model without destabilizing the product runtime.

### Safety

An explicit `/manage` surface gives you:

- allowlisted actions
- approval boundaries
- idempotency rules
- audit events
- scoped credentials

Direct access to internals makes it too easy for an agent to perform broad or unintended mutations.

### Portability

ACP scales better across many products when each system exposes the same kind of control facade:

- inspect
- configure
- pause
- resume
- trigger
- audit

That is much more reusable than deep, custom in-process integrations for every repo.

### Maintainability

Internal code changes often.

A versioned management contract can stay small and stable even when the host application's internals change significantly.

### Multi-agent Coordination

Codex, Cursor, hosted agents, and future ACP runtimes should all hit the same governed surface.

That only works cleanly if the system exposes one explicit operator boundary.

## Recommended Shape

For an existing host product, ACP should sit on top of a product-specific management facade.

Typical flow:

1. The host app exposes a `/manage` layer or equivalent control API.
2. That layer wraps explicit operations on the host system.
3. ACP governs who can invoke those operations, under what conditions, with what audit trail.

ACP should generally manage systems from the outside through a controlled surface, not become entangled with the application's internal execution path.

## What Belongs In The Manage Layer

Good first ACP-managed actions are:

- status and health inspection
- queue and worker visibility
- policy reads and controlled overrides
- tenant or org configuration inspection
- safe maintenance actions
- replay, retry, or requeue flows
- recent audit and activity inspection

Examples:

- `manage.org.summary`
- `manage.pipeline.summary`
- `manage.agent.status`
- `manage.agent.set_enabled`
- `manage.policy.get_effective`
- `manage.policy.set_override`
- `manage.outreach.activity`
- `manage.provider.usage`

## What Should Not Be Exposed First

Avoid exposing these directly as initial ACP actions:

- arbitrary SQL or database writes
- unrestricted admin tokens
- direct access to core service internals
- raw secret retrieval
- broad billing or identity mutations
- unrestricted outbound communications

If these capabilities are ever exposed, they should sit behind a higher-risk action class with stronger approval and audit requirements.

## Design Requirements For A Good Manage Layer

The host-facing control surface should be:

- explicit
- small
- versioned
- auditable
- idempotent where possible
- scoped by tenant, org, or resource
- safe to deny by default

Each action should have:

- a clear name
- a typed request shape
- a typed response shape
- a clear impact level
- a clear audit record

## Preferred Integration Pattern

For most existing systems:

- do not install ACP into the core runtime as the primary control mechanism
- do not let ACP orchestrate by improvising against internal modules
- do not couple ACP directly to internal tables or hidden process assumptions

Instead:

- wrap the host product with a management facade
- keep host internals private
- let ACP govern the facade

## Exceptions

This rule can be bent, but only deliberately.

Reasonable exceptions include:

- a new greenfield system designed around ACP from day one
- lightweight in-process hooks for emitting events, audit records, or policy checkpoints
- a runtime where ACP itself is intentionally the core execution layer

Even in these cases, the preferred shape is still a clear control boundary rather than unrestricted access to internals.

## Rule Of Thumb

Use this mental model:

- host app = engine
- ACP = governed operator cockpit
- `/manage` layer = gearbox between them

If ACP needs to control a system, the default answer should be:

build or expose the management facade first, then connect ACP to that facade.
