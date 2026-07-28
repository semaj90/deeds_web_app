#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SVELTEKIT_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(SVELTEKIT_ROOT, '..');

export function alignCwdToRepoRoot() {
  if (process.cwd() !== REPO_ROOT) {
    process.chdir(REPO_ROOT);
  }
  return REPO_ROOT;
}
