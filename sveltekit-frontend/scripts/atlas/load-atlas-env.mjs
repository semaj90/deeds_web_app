#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

export function loadAtlasEnv(baseDir = process.cwd()) {
  const seen = new Set();
  const searchRoots = [baseDir, resolve(baseDir, '..')];
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];

  for (const root of searchRoots) {
    for (const envFile of envFiles) {
      const envPath = resolve(root, envFile);
      if (seen.has(envPath) || !existsSync(envPath)) continue;
      seen.add(envPath);
      loadEnv({ path: envPath, override: false });
    }
  }

  return {
    loadedFiles: [...seen],
  };
}
