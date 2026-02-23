# Connector Catalog Implementation

**Date:** February 23, 2026  
**Repository:** governance-hub (Repo B)  
**Purpose:** Pre-approved connector catalog for hosted mode

---

## Overview

The connector catalog enables agents to discover and register pre-approved connectors without guessing IDs or hallucinating connector names.

**Three Discovery Options:**
- **Option A:** Catalog-first (GET /connectors/list) - Recommended
- **Option B:** Discovery inside MCP (echelon.connectors.list tool) - Agent-native
- **Option C:** Intent resolver (POST /connectors/resolve) - Plain language

---

## Database Schema

### `connectors` Table

```sql
CREATE TABLE connectors (
  id UUID PRIMARY KEY,
  connector_id TEXT NOT NULL UNIQUE,  -- e.g., "amazon", "stripe"
  name TEXT NOT NULL,                 -- e.g., "Amazon", "Stripe"
  description TEXT,
  tool_prefix TEXT NOT NULL,           -- e.g., "amazon.", "stripe."
  scopes TEXT[] DEFAULT '{}',         -- Required scopes
  requires_oauth BOOLEAN DEFAULT false,
  oauth_provider TEXT,                -- 'shopify', 'google', etc.
  docs_url TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  enabled BOOLEAN DEFAULT true,
  config_schema JSONB,                 -- JSON schema for connector_config
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**What It Stores:**
- Pre-approved connector metadata
- Tool prefixes (must match allowlist)
- Required scopes
- OAuth requirements
- Configuration schemas

**Security:**
- Public read access (catalog is public)
- Only admins can create/update connectors
- RLS policies enforce read-only for public

---

## API Endpoints

### Option A: GET /functions/v1/connectors/list

**Purpose:** Catalog-first approach - agents browse available connectors

**Request:**
```bash
GET https://your-governance-hub.supabase.co/functions/v1/connectors/list
```

**Query Params:**
- `enabled_only=true` (default) - filter to only enabled connectors

**Response:**
```json
{
  "ok": true,
  "data": {
    "connectors": [
      {
        "connector_id": "amazon",
        "name": "Amazon",
        "description": "Amazon Web Services integration",
        "tool_prefix": "amazon.",
        "scopes": ["amazon.read", "amazon.write"],
        "requires_oauth": false,
        "oauth_provider": null,
        "docs_url": "https://docs.buyechelon.com/connectors/amazon",
        "version": "1.0.0",
        "config_schema": {
          "type": "object",
          "properties": {
            "region": { "type": "string", "default": "us-east-1" }
          }
        }
      },
      {
        "connector_id": "shopify",
        "name": "Shopify",
        "description": "Shopify e-commerce platform",
        "tool_prefix": "shopify.",
        "scopes": ["shopify.read", "shopify.write"],
        "requires_oauth": true,
        "oauth_provider": "shopify",
        "docs_url": "https://docs.buyechelon.com/connectors/shopify",
        "version": "1.0.0"
      }
    ],
    "count": 2
  }
}
```

**Use Case:**
- Agent: "Show me available connectors"
- Agent: "I want Amazon" → uses `connector_id: "amazon"`

**Why It Works:**
- ✅ Zero guessing
- ✅ Zero hallucinated IDs
- ✅ Clear documentation URLs

---

### Option B: echelon.connectors.list (MCP Tool)

**Purpose:** Discovery inside MCP - agents stay in-protocol

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "echelon.connectors.list",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "connectors": [
      {
        "connector_id": "amazon",
        "name": "Amazon",
        "tool_prefix": "amazon.",
        "scopes": ["amazon.read", "amazon.write"],
        "docs_url": "https://docs.buyechelon.com/connectors/amazon"
      }
    ],
    "count": 1
  }
}
```

**Implementation:**
- Gateway exposes `echelon.connectors.list` as an MCP tool
- Gateway calls Repo B `/functions/v1/connectors/list`
- Returns connectors to agent
- Agent stays in MCP protocol

**Why It Works:**
- ✅ Agent stays in-protocol
- ✅ Onboarding becomes self-serve
- ✅ No need to leave MCP context

---

### Option C: POST /functions/v1/connectors/resolve

**Purpose:** Intent → resolver - most agent-native

