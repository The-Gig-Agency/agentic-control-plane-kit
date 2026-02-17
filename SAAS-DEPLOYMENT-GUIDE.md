# SaaS Deployment Guide: Adding Agentic Control Plane to a New SaaS

This guide walks through deploying the Agent Starter Kit (Repo A) to a new SaaS application, connecting it to Governance Hub (Repo B) and Key Vault Executor (Repo C).

## Overview: What You Get vs. What You Customize

### ✅ What the Agent Starter Kit Provides (No Customization Needed)

- **Core Kernel**: Request/response handling, validation, routing logic
- **Spec Contract**: Universal API contract (`/manage` endpoint)
- **Built-in Packs**: IAM, webhooks, settings (ready to use)
- **Meta Actions**: `meta.actions` and `meta.version` (self-discovery)
- **Safety Features**: Audit logging framework, idempotency, rate limiting, ceilings
- **TypeScript Kernel**: Complete implementation for Node.js/Supabase/Express
- **Python Kernel**: Complete implementation for Django/FastAPI

### 🔧 What You Must Customize (Framework & Domain-Specific)

1. **Framework Adapters** (required)
   - Database adapter (Django ORM, Supabase client, Prisma, etc.)
   - Audit adapter (where to store audit logs)
   - Idempotency adapter (cache/DB for replay)
   - Rate limit adapter (cache/DB for rate limiting)
   - Ceilings adapter (tenant limits enforcement)

2. **Domain Pack** (required)
   - Define your product-specific actions (e.g., `domain.leadscoring.models.create`)
   - Implement handlers for each action
   - Map to your business logic

3. **Bindings Configuration** (required)
   - Tenant model mapping (table name, ID column)
   - API key table mapping (table name, prefix format)
   - Database connection details

4. **Database Migrations** (required)
   - `api_keys` table (if not exists)
   - `audit_log` table
   - `idempotency_cache` table (optional, can use cache)

5. **Framework Integration** (required)
   - Create `/api/manage` endpoint (Django view, Express route, Supabase Edge Function)
   - Wire up authentication (extract API key from headers)
   - Convert framework request/response to kit format

6. **Repo B/C Integration** (optional but recommended)
   - `ControlPlaneAdapter` (for authorization from Governance Hub)
   - `ExecutorAdapter` (for external service calls via Key Vault Executor)
   - `RepoBAuditAdapter` (for sending audit events to Governance Hub)

---

## Step-by-Step Deployment Guide

### Phase 1: Install the Kit

#### Option A: Copy Kernel Source (Recommended for Early Stage)

```bash
# From your SaaS repo root
cd /path/to/your-saas-repo

# Create control_plane directory
mkdir -p backend/control_plane

# Copy Python kernel (for Django/FastAPI)
cp -r /path/to/agentic-control-plane-kit/kernel-py/acp backend/control_plane/

# Or copy TypeScript kernel (for Node.js/Supabase)
cp -r /path/to/agentic-control-plane-kit/kernel/src backend/control_plane/
```

#### Option B: Git Subtree (Recommended for Production)

```bash
# Add as subtree
git subtree add --prefix=backend/control_plane \
  https://github.com/The-Gig-Agency/agentic-control-plane-kit.git kernel-py/acp --squash
```

---

### Phase 2: Create Framework Adapters

#### For Django (Python)

Create `backend/control_plane/adapters.py`:

```python
from control_plane.acp.types import (
    DbAdapter, AuditAdapter, IdempotencyAdapter,
    RateLimitAdapter, CeilingsAdapter
)
from django.db import connection
from django.core.cache import cache
from your_app.models import ApiKey, Tenant, AuditLog

class DjangoDbAdapter(DbAdapter):
    """Database adapter using Django ORM"""
    
    async def query(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    async def get_tenant_from_api_key(self, api_key_id):
        try:
            key = ApiKey.objects.get(id=api_key_id)
            return str(key.tenant_id)
        except ApiKey.DoesNotExist:
            return None
    
    # ... implement other DbAdapter methods

class DjangoAuditAdapter(AuditAdapter):
    """Audit adapter using Django models"""
    
    async def log(self, entry):
        AuditLog.objects.create(
            tenant_id=entry['tenant_id'],
            actor_type=entry['actor_type'],
            actor_id=entry['actor_id'],
            action=entry['action'],
            request_id=entry['request_id'],
            result=entry['result'],
            # ... other fields
        )

class DjangoIdempotencyAdapter(IdempotencyAdapter):
    """Idempotency using Django cache"""
    
    async def get_replay(self, tenant_id, action, idempotency_key):
        key = f"idempotency:{tenant_id}:{action}:{idempotency_key}"
        return cache.get(key)
    
    async def store_replay(self, tenant_id, action, idempotency_key, response):
        key = f"idempotency:{tenant_id}:{action}:{idempotency_key}"
        cache.set(key, response, timeout=86400)  # 24 hours

class DjangoRateLimitAdapter(RateLimitAdapter):
    """Rate limiting using Django cache"""
    
    async def check(self, api_key_id, action, limit):
        key = f"ratelimit:{api_key_id}:{action}"
        count = cache.get(key, 0)
        allowed = count < limit
        if allowed:
            cache.set(key, count + 1, timeout=60)
        return {'allowed': allowed, 'limit': limit, 'remaining': max(0, limit - count - 1)}

class DjangoCeilingsAdapter(CeilingsAdapter):
    """Ceilings using Django models"""
    
    async def check(self, action, params, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        # Implement your ceiling checks
        # Example: max resources per tenant
        pass
```

