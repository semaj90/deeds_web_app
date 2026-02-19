#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { parse } from 'svelte/compiler';

async function findLastAppliedPath() {
  let dir = process.cwd();
  for (let i = 0; i < 8; ++i) {
    const candidate = path.join(dir, 'sveltekit-frontend', 'scripts', 'codemods', 'last-applied.json');
    try {
      await fs.access(candidate);
      return candidate;
    } catch (e) {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // fallback: current cwd
  const local = path.join(process.cwd(), 'scripts', 'codemods', 'last-applied.json');
  return local;
}

async function main() {
  let json;
  const listPath = await findLastAppliedPath();
  try {
    const txt = await fs.readFile(listPath, 'utf8');
    json = JSON.parse(txt);
  } catch (err) {
    console.error('Could not read last-applied.json - run apply-codmod-first-n.mjs first (looked at', listPath, ')');
    process.exit(1);
  }

  const files = json.applied || [];
  if (files.length === 0) {
    console.log('No applied files recorded.');
    return;
  }

  let hadError = false;
  for (const f of files) {
    try {
      const txt = await fs.readFile(f, 'utf8');
      parse(txt, { filename: f });
      console.log(`OK: ${f}`);
    } catch (err) {
      hadError = true;
      console.error(`ERROR parsing ${f}:`, err.message || err);
    }
  }

  if (hadError) process.exit(2);
}

main().catch(err => { console.error(err); process.exit(1); });