**Request:**
```bash
POST https://your-governance-hub.supabase.co/functions/v1/connectors/resolve
Content-Type: application/json

{
  "intent": "read shopify orders"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "connector_id": "shopify",
    "name": "Shopify",
    "description": "Shopify e-commerce platform",
    "tool_prefix": "shopify.",
    "recommended_scopes": ["shopify.read"],
    "requires_oauth": true,
    "oauth_provider": "shopify",
    "docs_url": "https://docs.buyechelon.com/connectors/shopify",
    "version": "1.0.0"
  }
}
```

**Intent Matching:**
- Simple keyword matching (can be enhanced with ML/NLP)
- Maps keywords to connector_id
- Returns connector details + recommended scopes

**Why It Works:**
- ✅ Agent doesn't need to know IDs
- ✅ Plain language input
- ✅ Hard allowlist maintained

---

## Complete Flow: Agent Discovers and Registers Connector

### Step 1: Agent Discovers Connectors

**Option A (HTTP):**
```bash
GET https://your-governance-hub.supabase.co/functions/v1/connectors/list
→ Returns: [amazon, stripe, shopify, ...]
```

**Option B (MCP Tool):**
```json
{
  "method": "tools/call",
  "params": {
    "name": "echelon.connectors.list"
  }
}
→ Returns: [amazon, stripe, shopify, ...]
```

**Option C (Intent):**
```bash
POST /functions/v1/connectors/resolve
{ "intent": "read shopify orders" }
→ Returns: { connector_id: "shopify", ... }
```

### Step 2: Agent Registers Connector

```bash
POST https://gateway.buyechelon.com/mcp/servers/register
X-API-Key: mcp_xxxxx

{
  "server_id": "my-shopify-server",
  "name": "My Shopify Server",
  "mode": "hosted",
  "connector_id": "shopify",        // ← From catalog
  "connector_version": "1.0.0",
  "tool_prefix": "shopify.",        // ← From catalog
  "connector_config": {             // ← Optional, validated by config_schema
    "store_url": "mystore.myshopify.com"
  }
}
```

**Gateway:**
1. Validates `connector_id` exists in catalog
2. Validates `tool_prefix` matches catalog
3. Validates `connector_config` against `config_schema`
4. Stores in `tenant_mcp_servers`

### Step 3: Agent Registers Credentials

```bash
POST https://key-vault-executor.example.com/functions/v1/credentials/store
X-API-Key: mcp_xxxxx

{
  "service": "shopify",
  "credentials": {
    "access_token": "shpat_xxxxx"
  }
}
```

---

## Files Created

### Repo B (Governance Hub)

**Migration:**
- `supabase/migrations/20260223000003_add_connectors_catalog.sql`

**Edge Functions:**
- `supabase/functions/connectors-list/index.ts` (Option A)
- `supabase/functions/connectors-resolve/index.ts` (Option C)

### Gateway (Repo A)

**Updated:**
- `gateway/proxy.ts` - Added `echelon.connectors.list` tool (Option B)

---

## Deployment

### Repo B

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

# Add files
git add supabase/migrations/20260223000003_add_connectors_catalog.sql
git add supabase/functions/connectors-list/index.ts
git add supabase/functions/connectors-resolve/index.ts

# Commit
git commit -m "Add connector catalog system

- Add connectors table with pre-approved connector catalog
- Add GET /functions/v1/connectors/list endpoint (Option A)
- Add POST /functions/v1/connectors/resolve endpoint (Option C)
- Seed common connectors (amazon, stripe, shopify, slack, github, google, microsoft)
- Public read access for catalog discovery"

# Push
git push origin main
```

### Gateway (Repo A)

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Add updated file
git add gateway/proxy.ts

# Commit
git commit -m "Add echelon.connectors.list MCP tool (Option B)

- Add connector discovery tool to gateway
- Agents can discover connectors without leaving MCP protocol
- Gateway calls Repo B connectors/list endpoint"

# Push
git push origin main
```

---

## Summary

**Three Discovery Options:**
- ✅ **Option A:** Catalog endpoint (GET /connectors/list)
- ✅ **Option B:** MCP tool (echelon.connectors.list)
- ✅ **Option C:** Intent resolver (POST /connectors/resolve)

**Benefits:**
- ✅ Zero guessing (catalog is authoritative)
- ✅ Zero hallucinated IDs (hard allowlist)
- ✅ Agent-native (stays in MCP protocol)
- ✅ Plain language support (intent resolver)

**Security:**
- ✅ Only pre-approved connectors in catalog
- ✅ Tool prefix validation against catalog
- ✅ Config schema validation

---

**Document Version:** 1.0  
**Last Updated:** February 23, 2026