#### For Node.js/Express (TypeScript)

Create `src/adapters/index.ts`:

```typescript
import { DbAdapter, AuditAdapter, ... } from 'agentic-control-plane-kit/kernel/src/types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PrismaDbAdapter implements DbAdapter {
  async query(sql: string, params?: any[]): Promise<any[]> {
    // Use Prisma or raw SQL
    return prisma.$queryRawUnsafe(sql, ...(params || []));
  }
  
  async getTenantFromApiKey(apiKeyId: string): Promise<string | null> {
    const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    return key?.tenantId || null;
  }
  
  // ... implement other methods
}

export class PrismaAuditAdapter implements AuditAdapter {
  async log(entry: AuditEntry): Promise<void> {
    await prisma.auditLog.create({ data: entry });
  }
}

// ... other adapters
```

---

### Phase 3: Create Domain Pack

Create `backend/control_plane/packs/your_domain/`:

```python
# backend/control_plane/packs/your_domain/actions.py
from control_plane.acp.types import ActionDef

your_domain_actions = [
    ActionDef(
        name='domain.yourproduct.resources.list',
        scope='manage.read',
        description='List resources',
        params_schema={'type': 'object', 'properties': {}},
        supports_dry_run=False
    ),
    ActionDef(
        name='domain.yourproduct.resources.create',
        scope='manage.domain',
        description='Create a resource',
        params_schema={
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'type': {'type': 'string'}
            },
            'required': ['name']
        },
        supports_dry_run=True
    ),
    # ... more actions
]

# backend/control_plane/packs/your_domain/handlers.py
async def handle_resources_list(params, ctx):
    """List resources for tenant"""
    # Use ctx.db or your ORM
    resources = await ctx.db.list_resources(ctx.tenant_id)
    return {'data': resources}

async def handle_resources_create(params, ctx):
    """Create a resource"""
    if ctx.dry_run:
        return {
            'data': {'id': 'preview', **params},
            'impact': {
                'creates': [{'type': 'resource', 'count': 1}],
                'risk': 'low'
            }
        }
    
    resource = await ctx.db.create_resource(ctx.tenant_id, params)
    return {
        'data': resource,
        'impact': {
            'creates': [{'type': 'resource', 'id': resource.id}],
            'risk': 'low'
        }
    }

# backend/control_plane/packs/your_domain/index.py
from control_plane.acp.types import Pack
from .actions import your_domain_actions
from .handlers import (
    handle_resources_list,
    handle_resources_create,
)

your_domain_pack = Pack(
    name='yourproduct',
    actions=your_domain_actions,
    handlers={
        'domain.yourproduct.resources.list': handle_resources_list,
        'domain.yourproduct.resources.create': handle_resources_create,
    }
)
```

---

### Phase 4: Configure Bindings

Create `backend/control_plane/bindings.py`:

```python
def get_bindings():
    return {
        'kernelId': os.environ.get('KERNEL_ID', 'yourproduct-kernel'),
        'integration': 'yourproduct',  # Used in audit events
        
        'tenant': {
            'table': 'tenants',  # Your tenant table name
            'id_column': 'id',
        },
        'auth': {
            'keys_table': 'api_keys',  # Your API key table
            'key_prefix': 'ypk_',  # Your prefix (e.g., "Your Product Key")
            'prefix_length': 12,
        },
        'database': {
            'adapter': 'django',  # or 'supabase', 'prisma', etc.
        },
    }
```

---

### Phase 5: Create Database Migrations

#### Django Migration

