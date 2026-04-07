/**
 * HTTP Server for Hosted MCP Gateway
 * 
 * Provides HTTP/WebSocket endpoints for MCP protocol
 * Multi-tenant by default (identifies tenant via API key)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { MCPRequest, MCPResponse } from './types.ts';
import { extractTenantFromApiKey, extractActor } from './auth.ts';
import { Actor } from './types.ts';
import {
  AuthorizationError,
  ValidationError,
} from './errors.ts';
import {
  buildConnectorSummariesFromDiscovery,
  buildPublicErrorResponse,
  buildPublicAuditResponseFromRows,
  buildPublicDiscoverResponse,
  buildPublicEvaluateResponse,
  buildPublicExecuteBlockedResponse,
  buildPublicExecuteSuccessResponse,
  buildPublicRegisterResponse,
  deriveToolName,
} from './public-facade.ts';
import {
  getCorsHeaders,
  getGatewayRuntimeEnv,
} from './runtime-env.ts';
import { initialize } from './server.ts';
import type { MCPProxy } from './proxy.ts';

// Version stamp - shows what container is executing
console.log("GATEWAY_BUILD", "2026-02-23T00:45Z", "git", Deno.env.get("FLY_IMAGE_REF") ?? "no-ref");

const runtimeEnv = getGatewayRuntimeEnv();
console.log("[Gateway] env", {
  ACP_BASE_URL: runtimeEnv.acpOrigin,
  ACP_KERNEL_KEY_set: !!runtimeEnv.kernelApiKey,
  ALLOWED_ORIGINS_count: runtimeEnv.allowedOrigins.length,
  CORS_ALLOW_CREDENTIALS: runtimeEnv.allowCredentials,
});
if (runtimeEnv.environment === 'production' && runtimeEnv.allowedOrigins.length === 0) {
  console.warn('[Gateway] ALLOWED_ORIGINS is empty in production; cross-origin browser access will be denied.');
}

// Initialize gateway (reuse existing initialization)
let initialized = false;
let proxy: MCPProxy | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  
  // Run gateway initialization (loads config, connects to Repo B, spawns MCP servers)
  await initialize();
  
  // Import proxy after initialization
  const { proxy: initializedProxy } = await import('./server.ts');
  proxy = initializedProxy;
  
  initialized = true;
}

async function parseJsonBody(req: Request): Promise<any> {
  const rawRequest = await req.json();

  if (!rawRequest || typeof rawRequest !== 'object') {
    throw new ValidationError('Request must be a JSON object');
  }

  const requestSize = new TextEncoder().encode(JSON.stringify(rawRequest)).length;
  if (requestSize > 1024 * 1024) {
    throw new ValidationError('Request body too large (max 1MB)');
  }

  return rawRequest;
}

function getFacadeActor(apiKey: string, actor?: Partial<Actor>): Actor {
  if (actor?.type && actor?.id) {
    return {
      type: actor.type,
      id: actor.id,
      api_key_id: actor.api_key_id,
    };
  }

  return {
    type: 'api_key',
    id: `api_key:${apiKey.slice(0, 8)}`,
  };
}

/**
 * Handle HTTP request
 * 
 * Exported for use by Vercel serverless functions
 */
