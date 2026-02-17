-- Repo C: CIA Key Vault + Executor - Initial Schema
-- This service provides secure API execution for multiple SaaS applications

-- 1. CIA Service Keys
-- Stores service credentials for Repo A instances to authenticate
CREATE TABLE cia_service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- HMAC-SHA-256(PEPPER, key) - NOT raw SHA-256
  organization_id UUID,  -- Optional: for multi-org
  allowed_tenant_ids UUID[],  -- Optional: restrict to specific tenants (empty = all)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_cia_service_keys_hash ON cia_service_keys(key_hash) WHERE status = 'active';
CREATE INDEX idx_cia_service_keys_org ON cia_service_keys(organization_id) WHERE status = 'active';
CREATE INDEX idx_cia_service_keys_tenant ON cia_service_keys USING GIN(allowed_tenant_ids) WHERE status = 'active';

-- 2. Action Allowlist
-- Whitelist of allowed actions per integration (security constraint)
CREATE TABLE action_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration TEXT NOT NULL,  -- 'shopify', 'ciq', 'leadscore'
  action TEXT NOT NULL,  -- 'shopify.products.create', 'ciq.publishers.list', etc.
  action_version TEXT DEFAULT 'v1',  -- Allows evolving action contracts safely
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration, action)
);

CREATE INDEX idx_action_allowlist_integration ON action_allowlist(integration) WHERE enabled = TRUE;
CREATE INDEX idx_action_allowlist_action ON action_allowlist(action) WHERE enabled = TRUE;

-- 3. Tenant Integrations
-- Maps tenants to their integration secrets (replaces brands table dependency)
CREATE TABLE tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,  -- UUID or string from calling service
  integration TEXT NOT NULL,  -- 'shopify', 'ciq', 'leadscore'
  secret_name TEXT NOT NULL,  -- Name of secret in Supabase Vault
  metadata JSONB,  -- Additional config (e.g., shopify_store_url)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, integration)
);

CREATE INDEX idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX idx_tenant_integrations_integration ON tenant_integrations(integration);

-- Enable RLS
ALTER TABLE cia_service_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service role can access all)
CREATE POLICY "Service role can manage cia_service_keys"
  ON cia_service_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage action_allowlist"
  ON action_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tenant_integrations"
  ON tenant_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed initial allowlist with all existing actions
-- Shopify actions
INSERT INTO action_allowlist (integration, action, action_version) VALUES
  ('shopify', 'products.list', 'v1'),
  ('shopify', 'products.get', 'v1'),
  ('shopify', 'products.create', 'v1'),
  ('shopify', 'products.update', 'v1'),
  ('shopify', 'products.delete', 'v1'),
  ('shopify', 'orders.list', 'v1'),
  ('shopify', 'orders.get', 'v1'),
  ('shopify', 'orders.create', 'v1'),
  ('shopify', 'orders.cancel', 'v1')
ON CONFLICT (integration, action) DO NOTHING;

-- CIQ actions
INSERT INTO action_allowlist (integration, action, action_version) VALUES
  ('ciq', 'publishers.list', 'v1'),
  ('ciq', 'publishers.get', 'v1'),
  ('ciq', 'publishers.search', 'v1'),
  ('ciq', 'publishers.getContact', 'v1'),
  ('ciq', 'campaigns.list', 'v1'),
  ('ciq', 'campaigns.get', 'v1'),
  ('ciq', 'campaigns.create', 'v1'),
  ('ciq', 'campaigns.update', 'v1'),
  ('ciq', 'campaigns.delete', 'v1'),
  ('ciq', 'lists.list', 'v1'),
  ('ciq', 'lists.get', 'v1'),
  ('ciq', 'lists.create', 'v1'),
  ('ciq', 'lists.update', 'v1'),
  ('ciq', 'lists.delete', 'v1'),
  ('ciq', 'workflows.list', 'v1'),
  ('ciq', 'workflows.get', 'v1'),
  ('ciq', 'workflows.run', 'v1'),
  ('ciq', 'messaging.send', 'v1')
ON CONFLICT (integration, action) DO NOTHING;

-- LeadScore actions
INSERT INTO action_allowlist (integration, action, action_version) VALUES
  ('leadscore', 'leads.list', 'v1'),
  ('leadscore', 'leads.get', 'v1'),
  ('leadscore', 'leads.create', 'v1'),
  ('leadscore', 'leads.update', 'v1')
ON CONFLICT (integration, action) DO NOTHING;
