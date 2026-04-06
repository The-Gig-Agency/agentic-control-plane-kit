/**
 * Echelon CLI command registry (TGA-171).
 *
 * - Single place for public verb metadata (for docs, `echelon verbs`, tooling).
 * - `registerEchelonCommands` wires commander without importing installer `install()` (avoids cycles).
 */

import { Command } from 'commander';
import {
  createEnvironmentWorkflowPlan,
  createInitWorkflowPlan,
  createLinkWorkflowPlan,
  createLoginWorkflowPlan,
  createProtectWorkflowPlan,
} from './workflows/index.js';
import type { Environment, InstallOptions } from './cli-types.js';
import type { Framework } from './detect/index.js';
import type { ProductShellWorkflowPlan } from './workflows/index.js';

export type EchelonVerbCategory = 'public' | 'legacy' | 'meta';

export interface EchelonVerbMeta {
  /** Commander subcommand name */
  name: string;
  /** Short description (matches commander .description()) */
  summary: string;
  category: EchelonVerbCategory;
  /**
   * `implemented` = executable behavior (not only a workflow plan stub).
   * Workflow verbs still return structured plans; they are "stubs" relative to full product automation.
   */
  implementation: 'full' | 'workflow_plan' | 'placeholder';
}

/** Public product-facing verbs (Echelon operator / agent discovery). */
export const ECHELON_PUBLIC_VERBS: readonly EchelonVerbMeta[] = [
  { name: 'login', summary: 'Public operator login (product-shell workflow)', category: 'public', implementation: 'workflow_plan' },
  { name: 'link', summary: 'Associate local app with a hosted project', category: 'public', implementation: 'workflow_plan' },
  { name: 'init', summary: 'Scaffold with readiness gates', category: 'public', implementation: 'workflow_plan' },
  { name: 'protect', summary: 'Verify readiness + prepare safe execution', category: 'public', implementation: 'workflow_plan' },
  { name: 'dev', summary: 'Convenience: target development environment', category: 'public', implementation: 'workflow_plan' },
  { name: 'deploy', summary: 'Convenience: target production protect workflow', category: 'public', implementation: 'workflow_plan' },
  { name: 'audit', summary: 'Readiness / diagnostics for the public surface', category: 'public', implementation: 'full' },
  { name: 'approve', summary: 'Finalize approvals (product-shell placeholder)', category: 'public', implementation: 'placeholder' },
] as const;

export const ECHELON_LEGACY_VERBS: readonly EchelonVerbMeta[] = [
  { name: 'install', summary: 'Legacy: embed kernel into host repo', category: 'legacy', implementation: 'full' },
  { name: 'uninstall', summary: 'Legacy: remove control plane installation', category: 'legacy', implementation: 'full' },
  { name: 'doctor', summary: 'Legacy: installation doctor (prefer `echelon audit`)', category: 'legacy', implementation: 'full' },
  { name: 'status', summary: 'Show current installation status', category: 'legacy', implementation: 'full' },
] as const;

export const ECHELON_META_VERBS: readonly EchelonVerbMeta[] = [
  { name: 'verbs', summary: 'List public CLI verbs (machine- or human-readable)', category: 'meta', implementation: 'full' },
] as const;

export function listAllVerbMeta(): EchelonVerbMeta[] {
  return [...ECHELON_PUBLIC_VERBS, ...ECHELON_LEGACY_VERBS, ...ECHELON_META_VERBS];
}

export interface EchelonCommandHandlers {
  install: (options: InstallOptions) => Promise<void>;
  uninstall: () => Promise<void>;
  doctor: (opts: { json?: boolean; probe?: boolean }) => Promise<void>;
  status: () => Promise<void>;
}

function parseFrameworkOption(fw: string | undefined): Framework | undefined {
  if (!fw || fw === 'auto') return undefined;
  return fw as Framework;
}

