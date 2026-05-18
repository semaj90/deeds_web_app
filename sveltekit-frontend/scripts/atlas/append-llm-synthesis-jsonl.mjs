#!/usr/bin/env node
/**
 * append-llm-synthesis-jsonl.mjs
 *
 * Append a single LLM synthesis event row to the daily JSONL training dataset.
 * Used by standalone scripts and smoke tests that cannot import SvelteKit modules.
 *
 * Usage:
 *   node scripts/atlas/append-llm-synthesis-jsonl.mjs --dry-run
 *   node scripts/atlas/append-llm-synthesis-jsonl.mjs --runId synth_abc --query "test" --profile code_debug --model gemma4-legal
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FORBIDDEN_FIELDS = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function assertNoForbiddenFields(obj) {
  const str = JSON.stringify(obj);
  for (const f of FORBIDDEN_FIELDS) {
    if (str.includes(`"${f}"`)) {
      throw new Error(`Security constraint: field "${f}" must not appear in synthesis logs.`);
    }
  }
}

function buildRow(params) {
  assertNoForbiddenFields(params.acePacket ?? {});
  assertNoForbiddenFields(params.toolCalls ?? []);
  assertNoForbiddenFields(params.sourceRefs ?? []);

  const now = new Date().toISOString();
  return {
    runId: params.runId,
    sessionId: params.sessionId ?? null,
    userId: params.userId ?? null,
    authUserId: params.authUserId ?? null,
    query: params.query,
    profile: params.profile,
    acePacket: params.acePacket ?? {},
    toolCalls: params.toolCalls ?? [],
    sourceRefs: params.sourceRefs ?? [],
    cacheKeys: params.cacheKeys ?? {},
    trustTier: params.trustTier ?? null,
    model: params.model,
    validation: params.validation ?? {},
    createdAt: now,
    datasetTimestamp: now,
  };
}

function appendRow(row, rootDir) {
  const today = row.datasetTimestamp.split('T')[0];
  const datasetDir = join(rootDir, 'memory', 'datasets', 'llm_synthesis');
  mkdirSync(datasetDir, { recursive: true });
  const filePath = join(datasetDir, `${today}.jsonl`);
  appendFileSync(filePath, JSON.stringify(row) + '\n', 'utf8');
  return filePath;
}

const dryRun = hasFlag('dry-run');

const params = {
  runId: arg('runId') ?? `synth_${Date.now()}`,
  sessionId: arg('sessionId') ?? undefined,
  userId: arg('userId') ? Number(arg('userId')) : undefined,
  authUserId: arg('authUserId') ?? undefined,
  query: arg('query') ?? 'smoke test query',
  profile: arg('profile') ?? 'code_debug',
  acePacket: arg('acePacket') ? JSON.parse(arg('acePacket')) : { lanes: ['qdrant_768d'] },
  toolCalls: arg('toolCalls') ? JSON.parse(arg('toolCalls')) : [],
  sourceRefs: arg('sourceRefs') ? JSON.parse(arg('sourceRefs')) : [],
  cacheKeys: arg('cacheKeys') ? JSON.parse(arg('cacheKeys')) : {},
  trustTier: arg('trustTier') ?? 'local_code_plus_official_docs',
  model: arg('model') ?? 'gemma4-legal',
  validation: arg('validation') ? JSON.parse(arg('validation')) : {},
};

const row = buildRow(params);

if (dryRun) {
  console.log('🔍 Dry-run — row that would be appended:');
  console.log(JSON.stringify(row, null, 2));
  console.log('\n✅ Dry-run complete — no file written.');
} else {
  const rootDir = process.cwd().endsWith('sveltekit-frontend')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const filePath = appendRow(row, rootDir);
  console.log(`✅ Appended JSONL row to ${filePath}`);
  console.log(`   runId: ${row.runId}`);
  console.log(`   profile: ${row.profile}`);
  console.log(`   model: ${row.model}`);
}
