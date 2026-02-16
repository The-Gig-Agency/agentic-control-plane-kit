/**
 * Minimal acceptance test for API key exposure
 * 
 * Run this test to verify that API keys are not exposed in:
 * - DB rows
 * - Logs
 * - Job payload tables
 * - Audit events
 * 
 * Pass condition: Only prefix + hashes show up, never the raw key.
 */

import { sanitize, canonicalJson } from '../../kernel/src/sanitize';
import { hashPayload } from '../../kernel/src/audit';

const TEST_API_KEY = 'ciq_test_secret_key_123456789';
const TEST_PREFIX = 'ciq_test_secret';

describe('API Key Exposure Test', () => {
  it('should not expose API key in sanitized payload', () => {
    const payload = {
      action: 'domain.publishers.list',
      params: { limit: 10 },
      headers: {
        'x-api-key': TEST_API_KEY,
        'authorization': `Bearer ${TEST_API_KEY}`,
        'content-type': 'application/json'
      }
    };

    const sanitized = sanitize(payload);
    
    // Should redact API key fields
    expect(sanitized.headers['x-api-key']).toBe('[REDACTED]');
    expect(sanitized.headers['authorization']).toBe('[REDACTED]');
    
    // Should NOT contain raw key anywhere
    const sanitizedStr = JSON.stringify(sanitized);
    expect(sanitizedStr).not.toContain(TEST_API_KEY);
    
    // Should still contain prefix (acceptable - it's public)
    expect(sanitizedStr).toContain(TEST_PREFIX);
  });

  it('should hash sanitized payload correctly', async () => {
    const payload = {
      action: 'domain.publishers.list',
      params: { limit: 10 },
      headers: {
        'x-api-key': TEST_API_KEY
      }
    };

    const hash = await hashPayload(payload);
    
    // Hash should be 64 hex characters (SHA-256)
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    
    // Hash should NOT contain raw key
    expect(hash).not.toContain(TEST_API_KEY);
    
    // Hash should be deterministic (same payload = same hash)
    const hash2 = await hashPayload(payload);
    expect(hash).toBe(hash2);
  });

  it('should redact all sensitive field variants', () => {
    const payload = {
      'x-api-key': TEST_API_KEY,
      'X-API-Key': TEST_API_KEY,
      'api_key': TEST_API_KEY,
      'apiKey': TEST_API_KEY,
      'API_KEY': TEST_API_KEY,
      'authorization': `Bearer ${TEST_API_KEY}`,
      'token': TEST_API_KEY,
      'access_token': TEST_API_KEY,
      'client_secret': TEST_API_KEY,
      'password': 'secret123',
      'safe_field': 'not_secret'
    };

    const sanitized = sanitize(payload);
    
    // All sensitive fields should be redacted (case-insensitive)
    expect(sanitized['x-api-key']).toBe('[REDACTED]');
    expect(sanitized['X-API-Key']).toBe('[REDACTED]');
    expect(sanitized['api_key']).toBe('[REDACTED]');
    expect(sanitized['apiKey']).toBe('[REDACTED]');
    expect(sanitized['API_KEY']).toBe('[REDACTED]');
    expect(sanitized['authorization']).toBe('[REDACTED]');
    expect(sanitized['token']).toBe('[REDACTED]');
    expect(sanitized['access_token']).toBe('[REDACTED]');
    expect(sanitized['client_secret']).toBe('[REDACTED]');
    expect(sanitized['password']).toBe('[REDACTED]');
    
    // Safe fields should remain
    expect(sanitized['safe_field']).toBe('not_secret');
    
    // No raw key should appear
    const sanitizedStr = JSON.stringify(sanitized);
    expect(sanitizedStr).not.toContain(TEST_API_KEY);
  });

  it('should sanitize nested objects', () => {
    const payload = {
      action: 'domain.publishers.create',
      params: {
        name: 'Test Publisher',
        config: {
          api_key: TEST_API_KEY,
          webhook_url: 'https://example.com/webhook'
        }
      }
    };

    const sanitized = sanitize(payload);
    
    expect(sanitized.params.config.api_key).toBe('[REDACTED]');
    expect(sanitized.params.config.webhook_url).toBe('https://example.com/webhook');
    
    const sanitizedStr = JSON.stringify(sanitized);
    expect(sanitizedStr).not.toContain(TEST_API_KEY);
  });

  it('should sanitize arrays', () => {
    const payload = {
      items: [
        { id: 1, token: TEST_API_KEY },
        { id: 2, token: 'another_secret' },
        { id: 3, public_data: 'safe' }
      ]
    };

    const sanitized = sanitize(payload);
    
    expect(sanitized.items[0].token).toBe('[REDACTED]');
    expect(sanitized.items[1].token).toBe('[REDACTED]');
    expect(sanitized.items[2].public_data).toBe('safe');
    
    const sanitizedStr = JSON.stringify(sanitized);
    expect(sanitizedStr).not.toContain(TEST_API_KEY);
  });
});

/**
 * Manual test script for end-to-end verification
 * 
 * Run this after deploying to check actual logs/DB:
 * 
 * 1. Send a request with a fake API key: ciq_test_fake_key_12345
 * 2. Grep across:
 *    - DB rows (SELECT * FROM audit_log WHERE ...)
 *    - Log files
 *    - Job payload tables
 *    - Audit events
 * 3. Verify: Only prefix + hashes appear, never raw key
 */
export async function manualKeyExposureTest() {
  const fakeKey = 'ciq_test_fake_key_12345';
  
  console.log('🔍 Testing for API key exposure...');
  console.log(`Test key: ${fakeKey}`);
  console.log('');
  console.log('Check these locations:');
  console.log('1. Database audit_log table');
  console.log('2. Application logs');
  console.log('3. Job queue payloads');
  console.log('4. Terminal history');
  console.log('');
  console.log('Expected: Only prefix (ciq_test_fake) and hashes should appear');
  console.log('FAIL if: Raw key "ciq_test_fake_key_12345" appears anywhere');
}
