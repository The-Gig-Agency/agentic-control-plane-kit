# Railway Deployment Guide: api-docs-template

## Part A: Get /api/manage Live

### Step 1: Deploy Backend to Railway

**If not already deployed:**
1. Go to: https://railway.app
2. New Project → Deploy from GitHub repo
3. Select: `acedge123/api-docs-template`
4. Select branch: `feat/agentic-control-plane` (or merge to main first)
5. Railway auto-detects Django and deploys

**If already deployed:**
1. Railway dashboard → Your project
2. Settings → Connect GitHub repo
3. Select branch: `feat/agentic-control-plane`
4. Railway auto-deploys on push

### Step 2: Configure Environment Variables

In Railway dashboard → Variables, add:

```
DATABASE_URL=postgresql://... (Railway auto-provides)
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=False
ALLOWED_HOSTS=your-railway-domain.railway.app,*.railway.app
```

### Step 3: Run Migrations

Railway will auto-run migrations, or manually:

**Railway dashboard → Deployments → Run Command:**
```bash
python manage.py migrate
```

### Step 4: Verify Endpoint is Live

**Get your Railway domain:**
- Railway dashboard → Settings → Domains
- Copy the domain (e.g., `api-docs-template-production.up.railway.app`)

**Test the endpoint:**
```bash
curl -X POST https://YOUR_RAILWAY_DOMAIN/api/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{"action":"meta.actions"}'
```

**Expected response:**
```json
{
  "ok": true,
  "data": {
    "actions": [...]
  }
}
```

**If you get 401/403:**
- Stub auth is working (rejects invalid keys)
- Need to create a real API key (Part B)

**If you get 404:**
- Check URL routing in Django
- Verify `/api/manage` is in `urls.py`

**If you get 500:**
- Check Railway logs
- Verify database connection
- Check adapter implementations

---

## Part B: Issue Auth Token for Agent

### Step 1: Create API Key in Database

**Option A: Django Admin**
1. Go to: `https://YOUR_DOMAIN/admin`
2. Navigate to API Keys
3. Create new key:
   - Name: "Agent Key"
   - Scopes: `["manage.read", "manage.iam", "manage.webhooks", "manage.settings", "manage.domain"]`
   - Tenant: Your tenant ID
4. Copy the key (starts with your prefix, e.g., `lsk_...`)

**Option B: Django Shell**
```bash
# Railway dashboard → Run Command
python manage.py shell

# In shell:
from scoringengine.models import ApiKey, Tenant
tenant = Tenant.objects.first()  # or get your tenant
key = ApiKey.objects.create(
    tenant=tenant,
    name="Agent Key",
    scopes=["manage.read", "manage.iam", "manage.webhooks", "manage.settings", "manage.domain"],
    prefix="lsk_",
    key_hash="..."  # hash of full key
)
print(f"Key: {key.prefix}...")  # Full key shown once
```

**Option C: Use /manage Endpoint (if IAM pack works)**
```bash
# If you have a key with manage.iam scope
curl -X POST https://YOUR_DOMAIN/api/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -d '{
    "action": "iam.keys.create",
    "params": {
      "name": "Agent Key",
      "scopes": ["manage.read", "manage.iam", "manage.webhooks", "manage.settings", "manage.domain"]
    }
  }'
```

### Step 2: Test Token Works

```bash
curl -X POST https://YOUR_RAILWAY_DOMAIN/api/manage \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_NEW_KEY" \
  -d '{"action":"meta.actions"}'
```

**Should return:**
```json
{
  "ok": true,
  "data": {
    "actions": [...]
  }
}
```

### Step 3: Give Token to Agent

**For Edge Bot / Cursor:**
1. Add token to agent configuration
2. Set environment variable: `AGENT_API_KEY=YOUR_KEY`
3. Or add to agent's credential store

**Test agent can access:**
- Agent should be able to call `meta.actions`
- Agent should see all available actions
- Agent can then call domain actions

---

## Troubleshooting

### Endpoint Not Found (404)
- Check `api/urls.py` includes `/manage` route
- Check Django `ALLOWED_HOSTS` includes Railway domain
- Verify `control_plane` app is in `INSTALLED_APPS`

### Authentication Fails (401/403)
- Verify API key format matches bindings (`key_prefix`, `prefix_length`)
- Check key is active in database
- Verify key has required scopes
- Check stub auth is replaced with real validation

### Database Errors
- Verify `DATABASE_URL` is set in Railway
- Check migrations ran successfully
- Verify adapter can connect to database

### Import Errors
- Check `control_plane` app is in Python path
- Verify all `__init__.py` files exist
- Check dependencies in `requirements.txt`

---

## Quick Checklist

**Deployment:**
- [ ] Code merged to branch Railway watches
- [ ] Railway project connected to GitHub repo
- [ ] Environment variables set
- [ ] Migrations run
- [ ] Endpoint responds to curl test

**Authentication:**
- [ ] API key created in database
- [ ] Key has correct scopes
- [ ] Token works with curl test
- [ ] Agent has token configured

**Verification:**
- [ ] `meta.actions` returns action list
- [ ] `meta.version` returns version info
- [ ] Domain pack actions are listed
- [ ] Agent can discover and call actions

---

## Next Steps After Deployment

1. **Test all endpoints** with the agent token
2. **Implement real adapters** (replace stubs)
3. **Add more domain actions** (leadscoring.models.*, etc.)
4. **Generate OpenAPI spec** for agent discovery
5. **Monitor audit logs** for agent activity
