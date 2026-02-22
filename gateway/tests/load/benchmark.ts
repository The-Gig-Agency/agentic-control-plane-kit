/**
 * Performance benchmarks for MCP Gateway
 * 
 * Measures:
 * - Authorization latency (with/without cache)
 * - Tool call latency
 * - Resource read/write latency
 * - Sampling latency
 * - Throughput (requests/second)
 */

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number; // ops/second
}

/**
 * Run benchmark for a function
 */
async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const totalTime = times.reduce((a, b) => a + b, 0);
  const averageTime = totalTime / iterations;
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const throughput = (iterations / totalTime) * 1000;

  return {
    name,
    iterations,
    totalTime,
    averageTime,
    minTime,
    maxTime,
    p50,
    p95,
    p99,
    throughput,
  };
}

/**
 * Print benchmark results
 */
function printBenchmark(result: BenchmarkResult): void {
  console.log(`\n${result.name}:`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total Time: ${result.totalTime.toFixed(2)}ms`);
  console.log(`  Average: ${result.averageTime.toFixed(2)}ms`);
  console.log(`  Min: ${result.minTime.toFixed(2)}ms`);
  console.log(`  Max: ${result.maxTime.toFixed(2)}ms`);
  console.log(`  P50: ${result.p50.toFixed(2)}ms`);
  console.log(`  P95: ${result.p95.toFixed(2)}ms`);
  console.log(`  P99: ${result.p99.toFixed(2)}ms`);
  console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
}

Deno.test('Benchmark - Authorization with cache', async () => {
  // This would require actual gateway setup
  // Placeholder for benchmark structure
  const result = await benchmark(
    'Authorization (cached)',
    async () => {
      // Mock authorization call with cache hit
    },
    1000
  );

  printBenchmark(result);
  // Assertions
  // assertEquals(result.averageTime < 10, true, 'Cached authorization should be < 10ms');
});

Deno.test('Benchmark - Authorization without cache', async () => {
  const result = await benchmark(
    'Authorization (uncached)',
    async () => {
      // Mock authorization call without cache
    },
    100
  );

  printBenchmark(result);
  // Assertions
  // assertEquals(result.averageTime < 50, true, 'Uncached authorization should be < 50ms');
});

Deno.test('Benchmark - Tool call', async () => {
  const result = await benchmark(
    'Tool Call',
    async () => {
      // Mock tool call
    },
    1000
  );

  printBenchmark(result);
});

Deno.test('Benchmark - Resource read', async () => {
  const result = await benchmark(
    'Resource Read',
    async () => {
      // Mock resource read
    },
    1000
  );

  printBenchmark(result);
});

Deno.test('Benchmark - Resource write', async () => {
  const result = await benchmark(
    'Resource Write',
    async () => {
      // Mock resource write
    },
    1000
  );

  printBenchmark(result);
});

Deno.test('Benchmark - Sampling create', async () => {
  const result = await benchmark(
    'Sampling Create',
    async () => {
      // Mock sampling create
    },
    100
  );

  printBenchmark(result);
});
