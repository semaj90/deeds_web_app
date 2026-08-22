import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { readFileSync } from 'node:fs';

export interface ScannerConfig {
  rootPath: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  maxDepth?: number;
  followSymlinks?: boolean;
  gitIgnoreMode?: 'strict' | 'loose' | 'off';
}

export interface FileEntry {
  absolutePath: string;
  relativePath: string;
  language: 'ts' | 'tsx' | 'js' | 'jsx' | 'mjs' | 'py' | 'go' | 'rs' | 'unknown';
  size: number;
  mtime: Date;
}

const EXTENSION_TO_LANGUAGE = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'mjs',
  '.py': 'py',
  '.go': 'go',
  '.rs': 'rs',
} as const;

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.svelte-kit',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
  'target',
  '.github',
  '.vscode',
  '.idea',
  '.pytest_cache',
  '.cache',
  'coverage',
  '.DS_Store',
];

/**
 * Infer language from file extension.
 */
function inferLanguage(filePath: string): FileEntry['language'] {
  const ext = extname(filePath).toLowerCase();
  return (EXTENSION_TO_LANGUAGE[ext as keyof typeof EXTENSION_TO_LANGUAGE] ?? 'unknown') as FileEntry['language'];
}

/**
 * Check if a path should be ignored based on patterns.
 * Simple glob-like matching (not full .gitignore spec).
 */
function shouldIgnore(relativePath: string, excludePatterns: string[], includePatterns?: string[]): boolean {
  const pathParts = relativePath.split(/[/\\]/);

  // Check include patterns first (explicit inclusion overrides exclusion)
  if (includePatterns && includePatterns.length > 0) {
    for (const pattern of includePatterns) {
      if (matchPattern(relativePath, pattern) || matchPattern(pathParts[0], pattern)) {
        return false; // Explicitly included, do not ignore
      }
    }
  }

  // Check exclude patterns
  for (const pattern of excludePatterns) {
    // Match against any path component (directory or file)
    if (matchPattern(relativePath, pattern) || pathParts.some(part => matchPattern(part, pattern))) {
      return true; // Should ignore
    }
  }

  return false;
}

/**
 * Simple pattern matching (supports * wildcard).
 */
function matchPattern(str: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === str) return true;

  // Support *suffix and prefix* patterns
  if (pattern.startsWith('*') && str.endsWith(pattern.slice(1))) return true;
  if (pattern.endsWith('*') && str.startsWith(pattern.slice(0, -1))) return true;

  return false;
}

/**
 * Check if path is a file we should include (code-like extensions).
 */
function isCodeFile(filePath: string): boolean {
  const lang = inferLanguage(filePath);
  return lang !== 'unknown';
}

/**
 * Load .gitignore from rootPath (if it exists) and parse patterns.
 */
function loadGitIgnorePatterns(rootPath: string): string[] {
  try {
    const gitignorePath = resolve(rootPath, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
      .map(line => line.replace(/\/$/, '')); // Remove trailing /
  } catch {
    return [];
  }
}

/**
 * Recursively scan a directory and yield file entries.
 *
 * @param config Scanner configuration
 * @yields FileEntry for each code file found
 */
export async function* scanDirectory(config: ScannerConfig): AsyncGenerator<FileEntry> {
  const rootPath = resolve(config.rootPath);
  const maxDepth = config.maxDepth ?? 50;
  const gitIgnoreModeOff = config.gitIgnoreMode === 'off';

  let excludePatterns = config.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;

  // Merge .gitignore patterns if not in 'off' mode
  if (!gitIgnoreModeOff) {
    const gitIgnorePatterns = loadGitIgnorePatterns(rootPath);
    excludePatterns = [...excludePatterns, ...gitIgnorePatterns];
  }

  const includePatterns = config.includePatterns ?? [];

  /**
   * Inner async generator for recursive walking.
   */
  async function* walk(dirPath: string, depth: number): AsyncGenerator<FileEntry> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      const absolutePath = resolve(dirPath, entry.name);
      const relativePath = relative(rootPath, absolutePath);

      // Check if should ignore
      if (shouldIgnore(relativePath, excludePatterns, includePatterns)) {
        continue;
      }

      if (entry.isSymbolicLink() && !config.followSymlinks) {
        continue;
      }

      if (entry.isDirectory()) {
        yield* walk(absolutePath, depth + 1);
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        try {
          const stats = await stat(absolutePath);
          yield {
            absolutePath,
            relativePath,
            language: inferLanguage(entry.name),
            size: stats.size,
            mtime: stats.mtime,
          };
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  yield* walk(rootPath, 0);
}

/**
 * Scan a directory and collect all files into an array.
 * Convenience wrapper around scanDirectory generator.
 */
export async function scanDirectorySync(config: ScannerConfig): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  for await (const file of scanDirectory(config)) {
    files.push(file);
  }
  return files;
}
