# Plan: Enabling CIQ-Automations to be Agentic

## Executive Summary

This document outlines a comprehensive plan to integrate the **agentic-control-plane-kit** into the **ciq-automations** repository, enabling it to be controlled programmatically by AI agents via a standardized `/manage` API endpoint.

### Current State
- **ciq-automations**: React/TypeScript frontend with Supabase Edge Functions backend
- **Architecture**: Multi-tenant SaaS for Creator IQ automation workflows
- **Backend**: 80+ Supabase Edge Functions handling various operations
- **Key Features**: Publishers, Campaigns, Lists, OneSheets, Workflows, Webhooks, E-commerce integrations

### Target State
- **Agentic Control Plane**: `/manage` endpoint exposing all operations via standardized API
- **Agent Discovery**: `meta.actions` endpoint for self-discovery
- **Safety Rails**: Audit logging, idempotency, rate limiting, dry-run support
- **Multi-Tenant**: Proper tenant isolation and API key management
- **OpenAPI Spec**: Auto-generated API documentation for agents

---

## Architecture Overview

### Integration Pattern

```
┌─────────────────────────────────────────────────────────┐
│  CIQ-Automations Frontend (React/TypeScript)            │
│  - Existing UI continues to work                        │
│  - Can optionally call /manage endpoint                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase Edge Function: /manage                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Agentic Control Plane Kit                        │  │
│  │  - Kernel (router, auth, audit, idempotency)      │  │
│  │  - Packs (iam, webhooks, settings, domain)         │  │
│  │  - CIQ Domain Pack (publishers, campaigns, etc.)  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase Database                                      │
│  - api_keys table (for authentication)                  │
│  - audit_log table (for audit trail)                    │
│  - Existing CIQ tables (brands, publishers, etc.)       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Creator IQ APIs (External)                              │
│  - REST CRM API                                          │
│  - GraphQL Content API                                   │
│  - PubSub Webhooks                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Foundation Setup (Week 1)

#### 1.1 Copy Control Plane Kit
**Location**: `ciq-automations/control-plane/`

```bash
cd /Users/rastakit/tga-workspace/repos/ciq-automations
mkdir -p control-plane
cp -r /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/kernel ./control-plane/
cp -r /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/packs ./control-plane/
cp -r /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit/config ./control-plane/
```

**Files to copy:**
- `kernel/` - Core router and interfaces
- `packs/` - IAM, webhooks, settings packs
- `config/` - Bindings schema

#### 1.2 Create Bindings Configuration
**File**: `ciq-automations/controlplane.bindings.json`

```json
{
  "$schema": "./control-plane/config/bindings.schema.json",
  "tenant": {
    "table": "brands",
    "id_column": "id",
    "get_tenant_fn": "get_brand_id",
    "is_admin_fn": "is_platform_admin"
  },
  "auth": {
    "keys_table": "api_keys",
    "key_prefix": "ciq_",
    "prefix_length": 12,
    "key_hash_column": "key_hash",
    "key_prefix_column": "prefix",
    "scopes_column": "scopes"
  },
  "database": {
    "adapter": "supabase",
    "connection_env": "SUPABASE_SERVICE_ROLE_KEY"
  },
  "packs": {
    "enabled": ["iam", "webhooks", "settings", "domain"]
  },
  "domain": {
    "namespace": "domain"
  },
  "scopes": {
    "base_scopes": ["manage.read"],
    "pack_scopes": {
      "iam": ["manage.iam"],
      "webhooks": ["manage.webhooks"],
      "settings": ["manage.settings"],
      "domain": ["manage.domain"]
    }
  },
  "action_namespace": ""
}
```

**Key Decisions:**
- **Tenant Table**: `brands` (matches CIQ multi-brand architecture)
- **API Key Prefix**: `ciq_` (Creator IQ prefix)
- **Database**: Supabase (already in use)

#### 1.3 Database Schema Setup
**Migration**: `supabase/migrations/XXXX_add_control_plane_tables.sql`

```sql
-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX idx_api_keys_brand_id ON api_keys(brand_id);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- Audit Log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT,
  before_snapshot JSONB,
  after_snapshot JSONB,
  impact JSONB,
  result TEXT NOT NULL CHECK (result IN ('success', 'error', 'denied')),
  error_message TEXT,
  ip_address INET,
  idempotency_key TEXT,
  dry_run BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_brand_id ON audit_log(brand_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_request_id ON audit_log(request_id);
CREATE INDEX idx_audit_log_api_key_id ON audit_log(api_key_id);

-- Idempotency cache (optional, can use Supabase cache or Redis)
CREATE TABLE IF NOT EXISTS idempotency_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(brand_id, action, idempotency_key)
);

