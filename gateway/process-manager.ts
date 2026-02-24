/**
 * Process management for downstream MCP servers
 * 
 * Spawns, monitors, and manages child MCP server processes
 * Handles lifecycle: start, stop, restart
 * Enforces timeouts and resource limits
 */

import { MCPProcess, ServerConfig } from './types.ts';
import {
  ProcessError,
  ConfigurationError,
  NetworkError,
} from './errors.ts';

export class ProcessManager {
  private processes: Map<string, MCPProcess> = new Map();
  private maxRestarts = 5;
  private restartDelay = 1000; // 1 second

  /**
   * Spawn a downstream MCP server process (or register HTTP server)
   */
  async spawnServer(
    serverId: string,
    config: ServerConfig
  ): Promise<MCPProcess> {
    // Check if already running
    const existing = this.processes.get(serverId);
    if (existing) {
      console.log(`[PROCESS] Server "${serverId}" already exists`);
      return existing;
    }

    const serverType = config.server_type || (config.url ? 'http' : 'stdio');

    // HTTP-based servers don't need process spawning
    if (serverType === 'http') {
      if (!config.url) {
        throw new ConfigurationError(`Invalid HTTP server config for "${serverId}": url is required`);
      }

      console.log(`[PROCESS] Registering HTTP server "${serverId}": ${config.url}`);

      // Create a virtual process for HTTP servers (for compatibility)
      const mcpProcess: MCPProcess = {
        id: serverId,
        process: null as any, // HTTP servers don't have a process
        config,
        healthy: true,
        lastHealthCheck: Date.now(),
        restartCount: 0,
      };

      this.processes.set(serverId, mcpProcess);
      return mcpProcess;
    }

    // Stdio-based servers require process spawning
    console.log(`[PROCESS] Spawning stdio server "${serverId}": ${config.command} ${config.args?.join(' ')}`);

    try {
      // Validate command exists (basic check)
      if (!config.command || config.command.trim() === '') {
        throw new ConfigurationError(`Invalid command for server "${serverId}": command is empty`);
      }

      if (!config.args || config.args.length === 0) {
        throw new ConfigurationError(`Invalid args for server "${serverId}": args are required`);
      }

      // Build environment variables
      const env: Record<string, string> = {
        ...Deno.env.toObject(),
        ...(config.env || {}),
      };

      // Spawn process
      const command = new Deno.Command(config.command, {
        args: config.args,
        env,
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
      });
      
      const process = command.spawn();

      const mcpProcess: MCPProcess = {
        id: serverId,
        process,
        config,
        healthy: true,
        lastHealthCheck: Date.now(),
        restartCount: 0,
      };

      this.processes.set(serverId, mcpProcess);

      // Monitor process for crashes (don't await - fire and forget)
      this.monitorProcess(serverId, mcpProcess).catch((error) => {
        console.error(`[PROCESS] Error monitoring "${serverId}":`, error);
      });

      return mcpProcess;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ProcessError(
        `Failed to spawn server "${serverId}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        serverId,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop a server process
   */
  async stopServer(serverId: string): Promise<void> {
    const mcpProcess = this.processes.get(serverId);
    if (!mcpProcess) {
      console.warn(`[PROCESS] Server "${serverId}" not found`);
      return;
    }

    console.log(`[PROCESS] Stopping server "${serverId}"`);
    
    try {
      mcpProcess.process.kill();
      await mcpProcess.process.status;
    } catch (error) {
      console.error(`[PROCESS] Error stopping server "${serverId}":`, error);
    } finally {
      this.processes.delete(serverId);
    }
  }

  /**
   * Restart a server process
   */
  async restartServer(serverId: string): Promise<void> {
    const mcpProcess = this.processes.get(serverId);
    if (!mcpProcess) {
      throw new Error(`Server "${serverId}" not found`);
    }

    // Check restart limit
    if (mcpProcess.restartCount >= this.maxRestarts) {
      throw new Error(
        `Server "${serverId}" exceeded max restarts (${this.maxRestarts}). ` +
        `Not restarting to prevent restart loop.`
      );
    }

    console.log(`[PROCESS] Restarting server "${serverId}" (attempt ${mcpProcess.restartCount + 1})`);

    // Stop existing process
    await this.stopServer(serverId);

    // Wait before restart
    await new Promise(resolve => setTimeout(resolve, this.restartDelay));

    // Spawn new process
    await this.spawnServer(serverId, mcpProcess.config);
  }

  /**
   * Get server process by ID
   */
  getServerProcess(serverId: string): MCPProcess | null {
    return this.processes.get(serverId) || null;
  }

  /**
   * Get all running server processes
   */
  getAllProcesses(): MCPProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Check if server is running
   * Note: Deno.ChildProcess.status is a Promise, so we check if process exists
   * Actual status is checked during operations
   */
  isServerRunning(serverId: string): boolean {
    const process = this.processes.get(serverId);
    if (!process) return false;
    
    // Process exists and is tracked - assume running
    // Actual status will be checked during operations
    return true;
  }

  /**
   * Monitor process for crashes and auto-restart
   */
  private async monitorProcess(serverId: string, mcpProcess: MCPProcess): Promise<void> {
    try {
      const status = await mcpProcess.process.status;
      
      if (!status.success) {
        const exitCode = status.code || -1;
        console.error(`[PROCESS] Server "${serverId}" exited with code ${exitCode}`);
        mcpProcess.healthy = false;

        // Auto-restart if under limit
        if (mcpProcess.restartCount < this.maxRestarts) {
          mcpProcess.restartCount++;
          console.log(`[PROCESS] Auto-restarting "${serverId}" (${mcpProcess.restartCount}/${this.maxRestarts})`);
          
          try {
            await this.restartServer(serverId);
          } catch (restartError) {
            console.error(`[PROCESS] Failed to restart "${serverId}":`, restartError);
            // Mark as unhealthy and remove
            mcpProcess.healthy = false;
            this.processes.delete(serverId);
          }
        } else {
          const error = new ProcessError(
            `Server "${serverId}" exceeded max restarts (${this.maxRestarts})`,
            serverId,
            exitCode
          );
          console.error(`[PROCESS]`, error);
          this.processes.delete(serverId);
        }
      }
    } catch (error) {
      const processError = new ProcessError(
        `Error monitoring server "${serverId}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        serverId,
        undefined,
        error instanceof Error ? error : undefined
      );
      console.error(`[PROCESS]`, processError);
      mcpProcess.healthy = false;
    }
  }

  /**
   * Kill all processes (cleanup)
   */
  async killAll(): Promise<void> {
    const serverIds = Array.from(this.processes.keys());
    for (const serverId of serverIds) {
      await this.stopServer(serverId);
    }
  }
}
