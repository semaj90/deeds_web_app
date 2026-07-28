import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AtlasDuckDBConfig {
  databasePath: string;
  threads: number;
  memoryLimit: string;
  tempDirectory: string;
  readOnly: boolean;
}

function parsePositiveInteger(
  value: string | undefined
): number | null {
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

/** Resolve project root (works regardless of working directory) */
function getProjectRoot(): string {
  // If explicitly set, use it
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  // Try to find it by traversing up from this file
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (current.endsWith('atlas-duckdb')) {
      // We're in packages/atlas-duckdb, go up to root
      return path.join(current, '..', '..');
    }
    current = path.dirname(current);
    if (current === '/' || current === 'C:\\') break;
  }

  // Fallback: assume current working directory is project root
  return process.cwd();
}

export function resolveDuckDBConfig(
  overrides: Partial<AtlasDuckDBConfig> = {}
): AtlasDuckDBConfig {
  const logicalCores = os.availableParallelism();

  const configuredThreads =
    parsePositiveInteger(process.env.ATLAS_DUCKDB_THREADS);

  const defaultThreads = Math.max(
    2,
    Math.floor(logicalCores / 2)
  );

  const projectRoot = getProjectRoot();
  const defaultDbPath = path.join(projectRoot, 'data/atlas-ml/atlas-analytics.duckdb');
  const defaultTempDir = path.join(projectRoot, 'data/atlas-ml/tmp');

  return {
    databasePath:
      overrides.databasePath ??
      process.env.ATLAS_DUCKDB_PATH ??
      defaultDbPath,

    threads:
      overrides.threads ??
      configuredThreads ??
      defaultThreads,

    memoryLimit:
      overrides.memoryLimit ??
      process.env.ATLAS_DUCKDB_MEMORY_LIMIT ??
      '4GB',

    tempDirectory:
      overrides.tempDirectory ??
      process.env.ATLAS_DUCKDB_TEMP_DIR ??
      defaultTempDir,

    readOnly:
      overrides.readOnly ?? false
  };
}
