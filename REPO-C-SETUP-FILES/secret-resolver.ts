/**
 * Secret Name Resolver (Repo C - Tenant Agnostic)
 * 
 * Resolves secret name from tenant_integrations table for a given integration.
 * This replaces the brands table dependency - Repo C is tenant-agnostic.
 */

export async function resolveSecretName(
  supabase: any,
  tenantId: string,
  integration: string
): Promise<{ secretName: string; metadata?: any } | null> {
  // Query tenant_integrations table (tenant-agnostic)
  const { data: tenantIntegration, error } = await supabase
    .from('tenant_integrations')
    .select('secret_name, metadata')
    .eq('tenant_id', tenantId)
    .eq('integration', integration)
    .single();

  if (error || !tenantIntegration) {
    return null;
  }

  return {
    secretName: tenantIntegration.secret_name,
    metadata: tenantIntegration.metadata,
  };
}
