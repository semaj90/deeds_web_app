#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const JSON_OUT = path.resolve('memory/exports/engram-transition-memory.json');
const JSONL_OUT = path.resolve('memory/exports/engram-transition-memory.jsonl');

async function main() {
  const raw = await readFile(JSON_OUT, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error('transition memory payload missing records array');
  }
  if (parsed.records.length === 0) {
    throw new Error('transition memory export is empty');
  }

  const jsonl = await readFile(JSONL_OUT, 'utf8');
  const lines = jsonl.split('\n').filter(Boolean);
  if (lines.length !== parsed.records.length) {
    throw new Error(`JSONL line count mismatch: ${lines.length} !== ${parsed.records.length}`);
  }

  console.log(`[engram-smoke] records=${parsed.records.length}`);
  console.log(`[engram-smoke] bigramKeys=${parsed.bigramKeyCount}`);
}

main().catch((err) => {
  console.error(`[engram-smoke] failed: ${err.message}`);
  process.exit(1);
});
