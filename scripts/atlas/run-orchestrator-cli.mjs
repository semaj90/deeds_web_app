#!/usr/bin/env npx tsx
/**
 * CLI entry point for Python Orchestrator
 *
 * Usage:
 *   npx tsx scripts/atlas/run-orchestrator-cli.mjs --stage=phase4 --limit=10000 --dry-run
 *   npx tsx scripts/atlas/run-orchestrator-cli.mjs --help
 */

import { parseArgs } from 'util';
import { runOrchestrationStage } from './python-orchestrator.mjs';

const options = {
  stage: { type: 'string', description: 'Stage identifier (e.g., phase4-model, feature-extraction)' },
  limit: { type: 'string', description: 'Batch size limit (default: 10000)' },
  'dry-run': { type: 'boolean', description: 'Dry run mode (no DB writes)', default: false },
  'python-script': { type: 'string', description: 'Path to Python script (relative to scripts/atlas/)' },
  help: { type: 'boolean', description: 'Show this help message', short: 'h' },
};

const { values, positionals } = parseArgs({ options, allowPositionals: true });

if (values.help) {
  console.log(`
Usage: npx tsx scripts/atlas/run-orchestrator-cli.mjs [options]

Options:
  --stage              Stage identifier (required)
  --limit              Batch size limit (default: 10000)
  --dry-run            Run without DB writes (default: false)
  --python-script      Path to Python script (relative to scripts/atlas/)
  -h, --help           Show this help message

Examples:
  npx tsx scripts/atlas/run-orchestrator-cli.mjs --stage=phase4 --limit=1000 --dry-run
  npx tsx scripts/atlas/run-orchestrator-cli.mjs --stage=feature-extract --limit=50000
  `);
  process.exit(0);
}

if (!values.stage) {
  console.error('Error: --stage is required');
  process.exit(1);
}

const stageName = values.stage;
const limit = parseInt(values.limit ?? '10000', 10);
const isDryRun = values['dry-run'] ?? false;
const options_obj = values['python-script'] ? { pythonScript: values['python-script'] } : {};

console.log(`
[CLI] Starting Orchestrator
  Stage: ${stageName}
  Limit: ${limit}
  Dry Run: ${isDryRun}
  Python Script: ${options_obj.pythonScript || 'phase4-model-inference.py'}
`);

try {
  const result = await runOrchestrationStage(stageName, limit, isDryRun, options_obj);

  console.log(`\n[SUCCESS] Orchestration completed`);
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
} catch (error) {
  console.error(`\n[ERROR] Orchestration failed:`, error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
