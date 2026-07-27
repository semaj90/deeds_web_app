import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function resolveRuntimeEnvRoots(cwd = process.cwd()) {
  const normalized = path.resolve(cwd);
  const base = path.basename(normalized).toLowerCase();

  if (base === 'sveltekit-frontend') {
    return {
      workspaceRoot: path.resolve(normalized, '..'),
      projectRoot: normalized,
    };
  }

  const nestedProjectRoot = path.join(normalized, 'sveltekit-frontend');
  if (fs.existsSync(nestedProjectRoot) && fs.statSync(nestedProjectRoot).isDirectory()) {
    return {
      workspaceRoot: normalized,
      projectRoot: nestedProjectRoot,
    };
  }

  return {
    workspaceRoot: normalized,
    projectRoot: normalized,
  };
}

export function loadRuntimeEnv(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? (process.env.NODE_ENV === 'production' ? 'process' : 'development');

  if (mode !== 'development') {
    return resolveRuntimeEnvRoots(cwd);
  }

  const roots = resolveRuntimeEnvRoots(cwd);
  const envFiles = [
    path.join(roots.workspaceRoot, '.env'),
    path.join(roots.workspaceRoot, '.env.local'),
    path.join(roots.projectRoot, '.env'),
    path.join(roots.projectRoot, '.env.local'),
  ];

  for (const filePath of envFiles) {
    loadEnvFile(filePath);
  }

  return roots;
}
