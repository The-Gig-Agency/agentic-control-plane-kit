# MCP Gateway Test Suite

## Overview

This directory contains the test suite for the MCP Gateway, organized by test type:

- **`unit/`** - Unit tests for individual modules
- **`integration/`** - Integration tests with mocked dependencies
- **`e2e/`** - End-to-end tests with real or mocked MCP servers
- **`load/`** - Load and performance tests

## Running Tests

### Unit Tests

```bash
deno test gateway/tests/unit/
```

### Integration Tests

```bash
deno test gateway/tests/integration/
```

### End-to-End Tests

```bash
# Requires environment variables and config
export ACP_BASE_URL="https://your-governance-hub.supabase.co"
export ACP_KERNEL_KEY="your_key"
export ACP_TENANT_ID="your_tenant_id"

deno test gateway/tests/e2e/
```

### Load Tests

```bash
deno test gateway/tests/load/
```

### All Tests

```bash
deno test gateway/tests/
```

## Test Coverage

### Unit Tests ✅

- ✅ `policy.test.ts` - **Authorization flow & fail-closed behavior**
  - Allows when decision is allow
  - Throws AuthorizationError on deny
  - Throws AuthorizationError on require_approval
  - Fail-closed on network error
  - Fail-closed on timeout
  - Uses cache for allow decisions
  - Does not cache deny decisions

- ✅ `cache-ttl.test.ts` - **TTL cache behavior**
  - Respects TTL and expires entries
  - Different TTLs work independently
  - Uses decision_ttl_ms when provided
  - Cleanup removes expired entries

- ✅ `namespace.test.ts` - **Namespace resolution**
  - Resolves tool to correct server by prefix
  - Throws on unknown tool prefix
  - Handles tools without prefix
  - Strip/add prefix round trip

- ✅ `cache.test.ts` - Authorization cache functionality
- ✅ `config.test.ts` - Configuration loading and validation

### Integration Tests ✅

- ✅ `proxy-integration.test.ts` - **MCP proxy with mock server**
  - Handles healthy MCP server response
  - Handles MCP server crash gracefully
  - Handles malformed MCP response

- ✅ `mock-mcp-server.ts` - Mock MCP server for testing

### E2E Tests ✅

- ✅ `gateway-e2e.test.ts` - **Full gateway flow with filesystem MCP**
  - Blocks unauthorized tool call (deny path)
  - Allows authorized tool call (allow path)

### Load Tests

- ✅ `load-test.ts` - Load testing framework
- ✅ `benchmark.ts` - Performance benchmarks

## Test Requirements

### Environment Variables

For E2E and integration tests:

```bash
export ACP_BASE_URL="https://your-governance-hub.supabase.co"
export ACP_KERNEL_KEY="your_kernel_key"
export ACP_TENANT_ID="your_tenant_uuid"
```

### Mock MCP Servers

For testing, you can use simple mock MCP servers or real ones:

```json
{
  "servers": {
    "mock": {
      "command": "node",
      "args": ["./tests/mocks/mock-mcp-server.js"],
      "tool_prefix": "mock."
    }
  }
}
```

## Writing Tests

### Unit Test Example

```typescript
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { functionToTest } from '../../module.ts';

Deno.test('functionToTest - does something', () => {
  const result = functionToTest('input');
  assertEquals(result, 'expected');
});
```

### Integration Test Example

```typescript
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ClassToTest } from '../../module.ts';

Deno.test('ClassToTest - integration test', async () => {
  const instance = new ClassToTest(mockDependency);
  const result = await instance.method();
  assertEquals(result, 'expected');
});
```

## Coverage Goals

- **Unit Tests:** 80%+ coverage
- **Integration Tests:** All critical paths
- **E2E Tests:** All user-facing flows
- **Load Tests:** Performance benchmarks

## Continuous Integration

Tests should run automatically on:
- Pull requests
- Commits to main branch
- Pre-deployment

## Notes

- Tests use Deno's built-in test runner
- Mock dependencies where appropriate
- Use real servers for E2E tests when possible
- Load tests should be run in isolated environments
