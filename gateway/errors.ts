/**
 * Custom error classes for MCP Gateway
 * Provides structured error handling and categorization
 */

/**
 * Base error class for all gateway errors
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends GatewayError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', 500, false, cause);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends GatewayError {
  constructor(
    message: string,
    public decisionId?: string,
    public policyId?: string,
    statusCode: number = 403
  ) {
    super(message, 'AUTHORIZATION_ERROR', statusCode, false);
  }
}

/**
 * Network/communication errors
 */
export class NetworkError extends GatewayError {
  constructor(message: string, cause?: Error, retryable: boolean = true) {
    super(message, 'NETWORK_ERROR', 503, retryable, cause);
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends GatewayError {
  constructor(message: string, public timeoutMs: number, cause?: Error) {
    super(message, 'TIMEOUT_ERROR', 504, true, cause);
  }
}

/**
 * Process management errors
 */
export class ProcessError extends GatewayError {
  constructor(
    message: string,
    public serverId: string,
    public exitCode?: number,
    cause?: Error
  ) {
    super(message, 'PROCESS_ERROR', 500, false, cause);
  }
}

/**
 * MCP protocol errors
 */
export class MCPProtocolError extends GatewayError {
  constructor(
    message: string,
    public mcpErrorCode?: number,
    public mcpErrorData?: any,
    cause?: Error
  ) {
    super(message, 'MCP_PROTOCOL_ERROR', 500, false, cause);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends GatewayError {
  constructor(message: string, public field?: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', 400, false, cause);
  }
}

/**
 * Cache errors (non-fatal)
 */
export class CacheError extends GatewayError {
  constructor(message: string, cause?: Error) {
    super(message, 'CACHE_ERROR', 500, false, cause);
  }
}

/**
 * Health check errors
 */
export class HealthCheckError extends GatewayError {
  constructor(
    message: string,
    public serverId: string,
    public healthy: boolean = false,
    cause?: Error
  ) {
    super(message, 'HEALTH_CHECK_ERROR', 503, true, cause);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof GatewayError) {
    return error.retryable;
  }
  
  // Network errors are generally retryable
  if (error.message.includes('network') || 
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('timeout')) {
    return true;
  }
  
  return false;
}

/**
 * Get error code from error
 */
export function getErrorCode(error: Error): string {
  if (error instanceof GatewayError) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Format error for logging
 */
export function formatError(error: Error): {
  message: string;
  code: string;
  stack?: string;
  cause?: any;
} {
  const base = {
    message: error.message,
    code: getErrorCode(error),
  };

  if (error.stack) {
    return { ...base, stack: error.stack };
  }

  if (error instanceof GatewayError && error.cause) {
    return { ...base, cause: formatError(error.cause) };
  }

  return base;
}
