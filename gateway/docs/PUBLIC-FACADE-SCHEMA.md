# Public Facade Schema

Status: maintainer planning reference

Current implementation status:

- `GET /discover`, `POST /register`, `POST /evaluate`, `POST /execute`, and `GET /audit` now exist as additive HTTP facade routes in `gateway/http-server.ts`
- legacy MCP discovery (`GET /meta.discover`) and MCP transport (`POST /mcp`) remain supported for existing adopters during migration
- `/audit` is currently **unavailable** (returns `501`) until a stable product-shaped audit query backend is finalized

Purpose:

- define the first product-facing gateway contract for Echelon
- replace raw discovery leaks such as `registry_endpoints`, `governance_endpoints`, and `functions/v1/...`
- give follow-on implementation work stable request and response shapes

Primary type reference:

- `gateway/public-facade-types.ts`

## Public Endpoint Set

The target public gateway contract is:

- `GET /discover`
- `POST /register`
- `POST /evaluate`
- `POST /execute`
- `GET /audit`

These endpoints are product-facing aliases. They should not expose Repo B or Repo C endpoint topology in payloads.

## Endpoint Schemas

### `GET /discover`

Purpose:

- return product-facing gateway metadata
- expose product command URLs
- expose connector inventory without raw registry vocabulary

Response type:

- `PublicDiscoverResponse`

Current ACP source material:

- `gateway/discovery.ts`
- `gateway/http-server.ts`

Current leak being replaced:

- `meta.discover`
- `registry_endpoints`
- `governance_endpoints`
- raw `functions/v1` URLs

### `POST /register`

Purpose:

- create or link a project-environment-connector registration using product nouns
- return the next dashboard or workflow action instead of backend wiring

Request type:

- `PublicRegisterRequest`

Response type:

- `PublicRegisterResponse`

Current ACP source material:

- `gateway/discovery.ts`
- `gateway/docs/DISCOVERY-PROTOCOL.md`

Current leak being replaced:

- `mcp.register`
- tenant join and tenant directory terminology in the public discovery path

### `POST /evaluate`

Purpose:

- request a product-facing policy decision before a connector action is executed

Request type:

- `PublicEvaluateRequest`

Response type:

- `PublicEvaluateResponse`

Current ACP source material:

- gateway authorization and policy flow
- current Repo B authorize path behind the gateway

Current leak being replaced:

- `authorize` as a raw backend concern
- internal decision payloads leaking repo boundaries

### `POST /execute`

Purpose:

- execute an approved connector action through the public facade
- return execution status and audit linkage using product terms

Request type:

- `PublicExecuteRequest`

Response type:

- `PublicExecuteResponse`

Current ACP source material:

- gateway proxy execution path
- Repo C execution behind the gateway

Current leak being replaced:

- raw MCP or executor transport vocabulary in public examples

### `GET /audit`

Purpose:

- expose product-facing audit query results for project activity

Current status:

- This endpoint returns `501 Not Implemented` until a stable audit query backend is available.
- **It must not return a placeholder “success” response** that implies audit data exists when it does not.

Request type:

- `PublicAuditRequest`

Response type:

- `PublicAuditResponse`

Until implemented, error responses are:

- `501` with `{ error: "audit_unavailable", message: string }`

Current ACP source material:

- existing audit emission and query concepts

Current leak being replaced:

- repo-boundary audit ingestion and query endpoint names

## Field Mapping Guidance

### Discovery Mapping

Current internal fields:

- `gateway_id`
- `gateway_version`
- `available_servers`
- `registry_endpoints`
- `governance_endpoints`

Target public fields:

- `gateway.name`
- `gateway.version`
- `commands`
- `connectors`

Rule:

- flatten internal capability metadata into product commands and connector summaries

### Registration Mapping

Current internal concepts:

- tenant discovery
- tenant join
- API key issuance
- server registration

Target public concepts:

- project
- environment
- connector
- dashboard URL
- next action

Rule:

- the registration response should guide the user forward without revealing internal onboarding choreography

Bootstrap relation:

- app-local bootstrap wrappers (for example SaaS-specific onboarding helpers) should converge on this public registration contract over time
- current wrappers may still orchestrate tenant creation, API key issuance, server registration, and first heartbeat behind the scenes
- the public product contract should expose a stable `/register` story even if existing adopters still use app-local bootstrap functions internally during migration

### Evaluate and Execute Mapping

Current internal concepts:

- policy authorize
- decision cache
- executor dispatch
- audit event emission

Target public concepts:

- decision
- risk
- approval
- execution
- audit

Rule:

- keep decision and execution ids stable, but product-shaped

## Immediate Implementation Notes

1. Keep `meta.discover` working during transition, but treat `/discover` as the target public contract.
2. Build adapters from current discovery output into `PublicDiscoverResponse` rather than rewriting all gateway internals first.
3. Keep raw `functions/v1` URLs out of the new public response payloads.
4. Use `gateway/public-facade-types.ts` as the reference point for implementation and tests.
