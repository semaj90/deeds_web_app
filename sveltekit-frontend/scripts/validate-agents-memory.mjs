#!/usr/bin/env node
/**
 * validate-agents-memory.mjs — AGENTS.md health validator.
 *
 * Checks:
 *   1. Required AGENTS.md files exist
 *   2. No file exceeds size threshold (default 60 KB)
 *   3. No obvious secrets (password, token, api_key literals)
 *   4. No conflicting safety rules (write-tool exposure)
 *   5. Auto-generated marker present in each file
 *   6. Root CLAUDE.md exists or warns
 *
 * Usage:
 *   node scripts/validate-agents-memory.mjs [--strict]
 *
 * Exit 0 = PASS (warns are non-fatal).  Exit 1 = FAIL (errors block CI).
 * With --strict, warns also become failures.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const ROOT        = resolve(process.cwd(), '..');        // deeds-web-app root
const SVELTE_ROOT = resolve(process.cwd());              // sveltekit-frontend/
const STRICT      = process.argv.includes('--strict');

let errors = 0;
let warns  = 0;

function pass(msg)  { console.log(`  ✓ ${msg}`); }
function warn(msg)  { console.warn(`  ⚠ WARN  ${msg}`); warns++; }
function fail(msg)  { console.error(`  ✗ FAIL  ${msg}`); errors++; }
function info(msg)  { console.log(`    ${msg}`); }

// ── Config ─────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 60 * 1024; // 60 KB

// These MUST exist; absence is an error.
const REQUIRED = [
  { path: resolve(ROOT, 'AGENTS.md'),                                   label: 'root' },
  { path: resolve(SVELTE_ROOT, 'src/mcp/AGENTS.md'),                    label: 'src/mcp' },
  { path: resolve(SVELTE_ROOT, 'src/lib/server/ai/AGENTS.md'),          label: 'src/lib/server/ai' },
];

// These SHOULD exist; absence is a warning only.
const RECOMMENDED = [
  { path: resolve(SVELTE_ROOT, 'src/lib/server/search/AGENTS.md'),      label: 'src/lib/server/search' },
  { path: resolve(SVELTE_ROOT, 'src/lib/server/gpu/AGENTS.md'),         label: 'src/lib/server/gpu' },
  { path: resolve(ROOT, 'services/go-retrieval-service/AGENTS.md'),     label: 'services/go-retrieval-service' },
  { path: resolve(ROOT, 'services/go-search-service/AGENTS.md'),        label: 'services/go-search-service' },
  { path: resolve(ROOT, 'CLAUDE.md'),                                    label: 'CLAUDE.md (root)' },
];

// Patterns that suggest a secret was accidentally committed
const SECRET_PATTERNS = [
  /password\s*[:=]\s*["'][^"']{6,}/i,
  /api_key\s*[:=]\s*["'][^"']{8,}/i,
  /secret\s*[:=]\s*["'][^"']{8,}/i,
  /bearer\s+[A-Za-z0-9+/]{20,}/i,
  /sk-[A-Za-z0-9]{20,}/,            // OpenAI key pattern
];

// Patterns that would indicate write tools were accidentally exposed
const WRITE_EXPOSURE_PATTERNS = [
  /Gemma4.*may.*call.*upsert/i,
  /Gemma4.*may.*call.*write/i,
  /Gemma4.*may.*call.*delete/i,
  /allow.*qdrant\.upsert/i,
  /expose.*neo4j\.write/i,
];

// ── Checkers ───────────────────────────────────────────────────────────────────

function checkFile(filePath, label, required) {
  if (!existsSync(filePath)) {
    if (required) {
      fail(`${label} — AGENTS.md not found at: ${filePath}`);
    } else {
      warn(`${label} — AGENTS.md missing (recommended): ${filePath}`);
    }
    return;
  }

  const stat    = statSync(filePath);
  const content = readFileSync(filePath, 'utf8');

  // Size check
  if (stat.size > MAX_FILE_BYTES) {
    (required ? fail : warn)(
      `${label} — file size ${(stat.size / 1024).toFixed(1)} KB exceeds ${MAX_FILE_BYTES / 1024} KB limit`
    );
  } else {
    pass(`${label} — ${(stat.size / 1024).toFixed(1)} KB ✓`);
  }

  // Secret check
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(content)) {
      fail(`${label} — possible secret exposed (pattern: ${pat})`);
      break;
    }
  }

  // Write-tool exposure check
  for (const pat of WRITE_EXPOSURE_PATTERNS) {
    if (pat.test(content)) {
      fail(`${label} — write-tool exposure in safety rules (pattern: ${pat})`);
      break;
    }
  }

  // Auto-gen marker check (informational)
  if (!content.includes('AGENTS-GEN v1') && !content.includes('## Scope')) {
    info(`${label} — no auto-gen marker or ## Scope section (may be hand-written)`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('=== AGENTS.md Memory Validator ===\n');

console.log('Required files:');
for (const { path, label } of REQUIRED) {
  checkFile(path, label, true);
}

console.log('\nRecommended files:');
for (const { path, label } of RECOMMENDED) {
  checkFile(path, label, false);
}

// Strict mode promotes warns to fails
if (STRICT && warns > 0) {
  console.error(`\n[strict] ${warns} warning(s) treated as failure(s).`);
  errors += warns;
  warns = 0;
}

console.log(`\n${'─'.repeat(48)}`);
if (errors === 0 && warns === 0) {
  console.log('✅ PASS — all AGENTS.md files valid');
} else if (errors === 0) {
  console.log(`⚠️  PASS with ${warns} warning(s) — review above`);
} else {
  console.error(`❌ FAIL — ${errors} error(s)${warns > 0 ? `, ${warns} warning(s)` : ''}`);
}
console.log('─'.repeat(48));

process.exit(errors > 0 ? 1 : 0);
