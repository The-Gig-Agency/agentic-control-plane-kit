/**
 * Detect Django framework
 */

import * as fs from 'fs';
import * as path from 'path';

export async function detectDjango(cwd: string): Promise<boolean> {
  // Check for manage.py (Django's main entrypoint)
  const managePy = path.join(cwd, 'manage.py');
  if (fs.existsSync(managePy)) {
    return true;
  }

  // Check for backend/manage.py (common structure)
  const backendManagePy = path.join(cwd, 'backend', 'manage.py');
  if (fs.existsSync(backendManagePy)) {
    return true;
  }

  // Check for requirements.txt with Django
  const requirementsTxt = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(requirementsTxt)) {
    const content = fs.readFileSync(requirementsTxt, 'utf-8');
    if (content.includes('django') || content.includes('Django')) {
      return true;
    }
  }

  // Check for backend/requirements/base.txt (common Django structure)
  const backendRequirements = path.join(cwd, 'backend', 'requirements', 'base.txt');
  if (fs.existsSync(backendRequirements)) {
    const content = fs.readFileSync(backendRequirements, 'utf-8');
    if (content.includes('django') || content.includes('Django')) {
      return true;
    }
  }

  return false;
}
