/**
 * Sanitization utilities for redacting sensitive data before logging/hashing
 */

/**
 * List of field names that should be redacted (case-insensitive)
 */
const SENSITIVE_FIELDS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
  'secret',
  'password',
  'passwd',
  'pwd',
  'private_key',
  'privatekey',
  'private-key',
  'session_id',
  'sessionid',
  'session-id',
  'auth_token',
  'authtoken',
  'auth-token',
  'bearer',
  'credentials',
  'credential',
]);

const REDACTED_VALUE = '[REDACTED]';

/**
 * Recursively sanitize an object by redacting sensitive fields
 * 
 * @param obj - Object to sanitize (can be any type)
 * @returns Sanitized object with sensitive fields redacted
 */
export function sanitize(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Primitive types: return as-is
  if (typeof obj !== 'object') {
    return obj;
  }

  // Arrays: sanitize each element
  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item));
  }

  // Objects: sanitize recursively
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Check if this field should be redacted
    if (SENSITIVE_FIELDS.has(keyLower)) {
      sanitized[key] = REDACTED_VALUE;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitize(value);
    } else {
      // Safe to include
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Canonical JSON stringification (deterministic, sorted keys)
 * 
 * @param obj - Object to stringify
 * @returns Canonical JSON string
 */
export function canonicalJson(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