CREATE INDEX idx_idempotency_expires ON idempotency_cache(expires_at);
```

#### 1.4 Create Supabase Adapters
**Location**: `ciq-automations/supabase/functions/_shared/control-plane-adapters/`

**Files to create:**
- `supabase-db-adapter.ts` - Database adapter implementation
- `supabase-audit-adapter.ts` - Audit logging adapter
- `supabase-idempotency-adapter.ts` - Idempotency adapter
- `supabase-rate-limit-adapter.ts` - Rate limiting adapter
- `supabase-ceilings-adapter.ts` - Ceilings adapter

**Example: `supabase-db-adapter.ts`**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DbAdapter } from '../../control-plane/kernel/src/types.ts';

export function createSupabaseDbAdapter(serviceRoleKey: string): DbAdapter {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  );

  return {
    async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
      const { data, error } = await supabase.rpc('execute_sql', {
        query: sql,
        params: params || []
      });
      if (error) throw error;
      return data || [];
    },

    async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
      const results = await this.query<T>(sql, params);
      return results[0] || null;
    },

    async execute(sql: string, params?: any[]): Promise<number> {
      const { data, error } = await supabase.rpc('execute_sql', {
        query: sql,
        params: params || []
      });
      if (error) throw error;
      return data?.rowCount || 0;
    },

    // ... implement all DbAdapter interface methods
    async getTenantFromApiKey(apiKeyId: string): Promise<string | null> {
      const { data } = await supabase
        .from('api_keys')
        .select('brand_id')
        .eq('id', apiKeyId)
        .single();
      return data?.brand_id || null;
    },

    // IAM pack methods
    async listApiKeys(brandId: string) {
      const { data } = await supabase
        .from('api_keys')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });
      return data || [];
    },

    async createApiKey(brandId: string, data: any) {
      // Generate key
      const prefix = 'ciq_';
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const keySuffix = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const fullKey = prefix + keySuffix;

      // Hash key
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(fullKey));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Store in DB
      const { data: keyRecord } = await supabase
        .from('api_keys')
        .insert({
          brand_id: brandId,
          prefix: prefix,
          key_hash: keyHash,
          name: data.name,
          scopes: data.scopes || [],
          expires_at: data.expires_at
        })
        .select()
        .single();

      // Return key (only shown once)
      return {
        ...keyRecord,
        key: fullKey  // Only returned on creation
      };
    },

    // Domain pack methods (CIQ-specific)
    async listPublishers(brandId: string, filters?: any) {
      // Implementation using existing CIQ functions or direct DB
    },

    async createCampaign(brandId: string, data: any) {
      // Implementation
    },

    // ... other domain methods
  };
}
```

---

### Phase 2: Create /manage Endpoint (Week 1-2)

