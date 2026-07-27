#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const DEFAULT_FILES = [
  '.env',
  '.env.local',
  'sveltekit-frontend/.env',
  'sveltekit-frontend/.env.local',
];

const PRIMARY_DISCOVERY_FILES = [
  '.env',
  '.env.local',
  '.env.example',
  '.env.local.example',
  '.env.sample',
  'sveltekit-frontend/.env',
  'sveltekit-frontend/.env.local',
  'sveltekit-frontend/.env.example',
  'sveltekit-frontend/.env.local.example',
];

const DEFAULT_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'TRACE_MCP_URL',
];

const DISCOVERY_ROOTS = [
  '.',
  'sveltekit-frontend',
  'mcp-server-mcp/apps',
  'mcp-server-mcp/packages',
];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.svelte-kit',
  '.next',
  '.turbo',
  '.venv',
  '.venv-gemma4',
  'docs',
  'memory',
  'deeds_labs',
]);

function parseArgs(argv) {
  const npmForwardedKeys = process.env.npm_config_keys
    ? process.env.npm_config_keys.split(',').map((part) => part.trim()).filter(Boolean)
    : null;
  const args = {
    discover: false,
    all: false,
    files: [...DEFAULT_FILES],
    keys: npmForwardedKeys?.length ? npmForwardedKeys : [...DEFAULT_KEYS],
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--discover') {
      args.discover = true;
      continue;
    }
    if (token === '--all') {
      args.all = true;
      continue;
    }
    if (token === '--files') {
      const value = argv[i + 1] ?? '';
      args.files = value.split(',').map((part) => part.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (token === '--keys') {
      const value = argv[i + 1] ?? '';
      args.keys = value.split(',').map((part) => part.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (token.startsWith('--keys=')) {
      const value = token.slice('--keys='.length);
      args.keys = value.split(',').map((part) => part.trim()).filter(Boolean);
      continue;
    }
    positional.push(token);
  }

  if (positional.length > 0) {
    args.keys = positional.map((part) => part.trim()).filter(Boolean);
  }

  return args;
}

function discoverEnvFiles(rootDir, includeAll = false) {
  if (!includeAll) {
    return PRIMARY_DISCOVERY_FILES
      .filter((relPath) => fs.existsSync(path.join(rootDir, relPath)))
      .sort((a, b) => a.localeCompare(b));
  }

  const discovered = [];

  function walk(currentDir, depth) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (depth >= 4) continue;
        walk(fullPath, depth + 1);
        continue;
      }

      if (entry.name.startsWith('.env')) {
        discovered.push(relPath || entry.name);
      }
    }
  }

  for (const relRoot of DISCOVERY_ROOTS) {
    const fullRoot = path.join(rootDir, relRoot);
    if (!fs.existsSync(fullRoot)) continue;
    walk(fullRoot, 0);
  }

  return [...new Set(discovered)].sort((a, b) => a.localeCompare(b));
}

function hasKey(filePath, key) {
  const content = fs.readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, 'm');
  return pattern.test(content);
}

function auditFiles(rootDir, files, keys) {
  return files.map((relPath) => {
    const fullPath = path.join(rootDir, relPath);
    const exists = fs.existsSync(fullPath);
    const row = {
      file: relPath.replace(/\\/g, '/'),
      exists,
    };

    for (const key of keys) {
      row[key] = exists ? hasKey(fullPath, key) : false;
    }

    return row;
  });
}

function printDiscovery(files) {
  for (const file of files) {
    console.log(file);
  }
}

function printAudit(rows, keys) {
  const header = ['file', 'exists', ...keys];
  console.log(header.join('\t'));
  for (const row of rows) {
    const line = [
      row.file,
      row.exists ? 'yes' : 'no',
      ...keys.map((key) => (row[key] ? 'yes' : 'no')),
    ];
    console.log(line.join('\t'));
  }
}

const options = parseArgs(process.argv.slice(2));

if (options.discover) {
  printDiscovery(discoverEnvFiles(ROOT, options.all));
  process.exit(0);
}

printAudit(auditFiles(ROOT, options.files, options.keys), options.keys);