export async function handleHttpRequest(req: Request): Promise<Response> {
  try {
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin, runtimeEnv);

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Health check (public, no initialization needed)
    if (path === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Public API documentation (no auth required)
    if ((path === '/docs' || path === '/openapi.json') && req.method === 'GET') {
      const docs = {
        openapi: '3.0.0',
        info: {
          title: 'Echelon MCP Gateway API',
          version: '1.0.0',
          description: 'Hosted, governed proxy service for the Model Context Protocol (MCP)',
        },
        servers: [
          {
            url: 'https://gateway.buyechelon.com',
            description: 'Production gateway',
          },
        ],
        paths: {
          '/meta.discover': {
            get: {
              summary: 'Discover gateway capabilities',
              description: 'Public endpoint to discover gateway capabilities and signup information',
              responses: {
                '200': {
                  description: 'Discovery information',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          gateway: {
                            type: 'object',
                            properties: {
                              signup_api_base: { type: 'string', example: 'https://www.buyechelon.com' },
                              signup_endpoint: { type: 'string', example: '/api/consumer/signup' },
                              registry_endpoints: {
                                type: 'object',
                                properties: {
                                  list_servers: { type: 'string' },
                                  register_server: { type: 'string' },
                                  update_server: { type: 'string' },
                                  delete_server: { type: 'string' },
                                  list_connectors: { type: 'string' },
                                },
                              },
                              governance_endpoints: {
                                type: 'object',
                                properties: {
                                  propose_policy: { type: 'string', example: 'https://governance-hub.supabase.co/functions/v1/policy-propose' },
                                },
                                description: 'Endpoints for proposing governance policies, limits, and runbooks',
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '/mcp': {
            post: {
              summary: 'MCP protocol endpoint',
              description: 'Main MCP protocol endpoint (requires X-API-Key)',
              security: [{ ApiKeyAuth: [] }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        jsonrpc: { type: 'string', example: '2.0' },
                        method: { type: 'string', example: 'tools/list' },
                        params: { type: 'object' },
                      },
                    },
                  },
                },
              },
              responses: {
                '200': { description: 'MCP response' },
                '401': { description: 'X-API-Key header required' },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
              description: 'API key obtained from signup endpoint',
            },
          },
        },
      };
      return new Response(JSON.stringify(docs, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Discovery facade (public, no API key required)
    if ((path === '/discover' || path === '/meta.discover') && req.method === 'GET') {
      try {
        // Try to load config, but handle gracefully if it doesn't exist
        let config;
        let processManager;
        try {
          const { loadConfig } = await import('./config.ts');
          const { ProcessManager } = await import('./process-manager.ts');
          config = loadConfig();
          processManager = new ProcessManager();
        } catch (error) {
          // Config might not exist in serverless - return basic discovery info
          console.warn('[HTTP] Config not found, returning basic discovery info:', error);
          const docsUrl = Deno.env.get('DOCS_URL') || 'https://github.com/The-Gig-Agency/echelon-control';
          const publicResponse = buildPublicDiscoverResponse({
            gatewayName: 'Echelon MCP Gateway',
            version: 'unknown',
            docsUrl,
            connectors: [],
          });

          if (path === '/discover') {
            return new Response(JSON.stringify(publicResponse), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            result: {
              gateway: {
                name: publicResponse.gateway.name,
                gateway_version: publicResponse.gateway.version,
                docs_url: publicResponse.gateway.docs_url,
              },
              servers: [],
              capabilities: {
                tools: true,
                resources: true,
                prompts: true,
                sampling: true,
              },
            },
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const { getDiscoveryInfo } = await import('./discovery.ts');
        const platformUrl = runtimeEnv.acpBaseUrl;
        const signupApiBase = Deno.env.get('SIGNUP_API_BASE') || 'https://www.buyechelon.com';
        const discoveryInfo = await getDiscoveryInfo(
          config,
          processManager,
          `${signupApiBase}/consumer`
        );
        const publicResponse = buildPublicDiscoverResponse({
          gatewayName: discoveryInfo.name || 'Echelon MCP Gateway',
          version: discoveryInfo.gateway_version || 'unknown',
          docsUrl: discoveryInfo.docs_url,
          connectors: buildConnectorSummariesFromDiscovery(discoveryInfo),
        });

        if (path === '/discover') {
          return new Response(JSON.stringify(publicResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          result: {
            gateway: {
              gateway_id: discoveryInfo.gateway_id,
              gateway_version: discoveryInfo.gateway_version,
              name: discoveryInfo.name,
              description: discoveryInfo.description,
              registration_url: discoveryInfo.registration_url,
              registration_required: discoveryInfo.registration_required,
              verification_required_for_write: discoveryInfo.verification_required_for_write,
              verify_email_endpoint: discoveryInfo.verify_email_endpoint,
              unverified_scopes: discoveryInfo.unverified_scopes,
              verified_scopes: discoveryInfo.verified_scopes,
              agent_quickstart: discoveryInfo.agent_quickstart,
              // API endpoints for programmatic signup
              signup_api_base: discoveryInfo.signup_api_base,
              signup_endpoint: discoveryInfo.signup_endpoint,
              // Registry endpoints - full URLs (no path guessing needed)
              registry_endpoints: discoveryInfo.registry_endpoints,
              // Governance endpoints - full URLs for policy management
              governance_endpoints: discoveryInfo.governance_endpoints,
              docs_url: discoveryInfo.docs_url,
            },
            servers: discoveryInfo.available_servers,
            capabilities: discoveryInfo.capabilities,
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[HTTP] Discovery error:', error);
        const docsUrl = Deno.env.get('DOCS_URL') || 'https://github.com/The-Gig-Agency/echelon-control';
        const publicResponse = buildPublicDiscoverResponse({
          gatewayName: 'Echelon MCP Gateway',
          version: 'unknown',
          docsUrl,
          connectors: [],
        });

        if (path === '/discover') {
          return new Response(JSON.stringify(publicResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          result: {
            gateway: {
              name: publicResponse.gateway.name,
              gateway_version: publicResponse.gateway.version,
              docs_url: publicResponse.gateway.docs_url,
            },
            servers: [],
            capabilities: {
              tools: true,
              resources: true,
              prompts: true,
              sampling: true,
            },
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (path === '/register' && req.method === 'POST') {
      try {
        const rawRequest = await parseJsonBody(req);
        const registrationRequest = rawRequest as {
          project?: string;
          env?: 'development' | 'staging' | 'production';
          connector?: string;
          actor_id?: string;
        };

        if (!registrationRequest.project || !registrationRequest.env) {
          throw new ValidationError('project and env are required');
        }

        const platformUrl = runtimeEnv.acpBaseUrl;
        const fallbackResponse = buildPublicRegisterResponse(
          registrationRequest as {
            project: string;
            env: 'development' | 'staging' | 'production';
            connector?: string;
            actor_id?: string;
          },
          `${platformUrl}/onboard/mcp-gateway`
        );

        try {
          const { loadConfig } = await import('./config.ts');
          const { handleRegistration } = await import('./discovery.ts');
          const config = loadConfig();
          const legacyResponse = await handleRegistration(
            {
              agent_id: registrationRequest.project,
              agent_name: registrationRequest.project,
              requested_servers: registrationRequest.connector ? [registrationRequest.connector] : undefined,
            },
            config,
            platformUrl
          );

          return new Response(JSON.stringify(buildPublicRegisterResponse(
            registrationRequest as {
              project: string;
              env: 'development' | 'staging' | 'production';
              connector?: string;
              actor_id?: string;
            },
            legacyResponse.registration_url
          )), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify(fallbackResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (error) {
        const message = error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Invalid JSON';
        return new Response(JSON.stringify({ error: message }), {
          status: error instanceof ValidationError ? 400 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Extract API key from headers only (SECURITY: query params can leak in logs)
    const apiKey = req.headers.get('X-API-Key');

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'X-API-Key header required',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lookup tenant from API key
    let tenantId: string;
    try {
      tenantId = await extractTenantFromApiKey(apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Gateway] extractTenantFromApiKey failed', { message: msg });

      // TEMP: return details for debugging (gated by GATEWAY_DEBUG_ERR or non-prod)
      const debugErr = Deno.env.get('GATEWAY_DEBUG_ERR') === '1' || Deno.env.get('ENVIRONMENT') !== 'production';
      const lookupUrl = `${runtimeEnv.acpBaseUrl}/functions/v1/api-keys-lookup`;

      return new Response(JSON.stringify({
        error: 'Invalid API key',
        ...(debugErr && {
          details: msg,
          lookup_url: lookupUrl,
        }),
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === '/audit' && req.method === 'GET') {
      const url = new URL(req.url);
      const project = url.searchParams.get('project')?.trim() || '';
      const env = (url.searchParams.get('env')?.trim() || 'production') as 'development' | 'staging' | 'production';

      if (!project) {
        return new Response(JSON.stringify({
          error: 'project query param required',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const auditQueryUrl = `${runtimeEnv.acpBaseUrl}/functions/v1/audit-query`;
      try {
        const resp = await fetch(auditQueryUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${runtimeEnv.kernelApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            project,
            env,
            connector: url.searchParams.get('connector')?.trim() || undefined,
            action: url.searchParams.get('action')?.trim() || undefined,
            actor_id: url.searchParams.get('actor_id')?.trim() || undefined,
            decision_id: url.searchParams.get('decision_id')?.trim() || undefined,
          }),
        });

        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => '');
          return new Response(JSON.stringify(buildPublicErrorResponse(
            'audit_backend_error',
            `Audit backend returned ${resp.status}. ${bodyText || 'No details.'}`,
          )), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const payload = await resp.json().catch(() => ({}));
        const rows = (payload?.data?.rows || payload?.rows || payload?.data || []) as Array<Record<string, unknown>>;

        return new Response(JSON.stringify(buildPublicAuditResponseFromRows({
          project,
          env,
          rows,
        })), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify(buildPublicErrorResponse(
          'audit_unavailable',
          `Audit query is currently unavailable. ${message}`,
        )), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (path === '/evaluate' && req.method === 'POST') {
      try {
        const rawRequest = await parseJsonBody(req);
        if (!rawRequest.project || !rawRequest.env || !rawRequest.connector || !rawRequest.action) {
          throw new ValidationError('project, env, connector, and action are required');
        }

        await ensureInitialized();
        if (!proxy) {
          throw new Error('Proxy not initialized');
        }

        const actor = getFacadeActor(apiKey, rawRequest.actor);
        const toolName = deriveToolName(rawRequest.connector, rawRequest.action);
        const decision = await proxy.evaluateToolCall(toolName, rawRequest.input, tenantId, actor);

        return new Response(JSON.stringify(buildPublicEvaluateResponse(decision)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        const message = error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to evaluate request';
        return new Response(JSON.stringify({ error: message }), {
          status: error instanceof ValidationError ? 400 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (path === '/execute' && req.method === 'POST') {
      try {
        const rawRequest = await parseJsonBody(req);
        if (!rawRequest.project || !rawRequest.env || !rawRequest.connector || !rawRequest.action) {
          throw new ValidationError('project, env, connector, and action are required');
        }

        await ensureInitialized();
        if (!proxy) {
          throw new Error('Proxy not initialized');
        }

        const actor = getFacadeActor(apiKey, rawRequest.actor);
        const toolName = deriveToolName(rawRequest.connector, rawRequest.action);

        try {
          const result = await proxy.handleToolCall(
            { name: toolName, arguments: rawRequest.input || {} },
            tenantId,
            actor
          );

          return new Response(JSON.stringify(buildPublicExecuteSuccessResponse({
            executionId: `exec_${Date.now()}`,
            result: result && typeof result === 'object' ? result as Record<string, unknown> : { value: result },
            decisionId: rawRequest.decision_id,
          })), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return new Response(JSON.stringify(buildPublicExecuteBlockedResponse({
              executionId: `exec_${Date.now()}`,
              approvalRequired: error.message.toLowerCase().includes('approval'),
              auditId: error.decisionId || rawRequest.decision_id,
            })), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          throw error;
        }
      } catch (error) {
        const message = error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to execute request';
        return new Response(JSON.stringify({ error: message }), {
          status: error instanceof ValidationError ? 400 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle MCP protocol endpoint
    if (path === '/mcp' || path === '/') {
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'Method not allowed',
        }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Parse and validate MCP request
      let mcpRequest: MCPRequest;
      try {
        const rawRequest = await req.json();
        
        // Validate JSON-RPC 2.0 structure
        if (!rawRequest || typeof rawRequest !== 'object') {
          throw new ValidationError('Request must be a JSON object');
        }
        
        if (rawRequest.jsonrpc !== '2.0') {
          throw new ValidationError('jsonrpc must be "2.0"');
        }
        
        if (!rawRequest.method || typeof rawRequest.method !== 'string') {
          throw new ValidationError('method is required and must be a string');
        }
        
        // Validate params if present
        if (rawRequest.params !== undefined && typeof rawRequest.params !== 'object') {
          throw new ValidationError('params must be an object if provided');
        }
        
        // Enforce request size limit (1MB)
        const requestSize = new TextEncoder().encode(JSON.stringify(rawRequest)).length;
        if (requestSize > 1024 * 1024) {
          throw new ValidationError('Request body too large (max 1MB)');
        }
        
        mcpRequest = rawRequest as MCPRequest;
      } catch (error) {
        if (error instanceof ValidationError) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32602,
              message: 'Invalid params',
              data: error.message,
            },
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : 'Invalid JSON',
          },
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract actor (system actor for now, could be enhanced to use API key)
      const actor = extractActor();

      // Ensure gateway is initialized (proxy should be available)
      await ensureInitialized();
      
      if (!proxy) {
        throw new Error('Proxy not initialized');
      }
      
      // Handle MCP request via proxy
      const mcpResponse = await proxy.handleRequest(mcpRequest, tenantId, actor);

      return new Response(JSON.stringify(mcpResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Not found
    return new Response(JSON.stringify({
      error: 'Not found',
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[HTTP] Error handling request:', error);
    
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin, runtimeEnv);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Start HTTP server
 */
export async function startHttpServer(port: number = 8000): Promise<void> {
  await ensureInitialized();

  console.log(`[HTTP] Starting MCP Gateway HTTP server on port ${port}...`);
  console.log(`[HTTP] Gateway URL: http://localhost:${port}`);
  console.log(`[HTTP] MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`[HTTP] Discovery: http://localhost:${port}/meta.discover`);

  await serve(handleHttpRequest, { port });

  console.log(`[HTTP] Server started on port ${port}`);
}

// Start server if run directly
if (import.meta.main) {
  const port = parseInt(Deno.env.get('PORT') || '8000');
  startHttpServer(port).catch((error) => {
    console.error('[HTTP] Fatal error:', error);
    Deno.exit(1);
  });
}