```python
# your_app/migrations/XXXX_add_control_plane_tables.py
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('your_app', 'XXXX_previous')]

    operations = [
        migrations.CreateModel(
            name='ApiKey',
            fields=[
                ('id', models.UUIDField(primary_key=True)),
                ('tenant_id', models.UUIDField()),
                ('prefix', models.CharField(max_length=20)),
                ('key_hash', models.CharField(max_length=64)),
                ('name', models.CharField(max_length=255)),
                ('scopes', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(null=True)),
            ],
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.UUIDField(primary_key=True)),
                ('tenant_id', models.UUIDField()),
                ('actor_type', models.CharField(max_length=20)),
                ('actor_id', models.CharField(max_length=255)),
                ('action', models.CharField(max_length=255)),
                ('request_id', models.CharField(max_length=255)),
                ('result', models.CharField(max_length=20)),
                ('error_message', models.TextField(null=True)),
                ('ip_address', models.GenericIPAddressField(null=True)),
                ('dry_run', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['tenant_id', 'created_at']),
                    models.Index(fields=['action', 'created_at']),
                ],
            },
        ),
    ]
```

---

### Phase 6: Create `/api/manage` Endpoint

#### Django

Create `backend/api/views/manage.py`:

```python
import json
import os
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from control_plane.acp.router import create_manage_router
from control_plane.adapters import (
    DjangoDbAdapter, DjangoAuditAdapter,
    DjangoIdempotencyAdapter, DjangoRateLimitAdapter, DjangoCeilingsAdapter
)
from control_plane.packs.your_domain import your_domain_pack
from control_plane.bindings import get_bindings

# Optional: Repo B/C adapters
from control_plane.control_plane_adapter import HttpControlPlaneAdapter
from control_plane.executor_adapter import HttpExecutorAdapter
from control_plane.repo_b_audit_adapter import RepoBAuditAdapter

_router = None

def _get_router():
    global _router
    if _router is None:
        bindings = get_bindings()
        
        # Create Repo C executor adapter (optional)
        executor = None
        if os.environ.get('CIA_URL') and os.environ.get('CIA_SERVICE_KEY'):
            executor = HttpExecutorAdapter(
                cia_url=os.environ.get('CIA_URL'),
                cia_service_key=os.environ.get('CIA_SERVICE_KEY'),
                cia_anon_key=os.environ.get('CIA_ANON_KEY'),
                kernel_id=bindings['kernelId'],
            )
        
        # Create Repo B control plane adapter (optional)
        control_plane = None
        if os.environ.get('GOVERNANCE_HUB_URL') and os.environ.get('ACP_KERNEL_KEY'):
            control_plane = HttpControlPlaneAdapter(
                platform_url=os.environ.get('GOVERNANCE_HUB_URL'),
                kernel_api_key=os.environ.get('ACP_KERNEL_KEY'),
            )
            # Send heartbeat on startup
            try:
                control_plane.heartbeat(
                    kernel_id=bindings['kernelId'],
                    version='1.0.0',
                    packs=['yourproduct'],
                    env=os.environ.get('ENVIRONMENT', 'production')
                )
            except Exception as e:
                print(f"⚠️ Heartbeat failed (non-fatal): {e}")
        
        # Create audit adapter (Repo B if configured, otherwise stub)
        if os.environ.get('GOVERNANCE_HUB_URL') and os.environ.get('ACP_KERNEL_KEY'):
            audit_adapter = RepoBAuditAdapter(
                governance_url=os.environ.get('GOVERNANCE_HUB_URL'),
                kernel_id=bindings['kernelId'],
                kernel_api_key=os.environ.get('ACP_KERNEL_KEY'),
            )
        else:
            audit_adapter = DjangoAuditAdapter()
        
        _router = create_manage_router(
            audit_adapter=audit_adapter,
            idempotency_adapter=DjangoIdempotencyAdapter(),
            rate_limit_adapter=DjangoRateLimitAdapter(),
            ceilings_adapter=DjangoCeilingsAdapter(),
            bindings=bindings,
            packs=[your_domain_pack],
            executor=executor,
            control_plane=control_plane,
        )
    return _router

@csrf_exempt
@require_http_methods(["POST"])
def manage_endpoint(request):
    """POST /api/manage - Agentic control plane"""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse(
            {"ok": False, "error": "Invalid JSON", "code": "VALIDATION_ERROR"},
            status=400,
        )
    
    meta = {
        "request": request,
        "ip_address": get_client_ip(request),
        "user_agent": request.META.get("HTTP_USER_AGENT", ""),
    }
    
    router = _get_router()
    response = router(body, meta)
    
    status = 200
    if not response.get("ok"):
        code = response.get("code", "INTERNAL_ERROR")
        status_map = {
            "INVALID_API_KEY": 401,
            "SCOPE_DENIED": 403,
            "NOT_FOUND": 404,
            "RATE_LIMITED": 429,
            "VALIDATION_ERROR": 400,
        }
        status = status_map.get(code, 500)
    
    return JsonResponse(response, status=status)

def get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
```

