import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * log-developer-activity.mjs
 *
 * Logs recent file modifications and exported symbols to a structured JSONL log.
 * Uses 'rg' (ripgrep) and 'awk' (GNU Awk) for high-performance extraction.
 *
 * This log is consumed by the 'context.prefetch_feature_context' tool to
 * steer retrieval relevance based on real-time developer activity.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = execSync('git rev-parse --show-toplevel', {
  cwd: PACKAGE_ROOT,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
}).trim();
const TARGET_PREFIX = 'sveltekit-frontend';
const LOG_DIR = join(PACKAGE_ROOT, 'logs', 'activity');
const LOG_FILE = join(LOG_DIR, 'user.activity.jsonl');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function runGit(command) {
  return execSync(command, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

function collectModifiedFiles() {
  const modifiedFiles = new Set();

  const statusOutput = runGit(`git status --porcelain --untracked-files=all -- ${TARGET_PREFIX}`);
  for (const line of statusOutput.split('\n')) {
    if (!line.trim()) continue;

    const rawPath = line.slice(3).trim();
    if (!rawPath) continue;

    const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1).trim() : rawPath;
    if (filePath) modifiedFiles.add(filePath.replace(/\\/g, '/'));
  }

  if (modifiedFiles.size === 0) {
    const diffOutput = runGit(`git diff --name-only --diff-filter=ACMR -- ${TARGET_PREFIX}`);
    for (const line of diffOutput.split('\n')) {
      const filePath = line.trim();
      if (filePath) modifiedFiles.add(filePath.replace(/\\/g, '/'));
    }
  }

  return Array.from(modifiedFiles);
}

function isCodeFile(filePath) {
  if (filePath.endsWith('.svelte')) return true;

  const extension = extname(filePath).toLowerCase();
  return CODE_EXTENSIONS.has(extension);
}

function extractSymbols(absoluteFile) {
  if (!isCodeFile(absoluteFile)) return [];

  try {
    const rgCmd = `rg -o --no-heading --color never --pcre2 "^(?:export\\s+)?(?:const|function|class|type|interface|enum)\\s+[A-Za-z_$][\\w$]*" "${absoluteFile}" | awk '{print $NF}'`;
    return execSync(rgCmd, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
      .toString()
      .split('\n')
      .map((symbol) => symbol.trim())
      .filter((symbol) => symbol.length > 1);
  } catch {
    return [];
  }
}

async function run() {
  try {
    const modifiedFiles = collectModifiedFiles();

    if (modifiedFiles.length === 0) return;

    for (const file of modifiedFiles) {
      const absoluteFile = resolve(REPO_ROOT, file);
      if (!existsSync(absoluteFile)) continue;

      const symbols = extractSymbols(absoluteFile);

      // 3. Log the activity entry
      const entry = {
        timestamp: new Date().toISOString(),
        event: 'file_edit',
        filePath: file,
        symbols: Array.from(new Set(symbols)),
        lane: 'activity-tracker',
      };

      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    }

    console.log(`[activity] Logged activity for ${modifiedFiles.length} files.`);
  } catch (err) {
    console.error('[activity] Error logging developer activity:', err.message);
  }
}

run();
