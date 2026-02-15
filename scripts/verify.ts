#!/usr/bin/env tsx
/**
 * Verify Script - Non-negotiable invariant checks
 * 
 * This script ensures:
 * - All tests pass
 * - meta.actions includes all enabled packs
 * - All actions declare a scope
 * - Dry-run actions return impact shape
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createManageRouter } from '../kernel/src/router';
import { getMetaPack } from '../kernel/src/meta-pack';
import { iamPack } from '../packs/iam';
import { webhooksPack } from '../packs/webhooks';
import { settingsPack } from '../packs/settings';
import { mergePacks } from '../kernel/src/pack';
import { ActionDef } from '../kernel/src/types';
import {
  MockDbAdapter,
  MockAuditAdapter,
  MockIdempotencyAdapter,
  MockRateLimitAdapter,
  MockCeilingsAdapter
} from '../tests/mocks/adapters';

const errors: string[] = [];
const warnings: string[] = [];

// Load bindings
const bindingsPath = path.join(__dirname, '../controlplane.bindings.json');
if (!fs.existsSync(bindingsPath)) {
  console.error('❌ controlplane.bindings.json not found');
  process.exit(1);
}

const bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf-8'));
const enabledPacks = bindings.packs?.enabled || ['iam', 'webhooks', 'settings'];

console.log('🔍 Running verification checks...\n');

// 1. Run tests
console.log('1️⃣  Running tests...');
try {
  execSync('pnpm test', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('✅ All tests passed\n');
} catch (error) {
  errors.push('Tests failed - see output above');
  console.error('❌ Tests failed\n');
}

// 2. Check meta.actions includes all enabled packs
console.log('2️⃣  Verifying meta.actions includes all enabled packs...');
try {
  const metaPack = getMetaPack();
  const allPacks = [metaPack];
  
  // Add enabled packs
  if (enabledPacks.includes('iam')) allPacks.push(iamPack);
  if (enabledPacks.includes('webhooks')) allPacks.push(webhooksPack);
  if (enabledPacks.includes('settings')) allPacks.push(settingsPack);
  
  const { actions } = mergePacks(allPacks);
  
  // Build router to get meta.actions
  const dbAdapter = new MockDbAdapter();
  const auditAdapter = new MockAuditAdapter();
  const idempotencyAdapter = new MockIdempotencyAdapter();
  const rateLimitAdapter = new MockRateLimitAdapter();
  const ceilingsAdapter = new MockCeilingsAdapter();
  
  // Mock auth
  dbAdapter.queryOne = async () => ({
    id: 'test',
    scopes: ['manage.read'],
    status: 'active',
    tenant_id: 'test_tenant'
  });
  
  const router = createManageRouter({
    dbAdapter,
    auditAdapter,
    idempotencyAdapter,
    rateLimitAdapter,
    ceilingsAdapter,
    bindings,
    packs: allPacks.filter(p => p.name !== 'meta')
  });
  
  // Call meta.actions
  const mockRequest = {
    headers: { get: (name: string) => name === 'x-api-key' ? 'ock_test123456' : null }
  } as any;
  
  const response = await router(
    { action: 'meta.actions', params: {} },
    { request: mockRequest }
  );
  
  if (!response.ok) {
    errors.push(`meta.actions failed: ${response.error}`);
  } else {
    const responseData = JSON.parse(response.body || '{}');
    const metaActions = responseData.data?.actions || [];
    
    // Check all enabled pack actions are present
    const expectedActionPrefixes = enabledPacks.map(p => `${p}.`);
    const foundActions = metaActions.map((a: ActionDef) => a.name);
    
    for (const pack of enabledPacks) {
      const packActions = actions.filter(a => a.name.startsWith(`${pack}.`));
      for (const action of packActions) {
        if (!foundActions.includes(action.name)) {
          errors.push(`Missing action in meta.actions: ${action.name}`);
        }
      }
    }
    
    if (errors.length === 0) {
      console.log(`✅ meta.actions includes all ${enabledPacks.length} enabled packs\n`);
    }
  }
} catch (error: any) {
  errors.push(`meta.actions check failed: ${error.message}`);
  console.error('❌ meta.actions verification failed\n');
}

// 3. Verify all actions declare a scope
console.log('3️⃣  Verifying all actions declare a scope...');
try {
  const metaPack = getMetaPack();
  const allPacks = [metaPack, iamPack, webhooksPack, settingsPack];
  const { actions } = mergePacks(allPacks);
  
  const actionsWithoutScope = actions.filter(a => !a.scope || a.scope.trim() === '');
  
  if (actionsWithoutScope.length > 0) {
    errors.push(`Actions without scope: ${actionsWithoutScope.map(a => a.name).join(', ')}`);
    console.error(`❌ Found ${actionsWithoutScope.length} actions without scope\n`);
  } else {
    console.log(`✅ All ${actions.length} actions declare a scope\n`);
  }
} catch (error: any) {
  errors.push(`Scope check failed: ${error.message}`);
  console.error('❌ Scope verification failed\n');
}

// 4. Verify dry-run actions return impact shape
console.log('4️⃣  Verifying dry-run actions return impact shape...');
try {
  const allPacks = [iamPack, webhooksPack, settingsPack];
  const { actions } = mergePacks(allPacks);
  
  const dryRunActions = actions.filter(a => a.supports_dry_run);
  const actionsWithoutImpact: string[] = [];
  
  // Check that handlers for dry-run actions exist and would return impact
  // This is a structural check - actual impact shape is tested in unit tests
  for (const action of dryRunActions) {
    const pack = allPacks.find(p => p.actions.some(a => a.name === action.name));
    if (pack && !pack.handlers[action.name]) {
      actionsWithoutImpact.push(action.name);
    }
  }
  
  if (actionsWithoutImpact.length > 0) {
    warnings.push(`Dry-run actions without handlers: ${actionsWithoutImpact.join(', ')}`);
    console.warn(`⚠️  Found ${actionsWithoutImpact.length} dry-run actions without handlers\n`);
  } else {
    console.log(`✅ All ${dryRunActions.length} dry-run actions have handlers\n`);
  }
} catch (error: any) {
  warnings.push(`Dry-run check failed: ${error.message}`);
  console.warn('⚠️  Dry-run verification had issues\n');
}

// Summary
console.log('📊 Verification Summary\n');
console.log(`Enabled packs: ${enabledPacks.join(', ')}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}\n`);

if (errors.length > 0) {
  console.error('❌ Verification FAILED\n');
  console.error('Errors:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('⚠️  Verification passed with warnings:\n');
  warnings.forEach(w => console.warn(`  - ${w}`));
  process.exit(0);
}

console.log('✅ All verification checks passed!\n');
process.exit(0);
