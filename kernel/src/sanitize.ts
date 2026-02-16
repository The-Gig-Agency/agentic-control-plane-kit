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
 * CRITICAL: Must produce identical output across runtimes (Node, Deno, Edge).
 * 
 * Edge cases handled:
 * - Floats: JSON.stringify normalizes 1.0 → 1 (consistent across runtimes)
 * - Dates: Convert to ISO string before stringification
 * - undefined: Omit from output (JSON.stringify does this)
 * - BigInt: Convert to string (JSON.stringify throws, so handle explicitly)
 * - null: Preserve as null
 * 
 * Strategy: Recursively sort keys, then use JSON.stringify with replacer for edge cases.
 * 
 * @param obj - Object to stringify
 * @returns Canonical JSON string
 */
export function canonicalJson(obj: any): string {
  // Handle null explicitly
  if (obj === null) {
    return 'null';
  }
  
  // Handle undefined - JSON.stringify omits undefined
  if (obj === undefined) {
    return ''; // Omit from output
  }
  
  // Handle primitives
  if (typeof obj !== 'object') {
    // Handle BigInt (JSON.stringify throws on BigInt)
    if (typeof obj === 'bigint') {
      return JSON.stringify(obj.toString());
    }
    // JSON.stringify handles numbers consistently (1.0 → 1)
    return JSON.stringify(obj);
  }
  
  // Handle Date objects - convert to ISO string for consistency
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  
  // Handle arrays - recursively canonicalize each item
  if (Array.isArray(obj)) {
    const canonicalItems = obj.map(item => {
      const canonicalStr = canonicalJson(item);
      return canonicalStr !== '' ? JSON.parse(canonicalStr) : item;
    });
    return JSON.stringify(canonicalItems);
  }
  
  // Handle objects - recursively sort keys for deterministic output
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: any = {};
  for (const key of sortedKeys) {
    const value = obj[key];
    // Omit undefined values (JSON.stringify does this, but be explicit)
    if (value !== undefined) {
      // Recursively canonicalize nested structures
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          // Arrays: recursively canonicalize each item
          sortedObj[key] = value.map(item => {
            const canonicalStr = canonicalJson(item);
            return canonicalStr !== '' ? JSON.parse(canonicalStr) : item;
          });
        } else if (value instanceof Date) {
          // Dates: convert to ISO string
          sortedObj[key] = value.toISOString();
        } else {
          // Nested objects: recursively canonicalize (parse to get sorted structure)
          const canonicalStr = canonicalJson(value);
          sortedObj[key] = canonicalStr !== '' ? JSON.parse(canonicalStr) : value;
        }
      } else {
        // Primitives: use as-is
        sortedObj[key] = value;
      }
    }
  }
  
  // Use JSON.stringify with replacer to handle edge cases
  return JSON.stringify(sortedObj, (key, value) => {
    // Handle BigInt (JSON.stringify throws on BigInt)
    if (typeof value === 'bigint') {
      return value.toString();
    }
    // Dates should already be ISO strings from above, but handle if missed
    if (value instanceof Date) {
      return value.toISOString();
    }
    // JSON.stringify omits undefined automatically
    return value;
  });
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
