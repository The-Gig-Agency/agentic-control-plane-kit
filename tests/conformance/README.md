# ACP Conformance Tests

**HTTP-based tests** — run against any `/manage` endpoint, regardless of kernel (TS, Python, Go).

## Usage

```bash
# Set the base URL and a valid API key (with manage.read scope)
export ACP_BASE_URL=http://localhost:8000/api/manage
export ACP_API_KEY=ock_your_test_key_here

npm run test:conformance
```

Or with explicit env:

```bash
ACP_BASE_URL=http://localhost:3000/manage ACP_API_KEY=ock_xxx npm run test:conformance
```

## What Is Tested

1. **Request envelope** — Valid request accepted
2. **Response envelope** — Response has `ok`, `request_id`
3. **Error codes** — Errors use standard codes (VALIDATION_ERROR, SCOPE_DENIED, NOT_FOUND, etc.)
4. **meta.actions** — Returns `actions`, `api_version`, `total_actions`
5. **meta.version** — Returns `api_version`, `schema_version`, `actions_count`
6. **Scope denial** — Insufficient scope returns `SCOPE_DENIED`
7. **Validation** — Missing/invalid params returns `VALIDATION_ERROR`
8. **Unknown action** — Returns `NOT_FOUND`

## Prerequisites

- A running `/manage` endpoint
- An API key with at least `manage.read` scope
- For full coverage: idempotency, rate limit, ceiling adapters configured