#### 2.1 Create Manage Edge Function
**File**: `ciq-automations/supabase/functions/manage/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createManageRouter } from '../../control-plane/kernel/index.ts';
import { iamPack, webhooksPack, settingsPack } from '../../control-plane/packs/index.ts';
import { ciqDomainPack } from './ciq-domain-pack.ts';
import { createSupabaseAdapters } from '../_shared/control-plane-adapters/index.ts';
import bindings from '../../../controlplane.bindings.json';

// Initialize adapters
const adapters = createSupabaseAdapters(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Create router
const manageRouter = createManageRouter({
  ...adapters,
  bindings,
  packs: [iamPack, webhooksPack, settingsPack, ciqDomainPack]
});

// Edge function handler
serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const ipAddress = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const response = await manageRouter(body, {
      request: req,
      ipAddress,
      userAgent
    });

    return new Response(JSON.stringify(response), {
      status: response.status || 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

#### 2.2 Create CIQ Domain Pack
**File**: `ciq-automations/supabase/functions/manage/ciq-domain-pack.ts`

This pack exposes all CIQ-automations operations as agentic actions.

**Actions to expose:**
1. **Publishers**
   - `domain.ciq.publishers.list`
   - `domain.ciq.publishers.get`
   - `domain.ciq.publishers.search`
   - `domain.ciq.publishers.getContact`

2. **Campaigns**
   - `domain.ciq.campaigns.list`
   - `domain.ciq.campaigns.get`
   - `domain.ciq.campaigns.create`
   - `domain.ciq.campaigns.addPublisher`
   - `domain.ciq.campaigns.removePublisher`
   - `domain.ciq.campaigns.updatePublisherStatus`

3. **Lists**
   - `domain.ciq.lists.list`
   - `domain.ciq.lists.get`
   - `domain.ciq.lists.create`
   - `domain.ciq.lists.addPublishers`
   - `domain.ciq.lists.removePublishers`

4. **OneSheets**
   - `domain.ciq.onesheets.list`
   - `domain.ciq.onesheets.get`
   - `domain.ciq.onesheets.create`
   - `domain.ciq.onesheets.addPublishers`

5. **Workflows**
   - `domain.ciq.workflows.list`
   - `domain.ciq.workflows.get`
   - `domain.ciq.workflows.create`
   - `domain.ciq.workflows.run`
   - `domain.ciq.workflows.update`

6. **Webhooks**
   - `domain.ciq.webhooks.list`
   - `domain.ciq.webhooks.create`
   - `domain.ciq.webhooks.delete`

7. **Messaging**
   - `domain.ciq.messaging.send`
   - `domain.ciq.messaging.sendBulk`
   - `domain.ciq.messaging.sendTemplate`

8. **E-commerce**
   - `domain.ciq.ecommerce.createAffiliateLink`
   - `domain.ciq.ecommerce.getTransactionHistory`
   - `domain.ciq.ecommerce.createDraftOrder`

9. **Integrations**
   - `domain.ciq.integrations.syncGoogleDrive`
   - `domain.ciq.integrations.sendMetaAudience`
   - `domain.ciq.integrations.sendMetaConversions`

**Example Action Definition:**
```typescript
// ciq-domain-pack/actions.ts
export const ciqActions: ActionDef[] = [
  {
    name: 'domain.ciq.publishers.list',
    scope: 'manage.read',
    description: 'List all publishers for the brand',
    params_schema: {
      type: 'object',
      properties: {
        page: { type: 'number', default: 1 },
        size: { type: 'number', default: 50 },
        filters: { type: 'object' }
      }
    },
    supports_dry_run: false
  },
  {
    name: 'domain.ciq.campaigns.create',
    scope: 'manage.domain',
    description: 'Create a new campaign',
    params_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date' }
      },
      required: ['name']
    },
    supports_dry_run: true
  },
  // ... more actions
];
```

**Example Handler:**
```typescript
// ciq-domain-pack/handlers.ts
import { ActionHandler } from '../../control-plane/kernel/src/types.ts';
import { callCreatorIq } from '../_shared/creator-iq-client/index.ts';

export const handlePublishersList: ActionHandler = async (params, ctx) => {
  const { page = 1, size = 50, filters = {} } = params;
  
  // Use existing CIQ client
  const result = await callCreatorIq('publishers', {
    page,
    size,
    ...filters
  }, 'GET', null, false, `${ctx.bindings.tenant.table}_API_KEY`);

  return {
    data: {
      publishers: result.PublishersCollection || [],
      total: result.TotalCount || 0,
      page,
      size
    },
    impact: null  // Read-only operation
  };
};

