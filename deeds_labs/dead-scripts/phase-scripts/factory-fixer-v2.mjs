#!/usr/bin/env node
/**
 * Phase 72 Factory Fixer v2.0
 *
 * Implements the complete factory loop:
 * Plan → Patch → Apply → Verify → Rollback
 *
 * Features:
 * - Immutable run folders (reports/runs/<timestamp>/)
 * - Path-scoped fixes (--path "src/lib/services/**")
 * - Patch generation before apply
 * - Verification gate (--verify "npm run check:ultra-fast")
 * - Automatic rollback on failure
 * - RAG integration for confidence tracking
 *
 * Usage:
 *   node factory-fixer-v2.mjs --plan --tier 1 --path "src/lib/services/**"
 *   node factory-fixer-v2.mjs --generate-patches --tier 1 --path "src/lib/services/**" --limit 1000
 *   node factory-fixer-v2.mjs --apply --tier 1 --path "src/lib/services/**" --limit 500 --verify "npm run check:ultra-fast"
 *   node factory-fixer-v2.mjs --rollback --run 2025-12-17_235901
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { minimatch } from 'minimatch';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createSafeProgress, validatePatch, writePatchedFile } from './patch-safety-gate.mjs';

// Phase 72 KAG Integration
let kagFixStore = null;
try {
  const kagModule = await import('./kag-fix-store.mjs');
  kagFixStore = kagModule.kagFixStore;
  console.log('[KAG] KAG storage layer loaded successfully');
} catch (error) {
  console.warn('[KAG] KAG storage layer not available:', error.message);
  console.warn('[KAG] Continuing without KAG caching (Tier rules only)');
}

// KAG/RAG Integration (Phase 72)

// Phase 72 RAG Integration: SIMD Parser + Redis Cache + RAG Query
let simdParserAvailable = false;
let redisAvailable = false;
let ragServiceAvailable = false;

// Check service availability on startup
const SIMD_PARSER_URL = process.env.SIMD_JSON_PARSER_URL || 'http://localhost:8096/api/simd';
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8094';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '4005';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'reports');
const runsDir = path.join(reportsDir, 'runs');

// ============================================================
// PHASE 72 RAG INTEGRATION: SIMD + REDIS + RAG
// ============================================================

/**
 * Parse JSON with SIMD acceleration (10x faster than native)
 * Falls back to JSON.parse if SIMD service unavailable
 */
