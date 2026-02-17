/**
 * Django-specific installer
 * 
 * Copies kernel, generates adapters, creates endpoint, migrations, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InstallOptions, Environment } from '../cli.js';
import { generateAdapters } from '../generators/generate-adapters.js';
import { generateEndpoint } from '../generators/generate-endpoint.js';
import { generateBindings } from '../generators/generate-bindings.js';
import { generateMigrations } from '../generators/generate-migrations.js';

export interface InstallResult {
  kernelId: string;
  integration: string;
}

export async function installDjango(options: InstallOptions & { env?: Environment }): Promise<InstallResult> {
  const cwd = process.cwd();
  const env = options.env || 'development';
  
  // Determine project structure (backend/ or root)
  const backendDir = fs.existsSync(path.join(cwd, 'backend')) 
    ? path.join(cwd, 'backend')
    : cwd;
  
  const controlPlaneDir = path.join(backendDir, 'control_plane');
  
  // Environment-aware defaults
  const kernelId = options.kernelId || (env === 'development' 
    ? `django-dev-${Date.now()}`
    : env === 'staging'
    ? `django-staging-${Date.now()}`
    : 'django-kernel');
  
  const integration = options.integration || (env === 'development'
    ? 'django-dev'
    : 'django');

  console.log(`📁 Installing to: ${controlPlaneDir}\n`);

  // Step 1: Copy Python kernel
  console.log('📦 Copying Python kernel...');
  await copyKernel(controlPlaneDir, 'python');
  console.log('✅ Kernel copied\n');

  // Step 2: Generate adapters
  console.log('🔧 Generating adapters...');
  await generateAdapters({
    framework: 'django',
    outputDir: controlPlaneDir,
    integration,
  });
  console.log('✅ Adapters generated\n');

  // Step 3: Generate bindings
  console.log('⚙️  Generating bindings...');
  await generateBindings({
    framework: 'django',
    outputDir: backendDir,
    integration,
    kernelId,
  });
  console.log('✅ Bindings generated\n');

  // Step 4: Generate /api/manage endpoint
  console.log('🌐 Generating /api/manage endpoint...');
  await generateEndpoint({
    framework: 'django',
    outputDir: backendDir,
    integration,
    kernelId,
  });
  console.log('✅ Endpoint generated\n');

  // Step 5: Generate migrations
  console.log('🗄️  Generating database migrations...');
  const migrationFiles = await generateMigrations({
    framework: 'django',
    outputDir: backendDir,
  });
  console.log(`✅ Migrations generated: ${migrationFiles.join(', ')}\n`);

  // Step 6: Add URL route (update urls.py)
  console.log('🔗 Adding URL route...');
  await addUrlRoute(backendDir);
  console.log('✅ URL route added\n');

  // Step 7: Create .env.example (only if not in dev mode, or create dev-specific)
  if (env !== 'development') {
    console.log('📝 Creating environment variable template...');
    await createEnvExample(backendDir, kernelId, integration, options, env);
    console.log('✅ Environment template created\n');
  } else {
    console.log('📝 Creating development environment template...');
    await createEnvExample(backendDir, kernelId, integration, options, env);
    console.log('✅ Development environment template created\n');
  }

  return { kernelId, integration };
}

async function copyKernel(targetDir: string, kernelType: 'typescript' | 'python'): Promise<void> {
  const installerDir = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(installerDir, '../..');
  
  if (kernelType === 'python') {
    const kernelSource = path.join(repoRoot, 'kernel-py', 'acp');
    const kernelTarget = path.join(targetDir, 'acp');
    
    // Copy kernel files
    fs.mkdirSync(kernelTarget, { recursive: true });
    copyDirectory(kernelSource, kernelTarget);
  } else {
    const kernelSource = path.join(repoRoot, 'kernel', 'src');
    const kernelTarget = path.join(targetDir, 'kernel', 'src');
    
    fs.mkdirSync(kernelTarget, { recursive: true });
    copyDirectory(kernelSource, kernelTarget);
  }
}

function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function addUrlRoute(backendDir: string): Promise<void> {
  // Try to find urls.py (could be in multiple locations)
  const possibleUrls = [
    path.join(backendDir, 'api', 'urls.py'),
    path.join(backendDir, 'your_app', 'urls.py'),
    path.join(backendDir, 'urls.py'),
  ];

  let urlsPath: string | null = null;
  for (const urlPath of possibleUrls) {
    if (fs.existsSync(urlPath)) {
      urlsPath = urlPath;
      break;
    }
  }

  if (!urlsPath) {
    console.warn('⚠️  Could not find urls.py. Please manually add: path("api/manage", manage_endpoint)');
    return;
  }

  // Read existing urls.py
  let content = fs.readFileSync(urlsPath, 'utf-8');
  
  // Check if already added
  if (content.includes('manage_endpoint')) {
    console.log('   (Route already exists)');
    return;
  }

  // Add import and route
  if (!content.includes('from control_plane.views.manage import manage_endpoint')) {
    // Find where to add import (after other imports)
    const importMatch = content.match(/(from django\.urls import.*\n)/);
    if (importMatch) {
      content = content.replace(
        importMatch[0],
        `${importMatch[0]}from control_plane.views.manage import manage_endpoint\n`
      );
    }
  }

  // Add route to urlpatterns
  if (content.includes('urlpatterns = [')) {
    content = content.replace(
      'urlpatterns = [',
      `urlpatterns = [\n    path('api/manage', manage_endpoint, name='manage'),`
    );
  }

  fs.writeFileSync(urlsPath, content);
}

async function createEnvExample(backendDir: string, kernelId: string, integration: string, options: InstallOptions, env: Environment): Promise<void> {
  const isDev = env === 'development';
  
  const envExample = `# Agentic Control Plane Configuration
# Generated by Echelon installer
# Environment: ${env.toUpperCase()}

# Kernel Identity
KERNEL_ID=${kernelId}
INTEGRATION=${integration}

${isDev ? `# Development Mode: Optional connections (safe to skip)
# Governance Hub (Repo B) - Optional in dev
# GOVERNANCE_HUB_URL=https://dev-governance-hub.supabase.co
# ACP_KERNEL_KEY=acp_kernel_dev_xxxxx

# Key Vault Executor (Repo C) - Optional in dev
# CIA_URL=https://dev-vault.supabase.co
# CIA_SERVICE_KEY=cia_service_dev_xxxxx
# CIA_ANON_KEY=eyJ...
` : `# Governance Hub (Repo B)
GOVERNANCE_HUB_URL=${options.governanceHubUrl || 'https://xxx.supabase.co'}
ACP_KERNEL_KEY=${options.kernelApiKey || 'acp_kernel_xxxxx'}

# Key Vault Executor (Repo C)
CIA_URL=${options.ciaUrl || 'https://yyy.supabase.co'}
CIA_SERVICE_KEY=${options.ciaServiceKey || 'cia_service_xxxxx'}
CIA_ANON_KEY=${options.ciaAnonKey || 'eyJ...'}
`}
`;

  const envPath = path.join(backendDir, '.env.example');
  fs.writeFileSync(envPath, envExample);
}
