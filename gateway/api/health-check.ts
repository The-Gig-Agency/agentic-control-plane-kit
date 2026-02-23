/**
 * Health check script for Docker HEALTHCHECK
 */

const port = parseInt(Deno.env.get('PORT') || '8000');
const url = `http://localhost:${port}/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (response.ok) {
    Deno.exit(0);
  } else {
    Deno.exit(1);
  }
} catch {
  Deno.exit(1);
}
