/**
 * Mock MCP Server for Integration Tests
 * 
 * Simulates MCP server behavior:
 * - Healthy responses
 * - Crashes mid-request
 * - Malformed responses
 */

import { MCPRequest, MCPResponse } from '../../types.ts';

export class MockMCPServer {
  private shouldCrash = false;
  private shouldReturnMalformed = false;
  private crashAfterRequests = 0;
  private requestCount = 0;
  private responses: Map<string, any> = new Map();

  /**
   * Configure server to crash after N requests
   */
  setCrashAfter(requests: number): void {
    this.shouldCrash = true;
    this.crashAfterRequests = requests;
    this.requestCount = 0;
  }

  /**
   * Configure server to return malformed responses
   */
  setMalformed(malformed: boolean): void {
    this.shouldReturnMalformed = malformed;
  }

  /**
   * Set response for a method
   */
  setResponse(method: string, response: any): void {
    this.responses.set(method, response);
  }

  /**
   * Handle MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    this.requestCount++;

    // Check for crash
    if (this.shouldCrash && this.requestCount > this.crashAfterRequests) {
      // Simulate crash by exiting process
      Deno.exit(1);
    }

    // Check for malformed response
    if (this.shouldReturnMalformed) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: null, // Malformed - missing expected fields
      };
    }

    // Handle specific methods
    switch (request.method) {
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: {
                  type: 'object',
                  properties: {},
                },
              },
            ],
          },
        };

      case 'tools/call':
        const customResponse = this.responses.get('tools/call');
        if (customResponse) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: customResponse,
          };
        }
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: 'Success' }],
          },
        };

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: [
              {
                uri: 'file:///test',
                name: 'Test Resource',
                mimeType: 'text/plain',
              },
            ],
          },
        };

      case 'resources/read':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [{ uri: 'file:///test', mimeType: 'text/plain', text: 'Content' }],
          },
        };

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        };
    }
  }
}
