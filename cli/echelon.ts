#!/usr/bin/env node
/**
 * Echelon CLI - Published entrypoint
 *
 * Usage:
 *   npx echelon install
 *   npx echelon doctor --json
 *   npx echelon uninstall
 *
 * Delegates to installer CLI (commander-based).
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runCli, install } from '../installer/cli.js';
import { uninstall } from '../installer/uninstall.js';
import { doctor } from '../installer/doctor.js';
import { status } from '../installer/status.js';

// Re-export for direct import
export { install, uninstall, doctor, status };

// Run when invoked directly (cross-platform)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  runCli();
}