Add to `backend/api/urls.py`:

```python
from django.urls import path
from .views.manage import manage_endpoint

urlpatterns = [
    path('manage', manage_endpoint, name='manage'),
    # ... other routes
]
```

---

### Phase 7: Set Environment Variables

In your deployment platform (Railway, Heroku, etc.), set:

```bash
# Required
KERNEL_ID=yourproduct-kernel
DATABASE_URL=postgresql://...

# Optional: Repo B (Governance Hub)
GOVERNANCE_HUB_URL=https://xxx.supabase.co
ACP_KERNEL_KEY=acp_kernel_xxxxx  # Generated in Governance Hub

# Optional: Repo C (Key Vault Executor)
CIA_URL=https://yyy.supabase.co
CIA_SERVICE_KEY=cia_service_xxxxx  # Generated in Key Vault Executor
CIA_ANON_KEY=eyJ...  # Supabase anon key
```

---

### Phase 8: Register Kernel in Governance Hub (Repo B)

1. **Go to Governance Hub UI**
2. **Create Organization** (if not exists)
3. **Register Kernel**:
   - Kernel ID: `yourproduct-kernel`
   - Organization: Your organization
   - Generate API Key: `acp_kernel_xxxxx`
   - Set `ACP_KERNEL_KEY` in your SaaS environment

4. **Create Policies** (optional):
   - Define which actions require approval
   - Set rate limits per tenant
   - Configure access rules

---

### Phase 9: Generate Service Key for Repo C (Optional)

If you need external service execution (Shopify, etc.):

1. **Go to Key Vault Executor UI**
2. **Create Service Key**:
   - Name: `yourproduct-service-key`
   - Generate key: `cia_service_xxxxx`
   - Set `CIA_SERVICE_KEY` in your SaaS environment

---

### Phase 10: Test the Integration

```bash
# Test meta.actions (should work immediately)
curl -X POST https://your-saas.com/api/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ypk_test123456" \
  -d '{"action":"meta.actions"}'

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "actions": [
#       {"name": "meta.actions", ...},
#       {"name": "domain.yourproduct.resources.list", ...},
#       ...
#     ]
#   }
# }
```

---

## Summary: Customization Requirements

| Component | Provided by Kit? | Customization Required |
|-----------|------------------|------------------------|
| Core Router | ✅ Yes | ❌ No |
| Request/Response Handling | ✅ Yes | ❌ No |
| Validation | ✅ Yes | ❌ No |
| Framework Adapters | ❌ No | ✅ **Yes** - Must implement for your framework |
| Domain Pack | ❌ No | ✅ **Yes** - Must define your actions/handlers |
| Bindings Config | ❌ No | ✅ **Yes** - Must map to your schema |
| Database Migrations | ❌ No | ✅ **Yes** - Must create tables |
| `/api/manage` Endpoint | ❌ No | ✅ **Yes** - Must wire up to your framework |
| Repo B/C Integration | ✅ Yes (adapters exist) | ⚠️ Optional - Configure if using |

---

## What We Did for Django (Leadscore Example)

1. ✅ Copied Python kernel from kit
2. ✅ Implemented Django adapters (DbAdapter, AuditAdapter, etc.)
3. ✅ Created leadscoring domain pack (actions + handlers)
4. ✅ Configured bindings (tenant table, API key table)
5. ✅ Created database migrations (api_keys, audit_log)
6. ✅ Created `/api/manage` Django view
7. ✅ Added Repo B/C adapters (ControlPlaneAdapter, ExecutorAdapter, RepoBAuditAdapter)
8. ✅ Set environment variables in Railway

**Time to deploy**: ~2-3 days for full integration (including Repo B/C)

---

## Next Steps After Deployment

1. **Create API Keys** for agents
2. **Test with Agent** (Edge Bot, ChatGPT, etc.)
3. **Monitor Audit Logs** in Governance Hub
4. **Create Policies** in Governance Hub for safety
5. **Extend Domain Pack** as you add features

---

## Questions?

- See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) for detailed examples
- See [README.md](./README.md) for architecture overview
- See [kernel-py/README.md](./kernel-py/README.md) for Python kernel details
