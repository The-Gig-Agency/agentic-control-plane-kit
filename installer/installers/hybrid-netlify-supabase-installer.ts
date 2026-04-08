/**
 * Hybrid installer: Netlify Functions own the public /manage HTTP surface;
 * Supabase remains the data plane. TypeScript kernel + Prisma-oriented bindings
 * match the express path; endpoint is emitted under netlify/functions/.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAgenticKitPackageRoot } from '../kit-root.js';
import type { InstallOptions, Environment } from '../cli-types.js';
import { generateAdapters } from '../generators/generate-adapters.js';
import { generateEndpoint } from '../generators/generate-endpoint.js';
import { generateBindings } from '../generators/generate-bindings.js';
import { generateMigrations } from '../generators/generate-migrations.js';

export interface InstallResult {
  kernelId: string;
  integration: string;
}

const DEFAULT_MANAGE_PATH = '/.netlify/functions/echelon-manage';

export async function installHybridNetlifySupabase(
  options: InstallOptions & { env?: Environment },
): Promise<InstallResult> {
  const cwd = process.cwd();
  const env = options.env || 'development';
  const controlPlaneDir = path.join(cwd, 'control_plane');

  const kernelId =
    options.kernelId ||
    (env === 'development'
      ? `hybrid-dev-${Date.now()}`
      : env === 'staging'
        ? `hybrid-staging-${Date.now()}`
        : 'hybrid-kernel');

  const integration = options.integration || (env === 'development' ? 'hybrid-dev' : 'hybrid');

  const basePath = options.basePath || DEFAULT_MANAGE_PATH;

  console.log(`📁 Hybrid (Netlify + Supabase) install → ${controlPlaneDir}\n`);
  console.log(`🌐 Public manage URL path: ${basePath}\n`);

  console.log('📦 Copying TypeScript kernel...');
  await copyKernel(controlPlaneDir);
  console.log('✅ Kernel copied\n');

  console.log('🔧 Generating adapters...');
  await generateAdapters({
    framework: 'hybrid_netlify_supabase',
    outputDir: controlPlaneDir,
    integration,
  });
  console.log('✅ Adapters generated\n');

  console.log('⚙️  Generating bindings...');
  await generateBindings({
    framework: 'hybrid_netlify_supabase',
    outputDir: cwd,
    integration,
    kernelId,
    basePath,
  });
  console.log('✅ Bindings generated\n');

  console.log('🌐 Generating Netlify function for manage...');
  await generateEndpoint({
    framework: 'hybrid_netlify_supabase',
    outputDir: cwd,
    integration,
    kernelId,
    basePath,
  });
  console.log('✅ Netlify function generated\n');

  console.log('🗄️  Generating database migrations...');
  const migrationFiles = await generateMigrations({
    framework: 'hybrid_netlify_supabase',
    outputDir: cwd,
  });
  console.log(`✅ Migrations generated: ${migrationFiles.join(', ')}\n`);

  console.log('📦 Updating package.json...');
  await updatePackageJson(cwd);
  console.log('✅ Package.json updated\n');

  console.log('📝 Creating environment variable template...');
  await createEnvExample(cwd, kernelId, integration, options, env);
  console.log('✅ Environment template created\n');

  return { kernelId, integration };
}

async function copyKernel(targetDir: string): Promise<void> {
  const repoRoot = getAgenticKitPackageRoot();
  const kernelSource = path.join(repoRoot, 'kernel', 'src');
  const kernelTarget = path.join(targetDir, 'kernel', 'src');
  fs.mkdirSync(kernelTarget, { recursive: true });
  copyDirectory(kernelSource, kernelTarget);
  const indexSrc = path.join(repoRoot, 'kernel', 'index.ts');
  const indexDest = path.join(targetDir, 'kernel', 'index.ts');
  if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, indexDest);
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

async function updatePackageJson(cwd: string): Promise<void> {
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.warn('⚠️  package.json not found. Skipping dependency update.');
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  pkg.dependencies = pkg.dependencies || {};
  if (!pkg.dependencies['@supabase/supabase-js']) {
    pkg.dependencies['@supabase/supabase-js'] = '^2.0.0';
  }
  if (!pkg.devDependencies) {
    pkg.devDependencies = {};
  }
  if (!pkg.devDependencies['@netlify/functions']) {
    pkg.devDependencies['@netlify/functions'] = '^2.8.0';
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}

async function createEnvExample(
  cwd: string,
  kernelId: string,
  integration: string,
  options: InstallOptions,
  env: Environment,
): Promise<void> {
  const isDev = env === 'development';
  const envExample = `# Agentic Control Plane — Hybrid Netlify + Supabase
# Public endpoint: Netlify Function (see netlify/functions/echelon-manage.ts)

KERNEL_ID=${kernelId}
INTEGRATION=${integration}

${isDev ? `# Optional in dev
# ACP_BASE_URL=
# ACP_KERNEL_KEY=
` : `ACP_BASE_URL=${options.governanceHubUrl || 'https://xxx.supabase.co'}
ACP_KERNEL_KEY=${options.kernelApiKey || 'acp_kernel_xxxxx'}
`}
`;
  fs.writeFileSync(path.join(cwd, '.env.example'), envExample);
}