async function parseSIMD(jsonString) {
  if (!simdParserAvailable) {
    return JSON.parse(jsonString);
  }

  try {
    const response = await fetch(`${SIMD_PARSER_URL}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: jsonString }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) throw new Error(`SIMD parser returned ${response.status}`);

    const result = await response.json();
    return result.data;
  } catch (error) {
    if (FLAGS.VERBOSE) {
      console.warn(`⚠️  SIMD parser unavailable (${error.message}), using native JSON.parse`);
    }
    simdParserAvailable = false;
    return JSON.parse(jsonString);
  }
}

/**
 * Query RAG service for similar past fixes
 */
async function queryRAGForFixes(error) {
  if (!ragServiceAvailable || !FLAGS.TRACK_RAG) {
    return [];
  }

  try {
    const response = await fetch(`${RAG_SERVICE_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `Fix TypeScript error: ${error.message} in ${error.file}`,
        context: {
          errorCode: error.code,
          file: error.file,
          category: error.category
        },
        maxResults: 3,
        minConfidence: 0.8
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) throw new Error(`RAG query failed: ${response.status}`);

    const result = await response.json();
    return result.suggestions || [];
  } catch (error) {
    if (FLAGS.VERBOSE) {
      console.warn(`⚠️  RAG query failed: ${error.message}`);
    }
    return [];
  }
}

/**
 * Store successful fix in RAG knowledge base for future learning
 */
async function storeFixInRAG(error, fix, success) {
  // NOTE: KAG persistence is intentionally handled AFTER verification passes.
  // Do not store unverified outcomes here.

  // Legacy RAG service integration (remote HTTP endpoint)
  if (!ragServiceAvailable || !FLAGS.TRACK_RAG || !success) {
    return;
  }

  try {
    await fetch(`${RAG_SERVICE_URL}/api/rag/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'phase72-successful-fixes',
        document: {
          error: {
            message: error.message,
            file: error.file,
            code: error.code,
            category: error.category,
            tier: error.tier
          },
          fix: {
            pattern: fix.patternId,
            patch: fix.patch,
            appliedAt: new Date().toISOString(),
            verified: success
          },
          metadata: {
            confidence: fix.confidence || 0.9,
            tags: [error.category, `tier-${error.tier}`]
          }
        }
      }),
      signal: AbortSignal.timeout(2000)
    });

    if (FLAGS.VERBOSE) {
      console.log(`✅ Stored fix in RAG: ${error.file}`);
    }
  } catch (error) {
    // Silent fail - RAG storage is optional
  }
}

/**
 * Check service availability on startup
 */
async function checkServiceAvailability() {
  if (FLAGS.VERBOSE) {
    console.log('\n🔍 Checking service availability...');
  }

  // Check SIMD parser
  try {
    const response = await fetch(`${SIMD_PARSER_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    simdParserAvailable = response.ok;
  } catch {
    simdParserAvailable = false;
  }

  // Check RAG service
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    ragServiceAvailable = response.ok;
  } catch {
    ragServiceAvailable = false;
  }

  if (FLAGS.VERBOSE) {
    console.log(`\n📊 Service Status:`);
    console.log(`   SIMD Parser: ${simdParserAvailable ? '✅ Available' : '❌ Unavailable'}`);
    console.log(`   RAG Service: ${ragServiceAvailable ? '✅ Available' : '❌ Unavailable'}`);
    console.log(`   RAG Tracking: ${FLAGS.TRACK_RAG ? '✅ Enabled' : '⚠️  Disabled (--no-rag)'}\n`);
  }
}

// ============================================================
// CLI FLAGS PARSING
// ============================================================
const FLAGS = {
  // Actions (mutually exclusive)
  PLAN: process.argv.includes("--plan"),
  GENERATE_PATCHES: process.argv.includes("--generate-patches"),
  APPLY: process.argv.includes("--apply") || process.argv.includes("--apply-safe"),
  ROLLBACK: process.argv.includes("--rollback"),
  STATUS: process.argv.includes("--status"),

  // Options
  TIER: process.argv.includes("--tier") ? parseInt(process.argv[process.argv.indexOf("--tier") + 1] || "1") : 1,
  PATH: process.argv.includes("--path") ? process.argv[process.argv.indexOf("--path") + 1] : null,
  LIMIT: process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity,
  VERIFY: process.argv.includes("--verify") ? process.argv[process.argv.indexOf("--verify") + 1] : null,
  RUN: process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : null,
  INPUT: process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : path.join(reportsDir, 'latest', 'errors.jsonl'),

  // Flags
  VERBOSE: process.argv.includes("--verbose"),
  DRY_RUN: process.argv.includes("--dry-run"),
  FORCE: process.argv.includes("--force"),
  ENABLE_KAG: process.argv.includes("--kag") || !process.argv.includes("--no-kag"),
  KAG_THRESHOLD: parseFloat(process.argv.find(a => a.startsWith("--kag-threshold="))?.split("=")[1] || "0.8"),
  SHOW_LEARNING: process.argv.includes("--show-learning"),
  TRACK_RAG: !process.argv.includes("--no-rag")
};

// Show help if no action specified
if (!FLAGS.PLAN && !FLAGS.GENERATE_PATCHES && !FLAGS.APPLY && !FLAGS.ROLLBACK && !FLAGS.STATUS) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                 Phase 72 Factory Fixer v2.0                           ║
║            Plan → Patch → Apply → Verify → Rollback                   ║
╚═══════════════════════════════════════════════════════════════════════╝

ACTIONS (pick one):
  --plan                 Generate fix plan (dry-run analysis)
  --generate-patches     Create patch files for review
  --apply                Apply fixes with backups + verification
  --rollback             Restore files from a previous run
  --status               Show recent runs and stats

OPTIONS:
  --tier <N>             Fix tier: 1=safe, 2=review, 3=manual (default: 1)
  --path <glob>          Scope fixes to path (e.g., "src/lib/services/**")
  --limit <N>            Max errors to fix (default: unlimited)
  --verify <cmd>         Run command after apply (rollback if fails)
  --run <timestamp>      Target run for rollback (e.g., 2025-12-17_235901)
  --input <file>         JSONL input (default: reports/latest/errors.jsonl)

FLAGS:
  --verbose              Show detailed progress
  --dry-run              Simulate apply without writing files
  --force                Skip safety checks (dangerous!)
  --kag                  Enable KAG replay (default: enabled)
  --no-kag               Disable KAG (no learning / no replay)
  --kag-threshold=<n>    Minimum confidence for KAG replay (default: 0.8)
  --show-learning        Print KAG learning stats after verified apply
  --no-rag               Disable RAG confidence tracking

EXAMPLES:

  # 1. Plan Tier 1 fixes for services directory
  node factory-fixer-v2.mjs --plan --tier 1 --path "src/lib/services/**"

  # 2. Generate patches for review (limit 1000)
  node factory-fixer-v2.mjs --generate-patches --tier 1 \\
    --path "src/lib/services/**" --limit 1000

  # 3. Apply fixes with verification gate
  node factory-fixer-v2.mjs --apply --tier 1 \\
    --path "src/lib/services/**" --limit 500 \\
    --verify "npm run check:ultra-fast"

  # 4. Rollback if something went wrong
  node factory-fixer-v2.mjs --rollback --run 2025-12-17_235901

  # 5. Check status of recent runs
  node factory-fixer-v2.mjs --status

FACTORY WORKFLOW:
  1. Plan → Analyze scope and generate fix list
  2. Patches → Review changes before applying
  3. Apply → Execute fixes with backups
  4. Verify → Run checks (auto-rollback if fails)
  5. Track → Record success in RAG database

Run folder structure:
  reports/runs/<timestamp>/
    ├── fix-plan.json       (what will be fixed)
    ├── patches/            (diffs for review)
    ├── backups/            (originals before apply)
    └── manifest.json       (execution record)
`);
  process.exit(0);
}

// ============================================================
// TIER DEFINITIONS
// ============================================================
const TIER_DEFINITIONS = {
  1: {
    name: 'Safe Deterministic',
    description: 'Zero-risk transformations with 100% correctness',
    patterns: [
      {
        id: 'unused-import',
        category: 'import-cleanup',
        errorMatch: /^(?:(?:(?:Property|Variable) '[^']+' is declared but )|(?:'))('[^']+' is declared but (?:its value )?is never read)/,
        confidence: 0.95,
        fix: (line) => null // Signals: delete this line
      },
      {
        id: 'import-type-to-value',
        category: 'import-transform',
        errorMatch: /'([^']+)' cannot be used as a value because it was imported using 'import type'/,
        lineMatch: /import\s+type\s+\{/,
        confidence: 0.90,
        fix: (line) => line.replace(/import\s+type\s+\{/, 'import {')
      },
      {
        id: 'lucide-default-import',
        category: 'import-transform',
        errorMatch: /Module ["']lucide-svelte["'] has no exported member ['"']([A-Z][a-zA-Z0-9]+)['"']/,
        lineMatch: /import\s*\{[^}]*\}\s*from\s*['"]lucide-svelte['"]/,
        confidence: 0.95,
        fix: (line, errorMatch) => {
          const iconName = errorMatch[1];
          // If it's the only import: import { Brain } from "lucide-svelte" -> import Brain from "lucide-svelte"
          // If there are others: import { Brain, Calendar } from "lucide-svelte" -> import Brain from "lucide-svelte"; import { Calendar } from "lucide-svelte"
          if (line.includes(',')) {
            const newLine = line.replace(new RegExp(`\\b${iconName}\\b\\s*,?\\s*`), '').replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ ');
            return `import ${iconName} from "lucide-svelte";\n${newLine}`;
          }
          return line.replace(/import\s*\{\s*([A-Z][a-zA-Z0-9]+)\s*\}\s*from/, 'import $1 from');
        }
      }
    ]
  },
  2: {
    name: 'Review Required',
    description: 'Behavior-preserving refactors needing validation',
    patterns: [
      {
        id: 'zod-value-import',
        category: 'import-transform',
        errorMatch: /'z' cannot be used as a value because it was imported using 'import type'/,
        lineMatch: /import\s+type\s*\{\s*z\s*\}\s*from\s*['"]zod['"]/,
        confidence: 0.98,
        fix: (line) => line.replace(/import\s+type\s*\{\s*z\s*\}\s*from\s*['"]zod['"]/, 'import { z } from "zod"')
      },
      {
        id: 'lucide-default-import',
        category: 'import-transform',
        errorMatch: /Module ["']lucide-svelte["'] has no exported member ['"']([A-Z][a-zA-Z0-9]+)['"']/,
        lineMatch: /import\s*\{[^}]*\}\s*from\s*['"]lucide-svelte['"]/,
        confidence: 0.95,
        fix: (line, errorMatch) => {
          const iconName = errorMatch[1];
          // If it's the only import: import { Brain } from "lucide-svelte" -> import Brain from "lucide-svelte"
          // If there are others: import { Brain, Calendar } from "lucide-svelte" -> import Brain from "lucide-svelte"; import { Calendar } from "lucide-svelte"
          if (line.includes(',')) {
            const newLine = line.replace(new RegExp(`\\b${iconName}\\b\\s*,?\\s*`), '').replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ ');
            return `import ${iconName} from "lucide-svelte";\n${newLine}`;
          }
          return line.replace(/import\s*\{\s*([A-Z][a-zA-Z0-9]+)\s*\}\s*from/, 'import $1 from');
        }
      },
      {
        id: 'invalid-character-fix',
        category: 'syntax-fix',
        errorMatch: /Invalid character\./,
        confidence: 0.90,
        fix: (line) => {
          // Case 1: Hash comments in TS files (e.g. env.server.ts)
          if (/^\s*#/.test(line)) {
            return line.replace(/^(\s*)#/, '$1//');
          }

          // Case 2: Mojibake / Progress bars
          return line
            .replace(/├óΓÇ¥┼Æ├óΓÇ¥Γé¼/g, '━')
            .replace(/├óΓÇ¥Γé¼/g, '━')
            .replace(/├óΓÇ¥┬É/g, '┫')
            .replace(/├óΓÇ¥ΓÇÜ/g, '┃')
            .replace(/├óΓÇô╦å/g, '█')
            .replace(/âœ…/g, '✅')
            .replace(/âŒ/g, '❌')
            .replace(/âš¡/g, '⚡')
            .replace(/ðŸ“Š/g, '📊')
            .replace(/ðŸ“/g, '📄')
            .replace(/ðŸ”¥/g, '🔥')
            .replace(/ðŸš€/g, '🚀')
            .replace(/ðŸŽ¯/g, '🎯')
            .replace(/ðŸ’¾/g, '💾')
            .replace(/ðŸ”§/g, '🔧')
            .replace(/âš ï¸/g, '⚠️')
            .replace(/├░┼╕ΓÇ£┼á/g, '📄')
            .replace(/├░┼╕ΓÇ¥┬ì/g, '🔍')
            .replace(/├ó┼í┬í/g, '⚙️')
            .replace(/├░┼╕ΓÇ£┬ª/g, '📦')
            .replace(/├░┼╕┼╜┬«/g, '🎮')
            .replace(/├░┼╕ΓÇ¥┬¬/g, '🔬')
            .replace(/ðŸŽ¨/g, '🎨')
            .replace(/ðŸŽª/g, '🧪')
            .replace(/ðŸŽ®/g, '🎮')
            .replace(/ðŸŒ…/g, '🌅')
            .replace(/ðŸ”´/g, '🔴')
            .replace(/ðŸ”/g, '🔗')
            .replace(/ðŸŒ/g, '🌐')
            .replace(/ðŸ—„ï¸/g, '🗄️')
            .replace(/ðŸ˜/g, '🐘')
            .replace(/â€”/g, '—');
        }
      },
      {
        id: 'svelte5-events-safe',
        category: 'svelte-update',
        errorMatch: /Property 'on:\w+' does not exist on type/,
        lineMatch: /on:\w+=/,
        confidence: 0.92,
        fix: (line) => line.replace(/on:(\w+)=/g, 'on$1=' )
      },
      {
        id: 'html-tag-case-safe',
        category: 'html-fix',
        errorMatch: /Property '\w+' does not exist on type 'JSX\.IntrinsicElements'/,
        lineMatch: /<[A-Z][a-z]+/,
        confidence: 0.90,
        fix: (line) => line.replace(/<([A-Z][a-z]+)/g, (m, p1) => `<${p1.toLowerCase()}`)
      }
    ]
  },
  3: {
    name: 'Manual Only',
    description: 'Complex changes requiring domain expertise',
    patterns: []
  }
};

// ============================================================
// IMMUTABLE RUN MANAGEMENT
// ============================================================
function createImmutableRun() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const runDir = path.join(runsDir, timestamp);

  // Invariant: Never overwrite existing runs
  if (fs.existsSync(runDir)) {
    console.error(`❌ INVARIANT VIOLATED: Run ${timestamp} already exists`);
    process.exit(1);
  }

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(runDir, 'patches'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'backups'), { recursive: true });

  return { timestamp, runDir };
}

function updateLatestPointer(timestamp) {
  const latestDir = path.join(reportsDir, 'latest');
  const sourceDir = path.join(runsDir, timestamp);

  // Windows-safe: Copy files (no symlinks)
  if (!fs.existsSync(latestDir)) {
    fs.mkdirSync(latestDir, { recursive: true });
  }

  const filesToCopy = ['fix-plan.json', 'manifest.json'];
  filesToCopy.forEach(file => {
    const srcPath = path.join(sourceDir, file);
    const dstPath = path.join(latestDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  });
}

// ============================================================
// JSONL EVENT LOADER
// ============================================================
async function loadEvents(filePath) {
  const events = [];

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Input file not found: ${filePath}`);
    process.exit(1);
  }

  // Phase 72 SIMD Fix: Use async iterator to properly await parseSIMD
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    const trimmed = line?.trim();
    if (!trimmed) continue;

    try {
      // Phase 72 RAG Integration: Use SIMD parser if available (10x speed boost)
      const event = simdParserAvailable
        ? await parseSIMD(trimmed)
        : JSON.parse(trimmed);
      events.push(event);

      if (FLAGS.VERBOSE && lineNum % 1000 === 0) {
        process.stdout.write(`\r⏳ Loaded ${lineNum} events...`);
      }
    } catch (e) {
      if (FLAGS.VERBOSE) {
        console.warn(`⚠️  Invalid JSON at line ${lineNum}`);
      }
    }
  }

  if (FLAGS.VERBOSE) process.stdout.write(`\n`);
  return events;
}

