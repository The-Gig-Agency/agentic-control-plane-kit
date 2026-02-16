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
 * Handles nested objects, arrays, and ensures consistent key ordering.
 * 
 * @param obj - Object to stringify
 * @returns Canonical JSON string
 */
export function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
  }
  
  // Sort keys for deterministic output
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: any = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  
  return JSON.stringify(sortedObj);
}

/**
 * Redact sensitive information from a string (for error messages, etc.)
 * 
 * Strips secrets, tokens, and other sensitive patterns from strings.
 * 
 * @param str - String to redact
 * @param maxLength - Maximum length (default: 500)
 * @returns Redacted string
 */
export function redactString(str: string | undefined | null, maxLength: number = 500): string | undefined {
  if (!str) {
    return undefined;
  }
  
  let redacted = str;
  
  // Redact common patterns
  const patterns = [
    /(api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{10,})['"]?/gi,
    /(token|access[_-]?token|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{10,})['"]?/gi,
    /(secret|password|pwd|passwd)\s*[:=]\s*['"]?([^\s'"]{6,})['"]?/gi,
    /(authorization|auth)\s*[:=]\s*['"]?([^\s'"]{10,})['"]?/gi,
  ];
  
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, (match, key, value) => {
      return `${key}: [REDACTED]`;
    });
  }
  
  // Truncate if too long
  if (redacted.length > maxLength) {
    redacted = redacted.substring(0, maxLength) + '... [truncated]';
  }
  
  return redacted;
}
