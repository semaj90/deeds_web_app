#!/usr/bin/env node
/**
 * 10-Layer Import Audit CLI
 *
 * Comprehensive orphan detection using all 10 dependency pattern layers.
 * Wraps the PowerShell script with a cross-platform Node.js interface.
 *
 * Usage:
 *   node scripts/10-layer-audit-cli.mjs                           # Interactive mode
 *   node scripts/10-layer-audit-cli.mjs --module AnalysisPanel    # Single module
 *   node scripts/10-layer-audit-cli.mjs --orphan-scan             # Scan all components
 *   node scripts/10-layer-audit-cli.mjs --module webgpu --full    # All 10 layers
 *   node scripts/10-layer-audit-cli.mjs --json                    # JSON output
 *
 * Layers:
 *   L1: Static ESM        from './Component'
 *   L2: Dynamic ESM       await import('./Component')
 *   L3: CJS require       require('./Component')
 *   L4: @vite-ignore      Variable dynamic imports
 *   L5: SvelteKit routes  +page.svelte auto-discovery
 *   L6: fetch() wiring    Client-side API fetch calls
 *   L7: Registry maps     String-keyed component lookups
 *   L8: Barrel exports    Re-export chains via index.ts
 *   L9: Event coupling    CustomEvent/addEventListener
 *   L10: Store subs       .svelte.ts store consumers
 */

import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const SCRIPT_PATH = join(projectRoot, 'scripts', 'audit-9layer-imports.ps1');
const DEFAULT_DIR = 'sveltekit-frontend/src';

// ─────────────────────────────────────────────────────────────────────
// Command Line Parser
// ─────────────────────────────────────────────────────────────────────

function parseArgs(args) {
  const options = {
    module: null,
    orphanScan: false,
    full: false,
    directory: DEFAULT_DIR,
    json: false,
    help: false,
    interactive: args.length === 0,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--module':
      case '-m':
        options.module = args[++i];
        options.interactive = false;
        break;
      case '--orphan-scan':
      case '-o':
        options.orphanScan = true;
        options.interactive = false;
        break;
      case '--full':
      case '-f':
        options.full = true;
        break;
      case '--directory':
      case '-d':
        options.directory = args[++i];
        break;
      case '--json':
      case '-j':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        options.interactive = false;
        break;
    }
  }

  return options;
}

// ─────────────────────────────────────────────────────────────────────
// PowerShell Script Executor
// ─────────────────────────────────────────────────────────────────────

function runAudit(options) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT_PATH,
  ];

  if (options.module) {
    args.push('-Module', options.module);
  }

  if (options.orphanScan) {
    args.push('-OrphanScan');
  }

  if (options.full) {
    args.push('-Full');
  }

  if (options.directory !== DEFAULT_DIR) {
    args.push('-Directory', options.directory);
  }

  try {
    const output = execSync(`pwsh ${args.join(' ')}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: options.json ? 'pipe' : 'inherit',
    });

    if (options.json) {
      return parseOutputToJSON(output);
    }

    return output;
  } catch (error) {
    if (!options.json) {
      console.error('Error running audit:', error.message);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────
// JSON Output Parser (for API integration)
// ─────────────────────────────────────────────────────────────────────

function parseOutputToJSON(output) {
  const lines = output.split('\n');
  const result = {
    module: null,
    layers: {},
    totalReferences: 0,
    isOrphan: false,
    consumers: [],
    orphans: [],
  };

  let currentSection = null;

  for (const line of lines) {
    // Extract module name
    if (line.includes('Auditing:')) {
      result.module = line.split('Auditing:')[1]?.trim();
    }

    // Parse layer results
    const layerMatch = line.match(/\[([\+\-\~])\] (L\d+[^\:]+)\s*:\s*([^\(]+)\((\d+) hits?\)/);
    if (layerMatch) {
      const [, status, layer, description, count] = layerMatch;
      const layerNum = layer.match(/L(\d+)/)?.[1];
      result.layers[`L${layerNum}`] = {
        name: layer.trim(),
        description: description.trim(),
        count: parseInt(count, 10),
        found: status === '+',
      };
      result.totalReferences += parseInt(count, 10);
    }

    // Extract result
    if (line.includes('RESULT:')) {
      result.isOrphan = line.includes('ORPHAN CANDIDATE');
    }

    // Extract consumers
    if (line.trim().startsWith('•')) {
      result.consumers.push(line.trim().substring(1).trim());
    }

    // Extract orphan list
    if (line.trim().startsWith('✗')) {
      result.orphans.push(line.trim().substring(1).trim());
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Interactive Mode
// ─────────────────────────────────────────────────────────────────────

async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  10-Layer Import Audit — Interactive Mode                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Options:');
  console.log('  1. Audit single module');
  console.log('  2. Scan all components for orphans');
  console.log('  3. Full 10-layer scan (single module)');
  console.log('  4. Exit\n');

  const choice = await question('Select option (1-4): ');

  switch (choice.trim()) {
    case '1': {
      const module = await question('Module name: ');
      runAudit({ module, orphanScan: false, full: false });
      break;
    }
    case '2': {
      runAudit({ module: null, orphanScan: true, full: false });
      break;
    }
    case '3': {
      const module = await question('Module name: ');
      runAudit({ module, orphanScan: false, full: true });
      break;
    }
    case '4':
    default:
      console.log('Exiting...');
      break;
  }

  rl.close();
}

// ─────────────────────────────────────────────────────────────────────
// Help Text
// ─────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
10-Layer Import Audit CLI

Usage:
  node scripts/10-layer-audit-cli.mjs [options]

Options:
  --module <name>, -m       Audit a specific module/component
  --orphan-scan, -o         Scan all components for orphans
  --full, -f                Run all 10 layers (default: L1-L4 + L8-L9)
  --directory <dir>, -d     Source directory (default: sveltekit-frontend/src)
  --json, -j                Output results as JSON
  --help, -h                Show this help message

Layers:
  L1  Static ESM           import { X } from './Component'
  L2  Dynamic ESM          await import('./Component')
  L3  CJS require          require('./Component')
  L4  @vite-ignore         Variable dynamic imports (CRITICAL)
  L5  SvelteKit routes     +page.svelte auto-discovery
  L6  fetch() wiring       Client-side API fetch calls
  L7  Registry maps        String-keyed component lookups
  L8  Barrel exports       Re-export chains via index.ts
  L9  Event coupling       CustomEvent/addEventListener (HIGH RISK)
  L10 Store subs           .svelte.ts store consumers

Examples:
  # Audit a single component
  node scripts/10-layer-audit-cli.mjs --module AnalysisPanel

  # Scan all components for orphans
  node scripts/10-layer-audit-cli.mjs --orphan-scan

  # Full 10-layer audit
  node scripts/10-layer-audit-cli.mjs --module webgpu --full

  # JSON output (for API integration)
  node scripts/10-layer-audit-cli.mjs --module tts --json

  # Interactive mode
  node scripts/10-layer-audit-cli.mjs
`);
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.interactive) {
    await interactiveMode();
  } else {
    const result = runAudit(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
