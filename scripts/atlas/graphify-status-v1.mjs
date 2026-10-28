#!/usr/bin/env node
// Read-only Graphify status from existing receipts. Does not run Graphify and writes nothing. Usage: node scripts/atlas/graphify-status-v1.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraphifyStatus } from './lib/graphify-status-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
console.log(JSON.stringify(readGraphifyStatus({ repoRoot }), null, 2));
