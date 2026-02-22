/**
 * MCP Client - JSON-RPC 2.0 communication over stdio
 * 
 * Handles communication with downstream MCP servers via stdin/stdout
 * Implements JSON-RPC 2.0 protocol with request/response matching
 */

import { MCPRequest, MCPResponse, MCPError } from './types.ts';
import { MCPProcess } from './types.ts';
import {
  NetworkError,
  TimeoutError,
  MCPProtocolError,
  ProcessError,
  isRetryableError,
} from './errors.ts';

export class MCPClient {
  private process: MCPProcess;
  private requestIdCounter: number = 1;
  private pendingRequests: Map<number | string, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: number;
  }> = new Map();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder: TextDecoder;
  private encoder: TextEncoder;
  private buffer: string = '';
  private isInitialized: boolean = false;

  constructor(process: MCPProcess) {
    this.process = process;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
  }

  /**
   * Initialize MCP client - start reading from stdout
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get stdout reader
      const stdout = this.process.process.stdout;
      if (!stdout) {
        throw new ProcessError(
          `Process "${this.process.id}" has no stdout`,
          this.process.id
        );
      }

      this.reader = stdout.getReader();
      this.isInitialized = true;

      // Start reading responses
      this.readResponses().catch((error) => {
        console.error(`[MCP-CLIENT] Error in read loop for "${this.process.id}":`, error);
      });
    } catch (error) {
      throw new ProcessError(
        `Failed to initialize MCP client for "${this.process.id}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.process.id,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    const requestId = this.requestIdCounter++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    // Write request to stdin
    const stdin = this.process.process.stdin;
    if (!stdin) {
      throw new ProcessError(
        `Process "${this.process.id}" has no stdin`,
        this.process.id
      );
    }

    const requestText = JSON.stringify(request) + '\n';
    const writer = stdin.getWriter();
    
    try {
      await writer.write(this.encoder.encode(requestText));
      writer.releaseLock();
    } catch (error) {
      const networkError = new NetworkError(
        `Failed to write to process stdin: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      
      // Retry if retryable and retries remaining
      if (isRetryableError(networkError) && retries > 0) {
        console.warn(`[MCP-CLIENT] Retrying request to "${this.process.id}" (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        return this.call(method, params, timeout, retries - 1);
      }
      
      throw networkError;
    }

    // Wait for response
    return new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        const timeoutError = new TimeoutError(
          `Request to "${this.process.id}" timed out after ${timeout}ms`,
          timeout
        );
        
        // Retry if retries remaining
        if (retries > 0) {
          console.warn(`[MCP-CLIENT] Retrying timed-out request to "${this.process.id}" (${retries} retries left)`);
          this.call(method, params, timeout, retries - 1)
            .then(resolve)
            .catch(reject);
        } else {
          reject(timeoutError);
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (response: MCPResponse) => {
          clearTimeout(timeoutId);
          if (response.error) {
            const mcpError = new MCPProtocolError(
              `MCP error from "${this.process.id}": ${response.error.message}`,
              response.error.code,
              response.error.data
            );
            reject(mcpError);
          } else {
            resolve(response.result);
          }
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          
          // Retry if retryable and retries remaining
          if (isRetryableError(error) && retries > 0) {
            console.warn(`[MCP-CLIENT] Retrying failed request to "${this.process.id}" (${retries} retries left)`);
            this.call(method, params, timeout, retries - 1)
              .then(resolve)
              .catch(reject);
          } else {
            reject(error);
          }
        },
        timeout: timeoutId as unknown as number,
      });
    });
  }

  /**
   * Read responses from stdout
   */
  private async readResponses(): Promise<void> {
    if (!this.reader) {
      return;
    }

    try {
      while (true) {
        const { done, value } = await this.reader.read();
        
        if (done) {
          console.log(`[MCP-CLIENT] Process "${this.process.id}" stdout closed`);
          break;
        }

        // Decode chunk and add to buffer
        this.buffer += this.decoder.decode(value, { stream: true });

        // Process complete lines (JSON-RPC messages are newline-delimited)
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const response: MCPResponse = JSON.parse(trimmed);
            this.handleResponse(response);
          } catch (error) {
            console.error(
              `[MCP-CLIENT] Failed to parse response from "${this.process.id}":`,
              error,
              'Raw:', trimmed.substring(0, 200) // Limit log size
            );
            
            // If it's a JSON parse error, it's not retryable
            // But we should still reject pending requests for this response
            // (though we don't know which request it was)
          }
        }
      }
    } catch (error) {
      const networkError = new NetworkError(
        `Error reading from "${this.process.id}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      
      console.error(`[MCP-CLIENT]`, networkError);
      
      // Reject all pending requests with proper error
      for (const [id, pending] of this.pendingRequests.entries()) {
        pending.reject(networkError);
      }
      this.pendingRequests.clear();
      
      // Mark as not initialized so it can be re-initialized
      this.isInitialized = false;
    }
  }

  /**
   * Handle incoming response
   */
  private handleResponse(response: MCPResponse): void {
    const { id } = response;
    
    if (id === null || id === undefined) {
      // Notification (no response expected)
      if (response.error) {
        console.error(`[MCP-CLIENT] Error notification from "${this.process.id}":`, response.error);
      }
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      console.warn(`[MCP-CLIENT] Received response for unknown request ID: ${id}`);
      return;
    }

    this.pendingRequests.delete(id);
    pending.resolve(response);
  }

  /**
   * Close client and cleanup
   */
  async close(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
      this.reader = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error('Client closed'));
    }
    this.pendingRequests.clear();
    
    this.isInitialized = false;
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.process.process.status === 'running';
  }
}

/**
 * Client manager - manages MCP clients for all processes
 */
export class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();

  /**
   * Get or create client for a process
   */
  async getClient(process: MCPProcess): Promise<MCPClient> {
    let client = this.clients.get(process.id);
    
    if (!client) {
      client = new MCPClient(process);
      await client.initialize();
      this.clients.set(process.id, client);
    }

    return client;
  }

  /**
   * Remove client
   */
  async removeClient(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
  }

  /**
   * Close all clients
   */
  async closeAll(): Promise<void> {
    for (const [serverId, client] of this.clients.entries()) {
      await client.close();
    }
    this.clients.clear();
  }
}
