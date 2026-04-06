/**
 * Vercel entrypoint for the hosted gateway.
 *
 * Keep this as a thin wrapper so the Vercel surface shares the same CORS,
 * env handling, and auth behavior as the main HTTP server.
 */

export { handleHttpRequest as default } from '../http-server.ts';
