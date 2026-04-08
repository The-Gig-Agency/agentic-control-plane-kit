/**
 * Discovery corpus metadata (TGA-189).
 * Fixtures live under installer/detect/corpus/<id>/.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CorpusExpected {
  framework: string;
  topology: string;
  recommendedTarget: string;
  minConfidence: 'high' | 'medium' | 'low';
}

export interface CorpusEntry {
  id: string;
  description: string;
  expected: CorpusExpected;
  requiredPaths: string[];
}

export function getCorpusFixtureDir(fixtureId: string): string {
  return path.join(__dirname, 'corpus', fixtureId);
}

export function loadCorpusEntry(fixtureId: string): CorpusEntry {
  const dir = getCorpusFixtureDir(fixtureId);
  const metaPath = path.join(dir, 'corpus.json');
  const raw = fs.readFileSync(metaPath, 'utf-8');
  return JSON.parse(raw) as CorpusEntry;
}

export function assertCorpusPathsExist(fixtureId: string): void {
  const entry = loadCorpusEntry(fixtureId);
  const root = getCorpusFixtureDir(fixtureId);
  for (const rel of entry.requiredPaths) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
      throw new Error(`Corpus ${fixtureId} missing required path: ${rel}`);
    }
  }
}
