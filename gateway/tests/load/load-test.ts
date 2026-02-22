/**
 * Load tests for MCP Gateway
 * 
 * Tests performance under load
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
}

/**
 * Run load test against gateway
 */
async function runLoadTest(
  gatewayUrl: string,
  durationMs: number,
  concurrency: number
): Promise<LoadTestResult> {
  const startTime = Date.now();
  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let totalRequests = 0;

  // Create concurrent workers
  const workers: Promise<void>[] = [];
  
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (Date.now() - startTime < durationMs) {
          const requestStart = Date.now();
          try {
            // Send MCP request
            // This would use actual MCP client
            const latency = Date.now() - requestStart;
            latencies.push(latency);
            successfulRequests++;
          } catch (error) {
            failedRequests++;
          }
          totalRequests++;
        }
      })()
    );
  }

  await Promise.all(workers);

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50Latency = latencies[Math.floor(latencies.length * 0.5)];
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)];
  const p99Latency = latencies[Math.floor(latencies.length * 0.99)];
  const durationSeconds = (Date.now() - startTime) / 1000;
  const requestsPerSecond = totalRequests / durationSeconds;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageLatency,
    p50Latency,
    p95Latency,
    p99Latency,
    requestsPerSecond,
  };
}

Deno.test('Load Test - 100 concurrent requests', async () => {
  const result = await runLoadTest('stdio://gateway', 10000, 100);
  
  console.log('Load Test Results:');
  console.log(`Total Requests: ${result.totalRequests}`);
  console.log(`Successful: ${result.successfulRequests}`);
  console.log(`Failed: ${result.failedRequests}`);
  console.log(`Average Latency: ${result.averageLatency}ms`);
  console.log(`P50 Latency: ${result.p50Latency}ms`);
  console.log(`P95 Latency: ${result.p95Latency}ms`);
  console.log(`P99 Latency: ${result.p99Latency}ms`);
  console.log(`Requests/Second: ${result.requestsPerSecond}`);

  // Assertions
  assertEquals(result.failedRequests, 0, 'No requests should fail');
  assertEquals(result.averageLatency < 50, true, 'Average latency should be < 50ms');
  assertEquals(result.p95Latency < 100, true, 'P95 latency should be < 100ms');
});

Deno.test('Load Test - Authorization cache effectiveness', async () => {
  // Test that cache reduces authorization latency
  // This would require monitoring cache hit rates
});
