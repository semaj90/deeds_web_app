#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDomainClassifierHoldoutV1 } from './lib/domain-classifier-evaluation-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(args) {
  const options = {};
  for (const argument of args) {
    const match = argument.match(/^--(input|report)=(.+)$/);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function resolveRepoPath(relativePath, label) {
  const resolved = path.resolve(repoRoot, relativePath);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return resolved;
}

function printUsage() {
  process.stdout.write([
    'Domain classifier holdout evaluator (read-only)',
    'Usage: node scripts/atlas/evaluate-domain-classifier-holdout-v1.mjs --input=<repo-relative-json> [--report=docs/reports/<file>.json]',
    'Input must be a frozen atlas.domain-classifier-holdout.v1 cohort with independently reviewed labels, exact checkpoint provenance, complete training membership, evidence refs, and full NB/LR probability maps.',
    'No database, vector index, model, or cache writes are performed.',
  ].join('\n') + '\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) {
    printUsage();
    process.stdout.write(JSON.stringify({ status: 'BLOCKED_INPUT_REQUIRED', canonicalAuthority: false, writesPerformed: false }) + '\n');
    process.exitCode = 2;
  } else {
    const inputPath = resolveRepoPath(options.input, 'Input');
    const input = JSON.parse(readFileSync(inputPath, 'utf8'));
    const result = evaluateDomainClassifierHoldoutV1(input);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(output);
    if (options.report) {
      const reportPath = resolveRepoPath(options.report, 'Report');
      const reportsRoot = path.join(repoRoot, 'docs', 'reports') + path.sep;
      if (!reportPath.startsWith(reportsRoot)) {
        throw new Error('Report must be a new or existing file under docs/reports');
      }
      writeFileSync(reportPath, output, { flag: 'wx' });
      process.stderr.write(`Diagnostic report: ${path.relative(repoRoot, reportPath)}\n`);
    }
    if (result.status !== 'DIAGNOSTIC_EVALUATION_COMPLETE') process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