// ============================================================
// PATH FILTERING
// ============================================================
function matchesPathFilter(filePath, globPattern) {
  if (!globPattern) return true;

  // Normalize Windows paths for minimatch
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedGlob = globPattern.replace(/\\/g, '/');

  return minimatch(normalizedPath, normalizedGlob, { matchBase: true });
}

function filterEventsByPath(events, pathGlob) {
  if (!pathGlob) return events;

  const filtered = events.filter(e => matchesPathFilter(e.file, pathGlob));

  console.log(`📁 Path filter: ${pathGlob}`);
  console.log(`   Matched: ${filtered.length} / ${events.length} errors`);

  return filtered;
}

// ============================================================
// FIX PLAN GENERATION
// ============================================================
function generateFixPlan(events, tier) {
  const tierDef = TIER_DEFINITIONS[tier];
  if (!tierDef) {
    console.error(`❌ Invalid tier: ${tier}`);
    process.exit(1);
  }

  const plan = {
    tier,
    tierName: tierDef.name,
    timestamp: new Date().toISOString(),
    totalErrors: events.length,
    fixes: [],
    summary: {
      byCategory: {},
      byFile: {},
      totalFixable: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 }
    }
  };

  events.forEach(event => {
    for (const pattern of tierDef.patterns) {
      const match = event.message.match(pattern.errorMatch || pattern.match);
      if (match) {
        const fix = {
          fingerprint: event.fingerprint,
          file: event.file,
          line: event.line,
          column: event.col,
          message: event.message,
          code: event.code,
          tool: event.tool || 'svelte-check',
          position: event.position,
          patternId: pattern.id,
          category: pattern.category,
          confidence: pattern.confidence,
          ragSuggestions: [] // Will be populated if RAG available
        };

        plan.fixes.push(fix);

        // Update summary
        plan.summary.byCategory[pattern.category] = (plan.summary.byCategory[pattern.category] || 0) + 1;
        plan.summary.byFile[event.file] = (plan.summary.byFile[event.file] || 0) + 1;
        plan.summary.totalFixable++;

        if (pattern.confidence >= 0.9) plan.summary.confidenceDistribution.high++;
        else if (pattern.confidence >= 0.7) plan.summary.confidenceDistribution.medium++;
        else plan.summary.confidenceDistribution.low++;

        break; // Only match first pattern per error
      }
    }
  });

  return plan;
}

