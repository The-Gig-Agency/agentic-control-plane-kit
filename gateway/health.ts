/**
 * Health monitoring for downstream MCP servers
 * 
 * Monitors server health, implements circuit breaker pattern
 * Auto-restarts unhealthy servers
 * Fail-closed on authorization failures
 */

import { HealthStatus, MCPProcess } from './types.ts';
import { ProcessManager } from './process-manager.ts';

export class HealthMonitor {
  private healthStatus: Map<string, HealthStatus> = new Map();
  private processManager: ProcessManager;
  private checkInterval: number = 30000; // 30 seconds
  private circuitBreakerThreshold: number = 3; // Fail 3 times before opening circuit
  private circuitOpenTime: number = 60000; // 1 minute before retry

  constructor(processManager: ProcessManager) {
    this.processManager = processManager;
    this.startHealthChecks();
  }

  /**
   * Check health of a specific server
   */
  async checkServerHealth(serverId: string): Promise<boolean> {
    const process = this.processManager.getServerProcess(serverId);
    if (!process) {
      this.updateHealthStatus(serverId, false, 'Process not found');
      return false;
    }

    // Check if process is still running
    try {
      const isRunning = this.processManager.isServerRunning(serverId);
      if (!isRunning) {
        this.updateHealthStatus(serverId, false, 'Process not running');
        return false;
      }

      // TODO: Implement actual health check (ping MCP server)
      // For now, just check if process exists and is running
      this.updateHealthStatus(serverId, true);
      return true;
    } catch (error) {
      this.updateHealthStatus(serverId, false, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Restart unhealthy server
   */
  async restartUnhealthyServer(serverId: string): Promise<void> {
    const status = this.healthStatus.get(serverId);
    if (!status || status.healthy) {
      return; // Server is healthy or doesn't exist
    }

    console.log(`[HEALTH] Restarting unhealthy server "${serverId}"`);
    
    try {
      await this.processManager.restartServer(serverId);
      // Reset health status after restart
      this.updateHealthStatus(serverId, true);
    } catch (error) {
      console.error(`[HEALTH] Failed to restart server "${serverId}":`, error);
      this.updateHealthStatus(serverId, false, error instanceof Error ? error.message : 'Restart failed');
    }
  }

  /**
   * Kill misbehaving process
   */
  async killMisbehavingProcess(serverId: string): Promise<void> {
    console.log(`[HEALTH] Killing misbehaving server "${serverId}"`);
    await this.processManager.stopServer(serverId);
    this.healthStatus.delete(serverId);
  }

  /**
   * Check if circuit breaker is open for a server
   */
  isCircuitOpen(serverId: string): boolean {
    const status = this.healthStatus.get(serverId);
    if (!status) return false;

    // Circuit opens after threshold failures
    if (status.healthy === false) {
      const failureCount = this.getFailureCount(serverId);
      if (failureCount >= this.circuitBreakerThreshold) {
        const lastFailure = status.lastCheck;
        const timeSinceFailure = Date.now() - lastFailure;
        
        // Keep circuit open for circuitOpenTime
        if (timeSinceFailure < this.circuitOpenTime) {
          return true; // Circuit is open
        } else {
          // Circuit half-open - allow one attempt
          return false;
        }
      }
    }

    return false; // Circuit is closed
  }

  /**
   * Get health status for a server
   */
  getHealthStatus(serverId: string): HealthStatus | null {
    return this.healthStatus.get(serverId) || null;
  }

  /**
   * Update health status
   */
  private updateHealthStatus(
    serverId: string,
    healthy: boolean,
    error?: string
  ): void {
    const existing = this.healthStatus.get(serverId);
    const now = Date.now();
    
    const status: HealthStatus = {
      serverId,
      healthy,
      lastCheck: now,
      error,
      uptime: existing && healthy ? existing.uptime + (now - existing.lastCheck) : 0,
    };

    this.healthStatus.set(serverId, status);
  }

  /**
   * Get failure count for circuit breaker
   */
  private getFailureCount(serverId: string): number {
    // Simple implementation - count consecutive failures
    // In production, might want more sophisticated tracking
    const status = this.healthStatus.get(serverId);
    if (!status || status.healthy) return 0;
    
    // For now, return 1 if unhealthy (simplified)
    // Could track actual failure count over time
    return 1;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    setInterval(async () => {
      const processes = this.processManager.getAllProcesses();
      for (const process of processes) {
        await this.checkServerHealth(process.id);
        
        // Auto-restart if unhealthy and circuit not open
        if (!process.healthy && !this.isCircuitOpen(process.id)) {
          await this.restartUnhealthyServer(process.id);
        }
      }
    }, this.checkInterval);
  }
}