function printWorkflow(plan: ProductShellWorkflowPlan & { connector?: string }, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(plan.publicCommand);
  console.log('');
  console.log(`Summary: ${plan.summary}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Next: ${plan.nextAction}`);
  console.log('');
  console.log('Steps:');
  for (const step of plan.steps ?? []) {
    console.log(`- ${step.id}: ${step.label}`);
  }
  console.log('');
}

export function registerEchelonCommands(program: Command, handlers: EchelonCommandHandlers): void {
  program
    .command('verbs')
    .description('List registered Echelon CLI verbs')
    .option('--json', 'Output machine-readable JSON')
    .option('--public-only', 'Only public + meta verbs (exclude legacy)')
    .action((opts: { json?: boolean; publicOnly?: boolean }) => {
      const verbs = opts.publicOnly
        ? [...ECHELON_PUBLIC_VERBS, ...ECHELON_META_VERBS]
        : listAllVerbMeta();
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              public: ECHELON_PUBLIC_VERBS,
              legacy: opts.publicOnly ? [] : ECHELON_LEGACY_VERBS,
              meta: ECHELON_META_VERBS,
            },
            null,
            2
          )
        );
        return;
      }
      console.log('Echelon CLI verbs\n');
      for (const v of verbs) {
        const tag =
          v.category === 'legacy' ? '[legacy]' : v.category === 'meta' ? '[meta]' : '[public]';
        console.log(`  ${tag} ${v.name.padEnd(12)} — ${v.summary}`);
      }
      if (!opts.publicOnly) {
        console.log('\nTip: npx echelon verbs --public-only');
      }
      console.log('');
    });

  program
    .command('login')
    .description('Public operator login (product-shell workflow)')
    .option('--env <env>', 'Environment (development|staging|production)', 'development')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { env: string; framework: string; json?: boolean }) => {
      const plan = await createLoginWorkflowPlan({
        cwd: process.cwd(),
        env: opts.env as Environment,
        framework: parseFrameworkOption(opts.framework),
      });
      printWorkflow(plan, opts.json);
    });

  program
    .command('link')
    .description('Public link workflow (associate local app with a hosted project)')
    .option('--env <env>', 'Environment (development|staging|production)', 'development')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { env: string; framework: string; json?: boolean }) => {
      const plan = await createLinkWorkflowPlan({
        cwd: process.cwd(),
        env: opts.env as Environment,
        framework: parseFrameworkOption(opts.framework),
      });
      printWorkflow(plan, opts.json);
    });

  program
    .command('init')
    .description('Public init workflow (scaffold with readiness gates)')
    .option('--env <env>', 'Environment (development|staging|production)', 'development')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { env: string; framework: string; json?: boolean }) => {
      const plan = await createInitWorkflowPlan({
        cwd: process.cwd(),
        env: opts.env as Environment,
        framework: parseFrameworkOption(opts.framework),
      });
      printWorkflow(plan, opts.json);
    });

  program
    .command('protect <connector>')
    .description('Public protect workflow (verify readiness + prepare safe execution)')
    .option('--env <env>', 'Environment (development|staging|production)', 'production')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (connector: string, opts: { env: string; framework: string; json?: boolean }) => {
      const plan = await createProtectWorkflowPlan({
        cwd: process.cwd(),
        env: opts.env as Environment,
        framework: parseFrameworkOption(opts.framework),
      });
      const planWithConnector = { ...plan, connector };
      printWorkflow(planWithConnector, opts.json);
    });

  program
    .command('dev')
    .description('Convenience: target development environment')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { framework: string; json?: boolean }) => {
      const plan = await createEnvironmentWorkflowPlan({
        cwd: process.cwd(),
        env: 'development',
        framework: parseFrameworkOption(opts.framework),
      });
      printWorkflow(plan, opts.json);
    });

  program
    .command('deploy')
    .description('Convenience: target production protect workflow')
    .option('--framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { framework: string; json?: boolean }) => {
      const plan = await createProtectWorkflowPlan({
        cwd: process.cwd(),
        env: 'production',
        framework: parseFrameworkOption(opts.framework),
      });
      printWorkflow(plan, opts.json);
    });

  program
    .command('audit')
    .description('Run readiness/audit checks (diagnostics for the public surface)')
    .option('--json', 'Output machine-readable JSON')
    .option('--probe', 'Probe Governance Hub connectivity')
    .action(async (opts: { json?: boolean; probe?: boolean }) => {
      await handlers.doctor({ json: opts.json, probe: opts.probe });
    });

  program
    .command('approve')
    .description('Finalize approvals (operator step; handled by Governance Hub in production)')
    .action(async () => {
      console.log('approve workflow is currently a product-shell placeholder.');
      console.log('Next step: use Governance Hub approval UI/API to finalize protected changes.');
      console.log('');
    });

  program
    .command('install')
    .description('DEPRECATED: legacy installer (use init/dev/deploy workflows instead)')
    .option('-f, --framework <framework>', 'Framework (django|express|supabase|auto)', 'auto')
    .option('-e, --env <env>', 'Environment (development|staging|production)', 'development')
    .option('--kernel-id <id>', '[operator-only] Kernel ID (auto-generated in dev)')
    .option('--integration <name>', '[operator-only] Integration name')
    .option('--governance-hub-url <url>', '[operator-only] Governance Hub URL (Repo B)')
    .option('--kernel-api-key <key>', '[operator-only] Kernel API key for Repo B')
    .option('--cia-url <url>', '[operator-only] Key Vault Executor URL (Repo C)')
    .option('--cia-service-key <key>', '[operator-only] Service key for Repo C')
    .option('--cia-anon-key <key>', '[operator-only] Supabase anon key for Repo C')
    .option('--skip-registration', '[operator-only] Skip kernel registration')
    .option('--base-path <path>', '[operator-only] Base path for endpoint (default: /api/manage)')
    .option('--no-migrations', '[operator-only] Code-only install (skip migration generation)')
    .option('--migrations-only', '[operator-only] Generate migrations only (skip code installation)')
    .option('--dry-run', 'Show what would be generated (no writes)')
    .action(async (opts: Record<string, unknown>) => {
      const options: InstallOptions = {
        framework: opts.framework as InstallOptions['framework'],
        env: opts.env as Environment,
        kernelId: opts.kernelId as string | undefined,
        integration: opts.integration as string | undefined,
        governanceHubUrl: opts.governanceHubUrl as string | undefined,
        kernelApiKey: opts.kernelApiKey as string | undefined,
        ciaUrl: opts.ciaUrl as string | undefined,
        ciaServiceKey: opts.ciaServiceKey as string | undefined,
        ciaAnonKey: opts.ciaAnonKey as string | undefined,
        skipRegistration: opts.skipRegistration as boolean | undefined,
        basePath: opts.basePath as string | undefined,
        noMigrations: opts.noMigrations as boolean | undefined,
        migrationsOnly: opts.migrationsOnly as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
      };
      try {
        await handlers.install(options);
      } catch (error) {
        console.error('❌ Installation failed:', error);
        process.exit(1);
      }
    });

  program
    .command('uninstall')
    .description('DEPRECATED legacy: remove control plane installation')
    .action(async () => {
      try {
        await handlers.uninstall();
      } catch (error) {
        console.error('❌ Uninstall failed:', error);
        process.exit(1);
      }
    });

  program
    .command('doctor')
    .description('DEPRECATED legacy: run installation doctor (use `echelon audit` instead)')
    .option('--json', 'Output machine-readable JSON')
    .option('--probe', 'Probe Governance Hub connectivity')
    .action(async (opts: { json?: boolean; probe?: boolean }) => {
      try {
        await handlers.doctor({ json: opts.json, probe: opts.probe });
      } catch (error) {
        console.error('❌ Doctor check failed:', error);
        process.exit(1);
      }
    });

  program
    .command('status')
    .description('Show current installation status')
    .action(async () => {
      try {
        await handlers.status();
      } catch (error) {
        console.error('❌ Status check failed:', error);
        process.exit(1);
      }
    });
}