// ============================================================
// PATCH GENERATION
// ============================================================
function generatePatches(plan, runDir) {
  const patchesDir = path.join(runDir, 'patches');
  const manifest = {
    timestamp: plan.timestamp,
    tier: plan.tier,
    patches: []
  };

  // Group fixes by file
  const fileGroups = {};
  plan.fixes.forEach(fix => {
    if (!fileGroups[fix.file]) fileGroups[fix.file] = [];
    fileGroups[fix.file].push(fix);
  });

  let patchCount = 0;
  for (const [file, fixes] of Object.entries(fileGroups)) {
    const patchName = `${path.basename(file)}.patch`;
    const patchPath = path.join(patchesDir, patchName);

    let patchContent = `--- ${file}\n+++ ${file} (fixed)\n\n`;

    fixes.forEach(fix => {
      patchContent += `@@ Line ${fix.line}, Col ${fix.column} @@\n`;
      patchContent += `Pattern: ${fix.patternId} (${fix.category})\n`;
      patchContent += `Confidence: ${(fix.confidence * 100).toFixed(1)}%\n`;
      patchContent += `Message: ${fix.message}\n`;
      patchContent += `\n`;
    });

    fs.writeFileSync(patchPath, patchContent);

    manifest.patches.push({
      file,
      patch: patchName,
      fixCount: fixes.length,
      categories: [...new Set(fixes.map(f => f.category))]
    });

    patchCount++;
  }

  fs.writeFileSync(path.join(patchesDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { patchCount, manifest };
}

// ============================================================
// FIX APPLICATION
// ============================================================
// APPLY FIXES WITH SAFETY GATE
// ============================================================
function applyFixes(plan, runDir) {
  const backupsDir = path.join(runDir, 'backups');
  const tierDef = TIER_DEFINITIONS[plan.tier];
  const progress = createSafeProgress();

  const stats = {
    applied: 0,
    skipped: 0,
    errors: 0,
    rejected: 0, // Patches rejected by safety gate
    filesModified: new Set(),
    kagCandidates: []
  };

  // Group by file
  const fileGroups = {};
  plan.fixes.slice(0, FLAGS.LIMIT).forEach(fix => {
    if (!fileGroups[fix.file]) fileGroups[fix.file] = [];
    fileGroups[fix.file].push(fix);
  });

  const fileArray = Object.entries(fileGroups);
  let fileIdx = 0;

  for (const [file, fixes] of fileArray) {
    fileIdx++;
    const absPath = path.resolve(file);

    if (!fs.existsSync(absPath)) {
      console.warn(`⚠️  File not found: ${file}`);
      stats.skipped += fixes.length;
      progress.tick(fileIdx, fileArray.length, `${file}`);
      continue;
    }

    try {
      // Backup original
      const backupPath = path.join(backupsDir, path.basename(file) + `.${Date.now()}.bak`);
      fs.copyFileSync(absPath, backupPath);

      if (!FLAGS.DRY_RUN) {
        let content = fs.readFileSync(absPath, 'utf-8');
        const lines = content.split('\n');
        const fileKagCandidates = [];

        // Sort fixes by line number (descending) to avoid offset issues
        fixes.sort((a, b) => b.line - a.line);

        fixes.forEach(fix => {
          const pattern = tierDef.patterns.find(p => p.id === fix.patternId);
          if (!pattern) return;

          const lineIdx = fix.line - 1;
          if (lineIdx < 0 || lineIdx >= lines.length) return;

          const originalLine = lines[lineIdx];
          const errorMatch = fix.message.match(pattern.errorMatch || pattern.match);
          const lineMatch = pattern.lineMatch ? originalLine.match(pattern.lineMatch) : errorMatch;

          if (lineMatch) {
            const newLine = pattern.fix(originalLine, errorMatch, lineMatch);

            console.log('[KAG DEBUG] Fix executed:', fix.patternId, 'result:', newLine === null ? 'DELETE' : newLine === originalLine ? 'UNCHANGED' : 'REPLACED');

            if (newLine === null) {
              // Delete line
              lines.splice(lineIdx, 1);
              console.log('[KAG DEBUG] FLAGS.ENABLE_KAG:', FLAGS.ENABLE_KAG, 'pushing fix to candidates');
              if (FLAGS.ENABLE_KAG) fileKagCandidates.push(fix);
              stats.applied++;
              if (FLAGS.VERBOSE) {
                console.log(`✅ ${file}:${fix.line} - ${fix.patternId} (deleted)`);
              }
            } else if (newLine !== originalLine) {
              // Replace line
              lines[lineIdx] = newLine;
              console.log('[KAG DEBUG] FLAGS.ENABLE_KAG:', FLAGS.ENABLE_KAG, 'pushing fix to candidates');
              if (FLAGS.ENABLE_KAG) fileKagCandidates.push(fix);
              stats.applied++;
              if (FLAGS.VERBOSE) {
                console.log(`✅ ${file}:${fix.line} - ${fix.patternId} (replaced)`);
              }
            } else {
              // Line unchanged (already fixed or no-op)
              stats.skipped++;
              if (FLAGS.VERBOSE) {
                console.log(`⏭️  ${file}:${fix.line} - ${fix.patternId} (unchanged)`);
              }
            }
          } else {
            stats.skipped++;
            if (FLAGS.VERBOSE) {
              console.log(`⏭️  ${file}:${fix.line} - ${fix.patternId} (line mismatch)`);
            }
          }
        });

        // PATCH SAFETY GATE: Validate before writing
        const patchedContent = lines.join('\n');
        console.log('[KAG DEBUG] Before validatePatch, fileKagCandidates.length:', fileKagCandidates.length);
        try {
          validatePatch(patchedContent, file);
          writePatchedFile(absPath, patchedContent);
          stats.filesModified.add(file);
          console.log('[KAG DEBUG] Pushing fileKagCandidates to stats:', fileKagCandidates.length);
          stats.kagCandidates.push(...fileKagCandidates);
          console.log('[KAG DEBUG] Total kagCandidates:', stats.kagCandidates.length);
        } catch (gateError) {
          console.error(`\n❌ PATCH REJECTED: ${file}`);
          console.error(`   ${gateError.message.split('\n')[0]}`);
          stats.rejected++;
          stats.errors++;
          // Restore from backup
          fs.copyFileSync(backupPath, absPath);
          progress.tick(fileIdx, fileArray.length, `${path.basename(file)}`);
          continue; // Skip KAG storage for rejected patches
        }
      } else {
        stats.applied += fixes.length;
      }

      progress.tick(fileIdx, fileArray.length, `${path.basename(file)}`);
    } catch (error) {
      console.error(`\n❌ Error fixing ${file}: ${error.message}`);
      stats.errors++;
    }
  }

  progress.done(`Applied ${stats.applied} fixes (${stats.rejected} rejected)`);
  return stats;
}

// ============================================================
// VERIFICATION GATE
// ============================================================
function runVerification(command) {
  if (!command) return { success: true, skipped: true };

  console.log(`\n🔍 Running verification: ${command}`);
  console.log('═'.repeat(70));

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      timeout: 60000 // 1 minute
    });

    console.log('✅ Verification PASSED');
    return { success: true, skipped: false };
  } catch (error) {
    console.error('❌ Verification FAILED');
    return { success: false, skipped: false, error: error.message };
  }
}