export const handleCampaignsCreate: ActionHandler = async (params, ctx) => {
  if (ctx.dryRun) {
    return {
      data: { campaign_id: 'preview', ...params },
      impact: {
        creates: [{ type: 'campaign', count: 1 }],
        updates: [],
        deletes: [],
        side_effects: [],
        risk: 'low',
        warnings: []
      }
    };
  }

  // Real creation
  const result = await callCreatorIq('campaigns', {}, 'POST', params);
  
  return {
    data: result,
    impact: {
      creates: [{ type: 'campaign', count: 1, details: { id: result.CampaignId } }],
      updates: [],
      deletes: [],
      side_effects: [],
      risk: 'low',
      warnings: []
    }
  };
};
```

---

### Phase 3: Domain Pack Implementation (Week 2-3)

#### 3.1 Map Existing Edge Functions to Actions

**Strategy**: Wrap existing edge functions as action handlers, rather than rewriting them.

**Example Mapping:**
```typescript
// Map existing function to action handler
export const handleCampaignsCreate: ActionHandler = async (params, ctx) => {
  // Call existing edge function internally
  const response = await Deno.invoke('create-campaign', {
    body: JSON.stringify({
      ...params,
      brand_id: ctx.tenantId
    })
  });
  
  return {
    data: JSON.parse(new TextDecoder().decode(response.body)),
    impact: { /* ... */ }
  };
};
```

**Or**: Refactor existing functions to be callable both ways:
- As standalone edge functions (for frontend)
- As action handlers (for control plane)

#### 3.2 Implement All Domain Actions

**Priority Order:**
1. **High Priority** (Core operations):
   - Publishers (list, get, search)
   - Campaigns (list, create, manage publishers)
   - Lists (list, create, manage publishers)

2. **Medium Priority** (Workflow operations):
   - Workflows (list, create, run)
   - OneSheets (list, create, manage publishers)

3. **Lower Priority** (Advanced features):
   - Messaging
   - E-commerce
   - Integrations

---

### Phase 4: Testing & Validation (Week 3-4)

#### 4.1 Unit Tests
**Location**: `ciq-automations/control-plane/tests/`

```typescript
// tests/ciq-domain-pack.spec.ts
import { describe, it, expect } from 'vitest';
import { ciqDomainPack } from '../supabase/functions/manage/ciq-domain-pack.ts';

describe('CIQ Domain Pack', () => {
  it('should have all required actions', () => {
    expect(ciqDomainPack.actions.length).toBeGreaterThan(0);
    ciqDomainPack.actions.forEach(action => {
      expect(action.name).toMatch(/^domain\.ciq\./);
      expect(action.scope).toBeDefined();
      expect(action.params_schema).toBeDefined();
    });
  });

  it('should have handlers for all actions', () => {
    ciqDomainPack.actions.forEach(action => {
      expect(ciqDomainPack.handlers[action.name]).toBeDefined();
    });
  });
});
```

#### 4.2 Integration Tests
**Test `/manage` endpoint:**
```bash
# Test meta.actions discovery
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ciq_test123456..." \
  -d '{"action":"meta.actions"}'

# Test domain action
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ciq_test123456..." \
  -d '{
    "action": "domain.ciq.publishers.list",
    "params": {"page": 1, "size": 10}
  }'
