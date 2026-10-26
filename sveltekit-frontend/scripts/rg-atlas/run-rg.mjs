/**
 * Stage 1 — rg lexical sweep
 * Wraps rg exec + parses output → RgHit[]
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

/**
 * @typedef {Object} RgHit
 * @property {string} file
 * @property {number} line
 * @property {string} snippet
 * @property {number} lineNumber
 */

const execFileAsync = promisify(execFile);

function buildSearchPaths(paths) {
  const root = process.cwd();
  return paths
    .map((p) => resolve(root, p))
    .filter((p) => (p === root || p.startsWith(root + sep)) && existsSync(p));
}

function parseRgOutput(output) {
  const hits = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const hasDriveLetter = /^[A-Za-z]:[\\/]/.test(line);
    const fileStart = hasDriveLetter ? 2 : 0;
    const firstColon = line.indexOf(':', fileStart);
    const secondColon = firstColon > 0 ? line.indexOf(':', firstColon + 1) : -1;
    const thirdColon = secondColon > 0 ? line.indexOf(':', secondColon + 1) : -1;

    if (firstColon < 0 || secondColon < 0 || thirdColon < 0) continue;

    const file = line.slice(0, firstColon);
    const lineNum = line.slice(firstColon + 1, secondColon);
    const colNum = line.slice(secondColon + 1, thirdColon);
    const snippet = line.slice(thirdColon + 1);

    hits.push({
      file: file,
      line: parseInt(lineNum, 10),
      lineNumber: parseInt(lineNum, 10),
      snippet: snippet.trim(),
    });
  }

  return hits;
}

/**
 * Executes ripgrep and returns structured hits.
 * @param {string} query
 * @param {string[]} paths
 * @param {{includeGitignored?: boolean}} [options]
 * @returns {RgHit[]}
 */
export function runRg(query, paths = ['src'], options = {}) {
  const searchPaths = buildSearchPaths(paths);

  if (searchPaths.length === 0) return [];

  try {
    const ignoreFlags = options.includeGitignored ? ['--no-ignore', '--hidden'] : [];
    const args = ['-n', '--column', '--no-heading', '--color', 'never', ...ignoreFlags, query, ...searchPaths];
    const output = execFileSync('rg', args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      windowsHide: true,
    });

    return parseRgOutput(output);
  } catch (err) {
    const exitCode =
      typeof err?.code === 'number'
        ? err.code
        : typeof err?.status === 'number'
          ? err.status
          : null;
    if (exitCode !== 1) {
      console.error('[run-rg] Error:', err?.message ?? String(err));
    }
  }

  return [];
}

/**
 * Async ripgrep variant for parallel retrieval lanes.
 * @param {string} query
 * @param {string[]} paths
 * @param {{includeGitignored?: boolean}} [options]
 * @returns {Promise<RgHit[]>}
 */
export async function runRgAsync(query, paths = ['src'], options = {}) {
  const searchPaths = buildSearchPaths(paths);

  if (searchPaths.length === 0) return [];

  try {
    const ignoreFlags = options.includeGitignored ? ['--no-ignore', '--hidden'] : [];
    const { stdout } = await execFileAsync(
      'rg',
      ['-n', '--column', '--no-heading', '--color', 'never', ...ignoreFlags, query, ...searchPaths],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true,
      }
    );

    return parseRgOutput(stdout);
  } catch (err) {
    const exitCode =
      typeof err?.code === 'number'
        ? err.code
        : typeof err?.status === 'number'
          ? err.status
          : null;
    if (exitCode !== 1) {
      console.error('[run-rg] Error:', err?.message ?? String(err));
    }
  }

  return [];
}
