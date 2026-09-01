#!/usr/bin/env node

/**
 * Read-only hierarchical AGENTS.md coverage audit.
 *
 * Unlike the legacy directory-signal scanner, this resolves the instruction
 * file that actually applies to every visible repository file by walking its
 * parent directories. It does not parse, modify, ingest, or execute guidance.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = path.join(ROOT, 'docs/reports/agents-coverage-audit-v1.json');
const SKIP = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build', '.cache', '.tmp']);
const ENUMERATION_MAX_BUFFER = 128 * 1024 * 1024;

const normalize = (value) => value.split(path.sep).join('/');
const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

async function visibleFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, windowsHide: true, maxBuffer: ENUMERATION_MAX_BUFFER });
  return stdout.split('\0').filter(Boolean).map(normalize).filter((file) => !file.split('/').some((part) => SKIP.has(part)));
}

async function instructionFiles() {
  const { stdout } = await execFileAsync('rg', ['--files', '-uu', '-g', 'AGENTS.md', '-g', '!**/.git/**', '-g', '!**/node_modules/**'], { cwd: ROOT, windowsHide: true, maxBuffer: ENUMERATION_MAX_BUFFER });
  return stdout.split(/\r?\n/).filter(Boolean).map(normalize).sort();
}

function nearestAgent(file, agents) {
  let directory = path.posix.dirname(file);
  while (directory && directory !== '.') {
    const candidate = `${directory}/AGENTS.md`;
    if (agents.includes(candidate)) return candidate;
    directory = path.posix.dirname(directory);
  }
  return agents.includes('AGENTS.md') ? 'AGENTS.md' : null;
}

async function main() {
  const [files, agents] = await Promise.all([visibleFiles(), instructionFiles()]);
  const assignments = new Map();
  const uncovered = [];
  for (const file of files) {
    const owner = nearestAgent(file, agents);
    if (!owner) uncovered.push(file);
    else assignments.set(owner, (assignments.get(owner) ?? 0) + 1);
  }

  const coverage = {
    totalVisibleFiles: files.length,
    coveredFiles: files.length - uncovered.length,
    uncoveredFiles: uncovered.length,
    percentage: files.length ? Number(((files.length - uncovered.length) / files.length * 100).toFixed(2)) : 100,
  };
  const assignmentCounts = Object.fromEntries([...assignments.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const body = {
    schema: 'atlas.agents-coverage-audit.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    resolution: 'nearest-parent-AGENTS.md',
    instructionFiles: agents,
    coverage,
    assignmentCounts,
    uncoveredFiles: uncovered.sort(),
  };
  const report = { ...body, checksum: `sha256:${sha256(body)}` };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: uncovered.length ? 'AGENTS_COVERAGE_PARTIAL' : 'AGENTS_COVERAGE_PROVEN', instructionFiles: agents.length, ...coverage, reportPath: normalize(path.relative(ROOT, REPORT)) }, null, 2));
  if (uncovered.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
