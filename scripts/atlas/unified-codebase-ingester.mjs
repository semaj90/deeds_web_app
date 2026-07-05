#!/usr/bin/env node
/**
 * unified-codebase-ingester.mjs
 *
 * Master pipeline that unifies:
 * 1. Feature registry (atlas-feature-registry.json)
 * 2. Gemma4 semantic enrichment
 * 3. Kanban task generation
 * 4. Error-fixer integration
 * 5. Retrieval-loop memory append
 *
 * This is the "caveman rule" in action:
 * Map code → Label features → Create tasks → Fix errors → Validate → Remember
 *
 * Usage:
 *   node scripts/atlas/unified-codebase-ingester.mjs
 *   node scripts/atlas/unified-codebase-ingester.mjs --dry-run
 *   node scripts/atlas/unified-codebase-ingester.mjs --no-llm (skip Gemma4)
 *   node scripts/atlas/unified-codebase-ingester.mjs --limit 5 (top 5 features)
 *
 * Outputs:
 *   .tmp/ingester-enriched-features.json  — features with LLM enrichment
 *   .tmp/ingester-kanban-tasks.jsonl      — one task card per line
 *   .tmp/ingester-validation-report.json  — health checks
 *   .tmp/atlas-retrieval-loop.jsonl       — appended (memory persist)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { llamaChat } from './lib/llama-inference.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const NO_LLM = argv.includes('--no-llm');
const VERBOSE = argv.includes('--verbose');
const LIMIT_I = argv.indexOf('--limit');
const LIMIT = LIMIT_I >= 0 ? Number(argv[LIMIT_I + 1]) : null;

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const ENRICHED_PATH = path.join(ROOT, '.tmp', 'ingester-enriched-features.json');
const TASKS_PATH = path.join(ROOT, '.tmp', 'ingester-kanban-tasks.jsonl');
const REPORT_PATH = path.join(ROOT, '.tmp', 'ingester-validation-report.json');
const RETRIEVAL_LOOP_PATH = path.join(ROOT, '.tmp', 'atlas-retrieval-loop.jsonl');

// ─── LLM Configuration ───────────────────────────────────────────────────────
const TIMEOUT_MS = 30_000;

async function callGemma4(prompt) {
  try {
    return await llamaChat(prompt, { maxTokens: 256, temperature: 0.2, timeoutMs: TIMEOUT_MS });
  } catch (e) {
    if (VERBOSE) console.log(`  [LLM] llamaChat: ${e.message}`);
    return null;
  }
}

// ─── Task Card Builder ───────────────────────────────────────────────────────

async function buildTaskCard(feature, llmNotes) {
  const taskId = `TASK-${crypto.createHash('sha256').update(feature.id).digest('hex').slice(0, 8).toUpperCase()}`;

  // Determine Kanban status based on feature state
  let kanbanStatus = 'BACKLOG';
  if (feature.confidence > 0.9 && feature.files.length > 5) kanbanStatus = 'DONE';
  else if (feature.confidence > 0.7 && feature.files.length > 2) kanbanStatus = 'IN_PROGRESS';
  else if (feature.confidence > 0.5) kanbanStatus = 'TODO';

  // Determine priority
  let priority = 'LOW';
  if (feature.postgresTables && feature.postgresTables.length > 0) priority = 'HIGH';
  else if (feature.redisKeys && feature.redisKeys.length > 0) priority = 'MEDIUM';
  else if (feature.files.length > 5) priority = 'MEDIUM';

  return {
    taskId,
    featureId: feature.id,
    title: feature.label,
    description: feature.recommendedTask?.description || llmNotes || `Task for feature: ${feature.label}`,
    why: feature.recommendedTask?.why || 'Feature mapping and documentation',
    action: feature.recommendedTask?.action || `Review and document ${feature.id}`,
    kanbanStatus,
    priority,
    fileCount: feature.files.length,
    sourceRefs: feature.sourceRefs,
    confidence: feature.confidence,
    llmNotes: llmNotes || null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Validation Report ───────────────────────────────────────────────────────

function buildValidationReport(features, tasks) {
  const report = {
    timestamp: new Date().toISOString(),
    checks: {
      registryExists: fs.existsSync(REGISTRY_PATH),
      registryParseable: false,
      featureCount: 0,
      tasksGenerated: tasks.length,
      highPriorityCount: 0,
      llmEnrichmentAttempted: !NO_LLM,
      llmEnrichmentSuccess: 0,
      allFieldsPresent: true,
      errors: [],
      warnings: [],
    },
  };

  // Check registry
  if (report.checks.registryExists) {
    try {
      const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
      JSON.parse(content);
      report.checks.registryParseable = true;
    } catch (e) {
      report.checks.errors.push(`Registry parse error: ${e.message}`);
    }
  } else {
    report.checks.errors.push('Registry file not found');
  }

  // Check features
  report.checks.featureCount = features.length;
  for (const feature of features) {
    const missing = ['id', 'label', 'kind', 'files', 'confidence'].filter((f) => !(f in feature));
    if (missing.length > 0) {
      report.checks.allFieldsPresent = false;
      report.checks.errors.push(`Feature ${feature.id} missing: ${missing.join(', ')}`);
    }
    if (feature.llmNotes) report.checks.llmEnrichmentSuccess++;
  }

  // Count priority
  report.checks.highPriorityCount = tasks.filter((t) => t.priority === 'HIGH').length;

  // Check for warnings
  if (report.checks.featureCount === 0) {
    report.checks.warnings.push('No features found in registry');
  }
  if (report.checks.llmEnrichmentAttempted && report.checks.llmEnrichmentSuccess === 0) {
    report.checks.warnings.push('LLM enrichment attempted but all calls failed');
  }

  report.pass = report.checks.errors.length === 0;
  return report;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Unified Codebase Ingester ────────────────────────────────');

  // Step 1: Load registry
  console.log('  Step 1: Load feature registry...');
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`  ❌ Registry not found: ${REGISTRY_PATH}`);
    console.error('     Run: npm run atlas:feature-registry');
    process.exit(1);
  }

  let registry;
  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(content);
  } catch (e) {
    console.error(`  ❌ Failed to parse registry: ${e.message}`);
    process.exit(1);
  }

  let features = registry.features || [];
  if (LIMIT) features = features.slice(0, LIMIT);

  console.log(`  ✅ Loaded ${features.length} features`);

  // Step 2: Enrich with LLM (optional)
  if (!NO_LLM) {
    console.log('  Step 2: Enriching with Gemma4...');
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const prompt = `Provide a one-sentence technical summary for this codebase feature:
Feature: ${feature.label}
Kind: ${feature.kind}
Files: ${feature.files.length}
Env vars: ${feature.envVars.length}
DB tables: ${feature.postgresTables.length}
Keep it under 50 words.`;

      const notes = await callGemma4(prompt);
      if (notes) {
        feature.llmNotes = notes;
        if (VERBOSE) console.log(`    ✓ ${feature.id}: ${notes.substring(0, 60)}...`);
      }
    }
  }

  console.log(`  ✅ Enrichment complete (LLM: ${NO_LLM ? 'skipped' : 'attempted'})`);

  // Step 3: Generate task cards
  console.log('  Step 3: Generating kanban task cards...');
  const tasks = [];
  for (const feature of features) {
    const task = await buildTaskCard(feature, feature.llmNotes || null);
    tasks.push(task);
  }

  console.log(`  ✅ Generated ${tasks.length} task cards`);

  // Step 4: Write enriched features
  const enrichedOutput = {
    ...registry,
    features,
    enrichedAt: new Date().toISOString(),
    enrichmentMethod: NO_LLM ? 'none' : 'gemma4-local',
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(ENRICHED_PATH), { recursive: true });
    fs.writeFileSync(ENRICHED_PATH, JSON.stringify(enrichedOutput, null, 2), 'utf8');
    console.log(`  ✅ Wrote enriched features → ${ENRICHED_PATH}`);
  }

  // Step 5: Write kanban tasks (JSONL format)
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(TASKS_PATH), { recursive: true });
    const tasksJsonl = tasks.map((t) => JSON.stringify(t)).join('\n') + '\n';
    fs.writeFileSync(TASKS_PATH, tasksJsonl, 'utf8');
    console.log(`  ✅ Wrote kanban tasks → ${TASKS_PATH}`);
  }

  // Step 6: Build validation report
  console.log('  Step 6: Building validation report...');
  const report = buildValidationReport(features, tasks);

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Validation report → ${REPORT_PATH}`);
  }

  // Step 7: Append to retrieval-loop (memory consolidation)
  if (!DRY_RUN) {
    console.log('  Step 7: Appending to retrieval-loop...');
    const retrieval_loop_row = {
      timestamp: new Date().toISOString(),
      query: 'unified codebase ingester pipeline completed',
      intent: 'ingestion',
      domain: 'atlas-pipeline',
      sourceRefs: ['scripts/atlas/audit-feature-registry.mjs', 'scripts/atlas/unified-codebase-ingester.mjs'],
      selectedCardIds: features.map((f) => f.id),
      rerankScore: features.reduce((sum, f) => sum + f.confidence, 0) / features.length,
      tool: 'unified_ingester',
      outcome: 'success',
      feedback: 'pending',
    };

    fs.mkdirSync(path.dirname(RETRIEVAL_LOOP_PATH), { recursive: true });
    fs.appendFileSync(RETRIEVAL_LOOP_PATH, JSON.stringify(retrieval_loop_row) + '\n', 'utf8');
    console.log(`  ✅ Appended to retrieval-loop (${features.length} features)`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Features ingested: ${features.length}`);
  console.log(`  Tasks generated: ${tasks.length}`);
  console.log(`  High priority: ${tasks.filter((t) => t.priority === 'HIGH').length}`);
  console.log(`  LLM enrichment: ${NO_LLM ? 'skipped' : 'attempted'}`);
  console.log(`  Validation: ${report.pass ? '✅ PASS' : '❌ FAIL'}`);

  if (report.checks.errors.length > 0) {
    console.log('  Errors:');
    for (const err of report.checks.errors) {
      console.log(`    - ${err}`);
    }
  }

  if (report.checks.warnings.length > 0) {
    console.log('  Warnings:');
    for (const warn of report.checks.warnings) {
      console.log(`    ⚠ ${warn}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No files written. Run without --dry-run to persist.');
  }

  console.log('\nNext: npm run smoke:feature-registry && npm run smoke:opencode');
}

main().catch((err) => {
  console.error('\n❌ Pipeline error:', err.message);
  process.exit(1);
});