```

#### 4.3 Generate OpenAPI Spec
```bash
cd control-plane
npm run generate:openapi
# Outputs: public/api/openapi.json
```

This spec will be used by agents to understand available operations.

---

### Phase 5: Documentation & Deployment (Week 4)

#### 5.1 Create Integration Documentation
**File**: `ciq-automations/docs/AGENTIC-INTEGRATION.md`

Document:
- How to create API keys
- Available actions
- Example agent interactions
- Error handling
- Rate limits

#### 5.2 Deploy to Production
1. Run database migrations
2. Deploy `/manage` edge function
3. Create initial API keys for testing
4. Test with agent (Edge Bot or similar)

#### 5.3 Create API Key Management UI
**Location**: `ciq-automations/src/components/api-keys/`

Add UI for:
- Creating API keys
- Viewing API keys (masked)
- Revoking API keys
- Viewing usage/audit logs

---

## Key Design Decisions

### 1. Tenant Model
- **Table**: `brands` (matches existing CIQ architecture)
- **Isolation**: All operations scoped to `brand_id`
- **Admin Check**: `is_platform_admin` function on brands table

### 2. API Key Format
- **Prefix**: `ciq_` (12 characters)
- **Storage**: Hashed with SHA-256
- **Scopes**: Array of strings (e.g., `["manage.read", "manage.domain"]`)

### 3. Action Naming Convention
- **Format**: `domain.ciq.{resource}.{operation}`
- **Examples**:
  - `domain.ciq.publishers.list`
  - `domain.ciq.campaigns.create`
  - `domain.ciq.workflows.run`

### 4. Dry-Run Support
- **Mutations**: All create/update/delete operations support dry-run
- **Reads**: No dry-run needed
- **Impact**: Dry-run returns impact shape showing what would change

### 5. Idempotency
- **Key**: Client-provided `idempotency_key` parameter
- **Storage**: `idempotency_cache` table with TTL
- **Replay**: Returns cached response for duplicate requests

### 6. Rate Limiting
- **Per Key**: Default 1000 requests/minute
- **Per Action**: Can override per action
- **Storage**: Supabase cache or Redis

---

## Migration Strategy

### Option A: Parallel Operation (Recommended)
- Keep existing edge functions working
- Add `/manage` endpoint alongside
- Gradually migrate frontend to use `/manage` if desired
- Agents use `/manage` exclusively

### Option B: Full Migration
- Replace all edge functions with `/manage` actions
- Frontend calls `/manage` endpoint
- More work, but single source of truth

**Recommendation**: Option A for now, Option B later if desired.

---

## Success Criteria

1. ✅ `/manage` endpoint deployed and accessible
2. ✅ `meta.actions` returns all available actions
3. ✅ API key authentication working
4. ✅ At least 20 core domain actions implemented
5. ✅ Dry-run working for mutations
6. ✅ Audit logging capturing all operations
7. ✅ OpenAPI spec generated
8. ✅ Agent can successfully:
   - Discover available actions
   - List publishers
   - Create campaigns
   - Add publishers to campaigns
   - Run workflows

---

## Risks & Mitigations

### Risk 1: Breaking Existing Functionality
**Mitigation**: Use Option A (parallel operation), keep existing functions intact

### Risk 2: Performance Impact
**Mitigation**: 
- Use existing edge functions internally (no duplication)
- Implement caching where appropriate
- Monitor rate limits

### Risk 3: Security Concerns
**Mitigation**:
- API keys are hashed and scoped
- All operations are audited
- Tenant isolation enforced
- Rate limiting prevents abuse

### Risk 4: Complexity
**Mitigation**:
- Start with core actions (publishers, campaigns, lists)
- Add advanced features incrementally
- Comprehensive documentation

---

## Next Steps

1. **Review this plan** with team
2. **Set up development environment** for testing
3. **Begin Phase 1** (Foundation Setup)
4. **Create initial API keys** for testing
5. **Test with agent** (Edge Bot or similar)

---

## Questions to Resolve

1. **Tenant Model**: Confirm `brands` table is correct tenant model
2. **API Key Management**: Where should API keys be created? (UI vs CLI vs API)
3. **Existing Functions**: Should we wrap existing functions or refactor them?
4. **Rate Limits**: What are appropriate rate limits per key?
5. **Ceilings**: What hard limits should we enforce? (e.g., max campaigns per brand)
6. **Multi-Brand**: How do we handle brands that have multiple Creator IQ accounts?

---

## Timeline Estimate

- **Phase 1**: 3-5 days
- **Phase 2**: 5-7 days
- **Phase 3**: 7-10 days
- **Phase 4**: 3-5 days
- **Phase 5**: 2-3 days

**Total**: 3-4 weeks for full implementation

---

## Resources

- **Control Plane Kit**: `/Users/rastakit/tga-workspace/repos/agentic-control-plane-kit`
- **CIQ Automations**: `/Users/rastakit/tga-workspace/repos/ciq-automations`
- **Integration Guide**: `agentic-control-plane-kit/INTEGRATION-GUIDE.md`
- **Architecture Doc**: `agentic-control-plane-kit/KERNEL-ARCHITECTURE.md`

---

*Last Updated: [Current Date]*
*Status: Draft - Pending Review*
