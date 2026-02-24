/**
 * HTTP MCP Client - JSON-RPC 2.0 communication over HTTP
 * 
 * Handles communication with HTTP-based MCP servers
 * Implements JSON-RPC 2.0 protocol over HTTP POST requests
 */

import { MCPRequest, MCPResponse, MCPError } from './types.ts';
import type { ServerConfig } from './types.ts';
import {
  NetworkError,
  TimeoutError,
  MCPProtocolError,
  isRetryableError,
} from './errors.ts';

export class HttpMCPClient {
  private url: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: ServerConfig) {
    if (!config.url) {
      throw new Error('HTTP MCP client requires url in config');
    }
    this.url = config.url;
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.http_headers || {}),
    };
    this.timeout = 30000; // 30 second default timeout
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  async call(
    method: string,
    params?: any,
    timeout: number = 30000,
    retries: number = 0
  ): Promise<any> {
    const requestId = Date.now() + Math.random();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new NetworkError(
            `HTTP ${response.status}: Authentication failed`,
            'http_auth',
            response.status
          );
        }
        if (response.status >= 500 && isRetryableError(new Error('HTTP error'))) {
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries)));
            return this.call(method, params, timeout, retries - 1);
          }
        }
        throw new NetworkError(
          `HTTP ${response.status}: ${response.statusText}`,
          'http_error',
          response.status
        );
      }

      const responseData: MCPResponse = await response.json();

      // Validate JSON-RPC 2.0 response
      if (responseData.jsonrpc !== '2.0') {
        throw new MCPProtocolError('Invalid JSON-RPC version in response');
      }

      if (responseData.id !== requestId) {
        throw new MCPProtocolError('Response ID mismatch');
      }

      // Check for errors
      if (responseData.error) {
        const error = responseData.error;
        throw new MCPProtocolError(
          error.message || 'MCP protocol error',
          error.code,
          error.data
        );
      }

      return responseData.result;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof MCPProtocolError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request to ${this.url} timed out after ${timeout}ms`);
      }

      throw new NetworkError(
        `HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'http_request',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if HTTP server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try a lightweight request (tools/list is usually fast)
      await this.call('tools/list', {}, 5000, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}
