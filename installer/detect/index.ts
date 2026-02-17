/**
 * Framework Detection
 * 
 * Automatically detects which framework the target SaaS is using.
 * This allows the installer to choose the correct installation path.
 */

import { detectDjango } from './detect-django.js';
import { detectExpress } from './detect-express.js';
import { detectSupabase } from './detect-supabase.js';
import * as fs from 'fs';
import * as path from 'path';

export type Framework = 'django' | 'express' | 'supabase' | null;

export async function detectFramework(cwd: string = process.cwd()): Promise<Framework> {
  // Check for Django
  if (await detectDjango(cwd)) {
    return 'django';
  }

  // Check for Express/Node.js
  if (await detectExpress(cwd)) {
    return 'express';
  }

  // Check for Supabase
  if (await detectSupabase(cwd)) {
    return 'supabase';
  }

  return null;
}
