#!/usr/bin/env node
/**
 * Read-only diagnostic: cross-checks Svelte event handler spans from svelte-dom-splitter-v1
 * against an independent regex/scanner run over the component template.
 *
 * Verifies both Svelte 5 standard attributes (onclick, onkeydown, oninput) and legacy on:* directives.
 * Two independent methods must agree on every handler span.
 *
 * Never writes to Postgres, Valkey, Qdrant, or Neo4j. Receipts go to .tmp/atlas/ (gitignored).
 * Usage: node scripts/atlas/svelte-handler-crosscheck-v1.mjs <repo-relative .svelte file> [...]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RE_PATH = /^[A-Za-z0-9_.\-/()[\]]+\.svelte$/;

// Pattern matching Svelte 5 event attributes (e.g. onclick={...}, onkeydown="...")
// and legacy directives (e.g. on:click={...}, on:click|preventDefault={...})
const RE_HANDLERS = /\b(on:[a-zA-Z]+(?:\|[a-zA-Z]+)*|on[a-z]+)(?=\s*=\s*[\{"'])/g;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: svelte-handler-crosscheck-v1.mjs <file.svelte> [...]');
  process.exit(2);
}
for (const f of files) {
  if (!RE_PATH.test(f) || f.includes('..') || path.isAbsolute(f)) {
    console.error(`rejected path ${JSON.stringify(f)}`);
    process.exit(2);
  }
}

function ensureSplitterReceipt(rel) {
  const base = path.basename(rel).replace(/[^\w.-]/g, '_');
  const receiptPath = path.join(repoRoot, '.tmp', 'atlas', `svelte-dom-split-v1-${base}.json`);
  if (!fs.existsSync(receiptPath)) {
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'atlas', 'svelte-dom-splitter-v1.mjs'), rel], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30000,
    });
  }
  return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
}

function byteOffsetFactory(source) {
  const cache = new Map();
  return (charIndex) => {
    if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex > source.length) {
      throw new Error(`character index out of range: ${charIndex}`);
    }
    if (!cache.has(charIndex)) {
      cache.set(charIndex, Buffer.byteLength(source.slice(0, charIndex), 'utf8'));
    }
    return cache.get(charIndex);
  };
}

function scanTemplateHandlers(sourceText) {
  // Mask out <script> blocks so handlers inside TS code (e.g. element.addEventListener('click')) are excluded
  let masked = sourceText.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (match) => ' '.repeat(match.length));
  // Mask HTML comments
  masked = masked.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));

  const toByte = byteOffsetFactory(sourceText);
  const found = [];
  let match;
  while ((match = RE_HANDLERS.exec(masked)) !== null) {
    const rawAttr = match[1];
    const charStart = match.index;
    const charEnd = match.index + rawAttr.length;
    const isDirective = rawAttr.startsWith('on:');
    const eventName = isDirective ? rawAttr.slice(3).split('|')[0] : rawAttr.slice(2);
    found.push({
      attr: rawAttr,
      event: eventName,
      syntax: isDirective ? 'on_directive' : 'svelte5_attribute',
      byteStart: toByte(charStart),
      byteEnd: toByte(charEnd),
    });
  }
  return found;
}

const tmpDir = path.join(repoRoot, '.tmp', 'atlas');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

let allPassed = true;
const summary = [];

for (const rel of files) {
  const absPath = path.join(repoRoot, rel);
  if (!fs.existsSync(absPath)) {
    console.error(`missing file ${rel}`);
    allPassed = false;
    continue;
  }

  const rawBytes = fs.readFileSync(absPath);
  const sourceText = rawBytes.toString('utf8');
  const splitter = ensureSplitterReceipt(rel);
  const scanned = scanTemplateHandlers(sourceText);
  const splitHandlers = splitter.eventHandlers || [];

  const mismatches = [];

  // Check 1: Every scanned handler attribute must be accounted for in the splitter handlers
  for (const s of scanned) {
    const owners = splitHandlers.filter((h) => h.byteStart <= s.byteStart && h.byteEnd >= s.byteEnd);
    if (owners.length === 0) {
      mismatches.push({
        side: 'regex_scanner',
        event: s.event,
        span: [s.byteStart, s.byteEnd],
        reason: 'UNMATCHED_IN_SPLITTER',
      });
    }
  }

  // Check 2: Every splitter handler must contain a corresponding scanned handler attribute
  for (const h of splitHandlers) {
    const inside = scanned.filter((s) => s.byteStart >= h.byteStart && s.byteEnd <= h.byteEnd);
    if (inside.length === 0) {
      mismatches.push({
        side: 'splitter',
        event: h.event,
        span: [h.byteStart, h.byteEnd],
        reason: 'UNMATCHED_IN_SCANNER',
      });
    }
  }

  const receipt = {
    schema: 'atlas.svelte-handler-crosscheck.v1',
    generated_at: new Date().toISOString(),
    source_ref: rel,
    file_bytes: rawBytes.length,
    scanned_handlers_count: scanned.length,
    splitter_handlers_count: splitHandlers.length,
    mismatches,
    status: mismatches.length === 0 ? 'PASSED' : 'MISMATCH',
  };

  const receiptPath = path.join(tmpDir, `svelte-handler-crosscheck-v1-${path.basename(rel)}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');

  console.log(`${path.basename(rel)}: scanned=${scanned.length}, splitter=${splitHandlers.length}, mismatches=${mismatches.length} (${receipt.status})`);
  if (mismatches.length > 0) allPassed = false;
  summary.push({ file: path.basename(rel), status: receipt.status, count: splitHandlers.length });
}

console.log(`\nOverall Handler Crosscheck: ${allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
process.exit(allPassed ? 0 : 1);