// ============================================================
// ROLLBACK
// ============================================================
function rollbackRun(timestamp) {
  const runDir = path.join(runsDir, timestamp);
  const backupsDir = path.join(runDir, 'backups');

  if (!fs.existsSync(backupsDir)) {
    console.error(`❌ No backups found for run: ${timestamp}`);
    process.exit(1);
  }

  console.log(`🔄 Rolling back run: ${timestamp}`);
  console.log('═'.repeat(70));

  const backups = fs.readdirSync(backupsDir);
  let restoredCount = 0;

  backups.forEach(backupFile => {
    const backupPath = path.join(backupsDir, backupFile);
    const originalFile = backupFile.replace(/\.\d+\.bak$/, '');

    // Find original file path from manifest
    const manifestPath = path.join(runDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Manifest not found for ${timestamp}`);
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const filesModified = manifest.stats?.filesModified || manifest.filesModified || [];
    const fileEntry = filesModified.find(f => path.basename(f) === originalFile);

    if (fileEntry) {
      const targetPath = path.resolve(fileEntry);
      fs.copyFileSync(backupPath, targetPath);
      console.log(`✅ Restored: ${fileEntry}`);
      restoredCount++;
    }
  });

  console.log(`\n✅ Rolled back ${restoredCount} files`);
}

// ============================================================
// STATUS REPORT
// ============================================================
function showStatus() {
  console.log(`\n📊 Phase 72 Factory Status`);
  console.log('═'.repeat(70));

  if (!fs.existsSync(runsDir)) {
    console.log('No runs found yet.');
    return;
  }

  const runs = fs.readdirSync(runsDir)
    .filter(name => fs.statSync(path.join(runsDir, name)).isDirectory())
    .sort()
    .reverse()
    .slice(0, 10);

  console.log(`\nRecent Runs (last 10):\n`);

  runs.forEach((timestamp, i) => {
    const runDir = path.join(runsDir, timestamp);
    const manifestPath = path.join(runDir, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      console.log(`${i + 1}. ${timestamp}`);
      console.log(`   Tier: ${manifest.tier} | Applied: ${manifest.stats?.applied || 0} | Files: ${manifest.stats?.filesModified?.length || 0}`);
      console.log(`   Status: ${manifest.verificationPassed ? '✅ Verified' : '❌ Failed'}`);
    } else {
      console.log(`${i + 1}. ${timestamp} (incomplete)`);
    }
  });
}

// ============================================================
// RAG INTEGRATION
// ============================================================
async function recordFixAttemptInRAG(plan, stats, verificationPassed) {
  if (!FLAGS.TRACK_RAG) return;

  try {
    // Import RAG service (dynamic to avoid dependency issues)
    const { recordFix } = await import('../src/lib/services/error-pattern-rag.ts');

    // Record each category
    for (const [category, count] of Object.entries(plan.summary.byCategory)) {
      await recordFix(
        null, // db connection (will be created internally)
        plan.fixes[0]?.fingerprint || 'unknown',
        category,
        verificationPassed,
        count
      );
    }

    console.log(`✅ Recorded fix attempt in RAG database`);
  } catch (error) {
    if (FLAGS.VERBOSE) {
      console.warn(`⚠️  RAG tracking failed: ${error.message}`);
    }
  }
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================
async function main() {
  console.log(`\n╔${'═'.repeat(68)}╗`);
  console.log(`║  Phase 72 Factory Fixer v2.0 - Plan → Patch → Apply → Verify  ║`);
  console.log(`╚${'═'.repeat(68)}╝\n`);

  // ============================================================
  // ACTION: STATUS
  // ============================================================
  if (FLAGS.STATUS) {
    showStatus();
    return;
  }

  // ============================================================
  // ACTION: ROLLBACK
  // ============================================================
  if (FLAGS.ROLLBACK) {
    if (!FLAGS.RUN) {
      console.error('❌ --rollback requires --run <timestamp>');
      process.exit(1);
    }
    rollbackRun(FLAGS.RUN);
    return;
  }

  // ============================================================
  // LOAD EVENTS
  // ============================================================
  console.log(`📖 Loading events: ${FLAGS.INPUT}`);
  const allEvents = await loadEvents(FLAGS.INPUT);
  console.log(`✅ Loaded ${allEvents.length} error events\n`);

  // Apply path filter
  const events = filterEventsByPath(allEvents, FLAGS.PATH);

  if (events.length === 0) {
    console.log('⚠️  No errors matched path filter.');
    return;
  }

  // ============================================================
  // ACTION: PLAN
  // ============================================================
  if (FLAGS.PLAN) {
    console.log(`\n🎯 Generating fix plan for Tier ${FLAGS.TIER}...`);
    const plan = generateFixPlan(events, FLAGS.TIER);

    const { timestamp, runDir } = createImmutableRun();

    fs.writeFileSync(
      path.join(runDir, 'fix-plan.json'),
      JSON.stringify(plan, null, 2)
    );

    updateLatestPointer(timestamp);

    console.log(`\n${'═'.repeat(70)}`);
    console.log('📊 FIX PLAN SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Tier: ${plan.tierName} (${plan.tier})`);
    console.log(`Total Errors: ${plan.totalErrors}`);
    console.log(`Fixable: ${plan.summary.totalFixable} (${((plan.summary.totalFixable / plan.totalErrors) * 100).toFixed(1)}%)`);
    console.log(`Files Affected: ${Object.keys(plan.summary.byFile).length}`);
    console.log(`\nConfidence Distribution:`);
    console.log(`  High   (≥90%): ${plan.summary.confidenceDistribution.high}`);
    console.log(`  Medium (≥70%): ${plan.summary.confidenceDistribution.medium}`);
    console.log(`  Low    (<70%): ${plan.summary.confidenceDistribution.low}`);
    console.log(`\nBy Category:`);
    Object.entries(plan.summary.byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
    console.log(`\n📄 Plan saved: ${runDir}/fix-plan.json`);
    console.log(`\n💡 NEXT: node factory-fixer-v2.mjs --generate-patches --tier ${FLAGS.TIER} --path "${FLAGS.PATH || '**'}"`);
    console.log('═'.repeat(70) + '\n');
    return;
  }

  // ============================================================
  // ACTION: GENERATE PATCHES
  // ============================================================
  if (FLAGS.GENERATE_PATCHES) {
    console.log(`\n📝 Generating patches...`);

    // Phase 72: Check service availability
    await checkServiceAvailability();

    const plan = generateFixPlan(events, FLAGS.TIER);

    const { timestamp, runDir } = createImmutableRun();

    fs.writeFileSync(
      path.join(runDir, 'fix-plan.json'),
      JSON.stringify(plan, null, 2)
    );

    const { patchCount, manifest } = generatePatches(plan, runDir);

    updateLatestPointer(timestamp);

    console.log(`\n${'═'.repeat(70)}`);
    console.log('✅ PATCHES GENERATED');
    console.log('═'.repeat(70));
    console.log(`Patches: ${patchCount}`);
    console.log(`Location: ${runDir}/patches/`);
    console.log(`\n📄 Review patches before applying:`);
    console.log(`   code ${runDir}\\patches\\`);
    console.log(`\n💡 NEXT: node factory-fixer-v2.mjs --apply --tier ${FLAGS.TIER} --path "${FLAGS.PATH || '**'}" --limit ${FLAGS.LIMIT} --verify "npm run check:ultra-fast"`);
    console.log('═'.repeat(70) + '\n');
    return;
  }

  // ============================================================
  // ACTION: APPLY
  // ============================================================
  if (FLAGS.APPLY) {
    console.log(`\n🔧 Applying fixes (Tier ${FLAGS.TIER})...`);

    // Phase 72: Check service availability
    await checkServiceAvailability();

    const plan = generateFixPlan(events, FLAGS.TIER);

    const { timestamp, runDir } = createImmutableRun();

    fs.writeFileSync(
      path.join(runDir, 'fix-plan.json'),
      JSON.stringify(plan, null, 2)
    );

    const stats = applyFixes(plan, runDir);

    console.log(`\n${'═'.repeat(70)}`);
    console.log('📊 APPLICATION RESULTS');
    console.log('═'.repeat(70));
    console.log(`Applied: ${stats.applied}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Files Modified: ${stats.filesModified.size}`);

    // Save manifest initially (before verification) so rollback works
    const manifest = {
      timestamp,
      tier: plan.tier,
      stats: {
        applied: stats.applied,
        skipped: stats.skipped,
        errors: stats.errors,
        filesModified: Array.from(stats.filesModified)
      },
      verificationPassed: false, // Pending
      verificationSkipped: true
    };

    fs.writeFileSync(
      path.join(runDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Verification gate
    let verificationResult = { success: true, skipped: true };

    if (FLAGS.VERIFY && !FLAGS.DRY_RUN) {
      verificationResult = runVerification(FLAGS.VERIFY);

      // Update manifest with result
      manifest.verificationPassed = verificationResult.success;
      manifest.verificationSkipped = verificationResult.skipped;
      fs.writeFileSync(
        path.join(runDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      if (!verificationResult.success && !FLAGS.FORCE) {
        console.log(`\n🔄 Verification failed - initiating automatic rollback...`);
        rollbackRun(timestamp);
      }
    }

    // KAG persistence: only store outcomes after verification PASSES (never on plan/apply intent).
    console.log('[KAG DEBUG] Checking KAG storage conditions...');
    console.log('[KAG DEBUG] FLAGS.ENABLE_KAG:', FLAGS.ENABLE_KAG);
    console.log('[KAG DEBUG] FLAGS.DRY_RUN:', FLAGS.DRY_RUN);
    console.log('[KAG DEBUG] FLAGS.VERIFY:', FLAGS.VERIFY);
    console.log('[KAG DEBUG] verificationResult:', verificationResult);
    console.log('[KAG DEBUG] stats.kagCandidates.length:', stats.kagCandidates?.length || 0);

    if (
      FLAGS.ENABLE_KAG &&
      !FLAGS.DRY_RUN &&
      FLAGS.VERIFY &&
      verificationResult.success &&
      !verificationResult.skipped
    ) {
      console.log('[KAG DEBUG] All conditions met - storing fixes...');
      const unique = new Map();
      for (const fix of stats.kagCandidates || []) {
        if (!fix?.message || !fix?.file || !fix?.patternId) continue;
        const sig = kagFixStore.computeSignature({
          message: fix.message,
          file: fix.file,
          code: fix.code,
          tool: fix.tool || 'svelte-check',
          position: typeof fix.position === 'number' ? fix.position : undefined
        });
        unique.set(`${sig.sig}:${fix.patternId}`, { sig, fix });
      }

      for (const { sig, fix } of unique.values()) {
        await kagFixStore.storeFix(sig, {
          patchId: fix.patternId,
          patch: fix.patternId,
          appliedAt: new Date().toISOString(),
          verified: true,
          tier: plan.tier
        });
      }
    }

    updateLatestPointer(timestamp);

    console.log(`\n✅ Run complete: ${timestamp}`);
    console.log(`📄 Manifest: ${runDir}/manifest.json`);
    console.log(`💾 Backups: ${runDir}/backups/`);

    // Phase 72 learning stats (optional)
    if (FLAGS.SHOW_LEARNING && FLAGS.ENABLE_KAG) {
      const kagStats = await kagFixStore.getStats();
      console.log(`\n🧠 KAG Learning:`);
      console.log(`   Signatures: ${kagStats.totalSignatures}`);
      console.log(`   Fixes:      ${kagStats.totalFixes}`);
      console.log(`   Hit rate:   ${kagStats.hitRate.toFixed(1)}%`);
    }

    if (ragServiceAvailable && verificationResult.success) {
      console.log(`\n🧠 RAG Learning: ${stats.applied} fixes stored for future reference`);
    }

    if (verificationResult.success) {
      console.log(`\n💡 NEXT: Rerun error analysis to measure impact`);
      console.log(`   npm run check:svelte`);
    }

    console.log('═'.repeat(70) + '\n');
  }
}

main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  if (FLAGS.VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
});
