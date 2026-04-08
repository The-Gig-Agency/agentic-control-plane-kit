/**
 * Shared CLI / installer types (TGA-171).
 * Kept separate from cli.ts so command registry can import without circular deps.
 */

export type Environment = 'development' | 'staging' | 'production';

export interface InstallOptions {
  framework?: 'django' | 'express' | 'supabase' | 'hybrid_netlify_supabase' | 'auto';
  env?: Environment;
  kernelId?: string;
  integration?: string;
  governanceHubUrl?: string;
  kernelApiKey?: string;
  ciaUrl?: string;
  ciaServiceKey?: string;
  ciaAnonKey?: string;
  skipRegistration?: boolean;
  basePath?: string;
  noMigrations?: boolean;
  migrationsOnly?: boolean;
  dryRun?: boolean;
  /** When true with dryRun, print JSON install preview (TGA-193). */
  reportJson?: boolean;
}
