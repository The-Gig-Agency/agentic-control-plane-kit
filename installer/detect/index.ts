/**
 * Framework Detection
 * 
 * Automatically detects which framework the target SaaS is using.
 * This allows the installer to choose the correct installation path.
 */

import { detectDjango } from './detect-django.js';
import { detectExpress } from './detect-express.js';
import { detectSupabase } from './detect-supabase.js';
import { detectHybridNetlifySupabase } from './detect-hybrid-netlify-supabase.js';
import { detectNetlify } from './detect-netlify.js';

export type Framework = 'django' | 'express' | 'supabase' | 'hybrid_netlify_supabase' | null;

export interface RepoClassification {
  framework: Framework;
  topology: string;
  recommendedTarget: string;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

/**
 * Classify repo topology for installer target selection (TGA-189).
 *
 * **Precedence:** Django is evaluated first. A monorepo with `manage.py` plus Netlify/Supabase
 * artifacts is classified as `django` (backend-owned control plane). To force the hybrid
 * Netlify surface, pass `--framework hybrid_netlify_supabase`.
 */
export async function classifyRepo(cwd: string = process.cwd()): Promise<RepoClassification> {
  const signals: string[] = [];
  const django = await detectDjango(cwd);
  if (django) signals.push('django');
  const netlify = detectNetlify(cwd);
  if (netlify) signals.push('netlify');
  const supabase = await detectSupabase(cwd);
  if (supabase) signals.push('supabase');
  const express = await detectExpress(cwd);
  if (express) signals.push('express');

  if (django) {
    return {
      framework: 'django',
      topology: 'django_monolith',
      recommendedTarget: 'django',
      confidence: netlify || supabase ? 'medium' : 'high',
      signals,
    };
  }

  if (await detectHybridNetlifySupabase(cwd)) {
    return {
      framework: 'hybrid_netlify_supabase',
      topology: 'netlify_serverless_plus_supabase',
      recommendedTarget: 'hybrid_netlify_supabase',
      confidence: 'high',
      signals,
    };
  }

  if (express) {
    return {
      framework: 'express',
      topology: 'nodejs_server',
      recommendedTarget: 'express',
      confidence: 'high',
      signals,
    };
  }

  if (supabase) {
    return {
      framework: 'supabase',
      topology: 'supabase_edge',
      recommendedTarget: 'supabase',
      confidence: 'high',
      signals,
    };
  }

  return {
    framework: null,
    topology: 'unknown',
    recommendedTarget: 'manual',
    confidence: signals.length ? 'low' : 'low',
    signals,
  };
}

export async function detectFramework(cwd: string = process.cwd()): Promise<Framework> {
  const { framework } = await classifyRepo(cwd);
  return framework;
}
