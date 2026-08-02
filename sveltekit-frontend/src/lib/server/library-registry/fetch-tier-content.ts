import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { resolveLibraryIdentity } from './resolve-library-identity.js';
import type { LibraryTier, TierFileEntry } from './types.js';

const EXCLUDED_DIR_NAMES = new Set(['dist', '.cache', '__pycache__', 'node_modules']);
const EXCLUDED_FILE_PATTERNS = [/\.map$/, /\.min\.js$/, /\.node$/, /\.wasm$/, /\.so$/, /\.dll$/, /\.pyc$/];

const TIER3_MAX_FILES = 200;
const TIER3_MAX_DEPTH = 2;
const TIER4_MAX_FILES = 5000;

function isExcludedFile(name: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some((re) => re.test(name));
}

function walk(dir: string, maxDepth: number, maxFiles: number, allowNestedNodeModules = false, depth = 0, out: string[] = []): string[] {
  if (out.length >= maxFiles || depth > maxDepth || !existsSync(dir)) return out;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= maxFiles) break;
    // "duplicate nested dependencies" exclusion — only the top-level package's own
    // files matter for tier 3/4; nested node_modules are someone else's package.
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name) && !(allowNestedNodeModules && entry.name === 'node_modules')) continue;
      walk(path.join(dir, entry.name), maxDepth, maxFiles, allowNestedNodeModules, depth + 1, out);
    } else if (!isExcludedFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Resolves Tier 3 (bounded, depth-limited implementation subset) or
 * Tier 4 (full walk) content for a package, applying the exclude-by-default
 * list: dist bundles, source maps, minified code, binary assets, duplicate
 * nested dependencies, generated caches. Explicit-request-only — never
 * called from the bulk scan.
 */
export async function fetchTier(address: string, tier: LibraryTier): Promise<TierFileEntry[]> {
  if (tier < 3) {
    throw new Error('fetchTier only resolves tier 3/4 content; tier 1/2 come from resolveLibraryIdentity()');
  }
  const identity = await resolveLibraryIdentity(address);
  if (!identity) return [];
  if (!existsSync(identity.installationPath) || !statSync(identity.installationPath).isDirectory()) return [];

  const files =
    tier === 3
      ? walk(identity.installationPath, TIER3_MAX_DEPTH, TIER3_MAX_FILES)
      : walk(identity.installationPath, Infinity, TIER4_MAX_FILES);

  return files.map((filePath) => {
    const entry: TierFileEntry = { path: filePath };
    // Tier 3 includes content (bounded file count keeps this safe); tier 4 is
    // paths-only given its unbounded size — content fetch there is a follow-up
    // per-file call, not part of this bulk response.
    if (tier === 3) {
      try {
        entry.content = readFileSync(filePath, 'utf8');
      } catch {
        // binary/unreadable — leave content undefined, path still reported
      }
    }
    return entry;
  });
}
