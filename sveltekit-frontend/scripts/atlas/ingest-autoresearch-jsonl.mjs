#!/usr/bin/env node
import { appendFileSync, createReadStream, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';

const FORBIDDEN_FIELDS = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function rejectForbidden(payload) {
  const serialized = JSON.stringify(payload);
  for (const key of FORBIDDEN_FIELDS) {
    if (serialized.includes(`\"${key}\"`)) {
      throw new Error(`Forbidden field in payload: ${key}`);
    }
  }
}

function normalizeRecord(record) {
  const now = new Date().toISOString();
  const sourceRefs = Array.isArray(record.sourceRefs)
    ? record.sourceRefs.map((value) => String(value)).filter(Boolean).slice(0, 50)
    : [];

  const normalized = {
    runId: String(record.runId ?? `autoresearch_${Date.now()}`),
    query: String(record.query ?? ''),
    summary: String(record.summary ?? ''),
    sourceRefs,
    tags: Array.isArray(record.tags)
      ? record.tags.map((value) => String(value).toLowerCase()).filter(Boolean).slice(0, 20)
      : [],
    trustTier: String(record.trustTier ?? 'external_unverified'),
    model: String(record.model ?? 'unknown'),
    createdAt: String(record.createdAt ?? now),
    datasetTimestamp: now,
  };

  rejectForbidden(normalized);
  return normalized;
}

async function ingest(inputPath, outputPath, dryRun) {
  const reader = createInterface({
    input: createReadStream(inputPath, 'utf8'),
    crlfDelay: Infinity,
  });

  let accepted = 0;
  let rejected = 0;
  const preview = [];

  for await (const line of reader) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const normalized = normalizeRecord(parsed);
      if (dryRun) {
        if (preview.length < 5) preview.push(normalized);
      } else {
        appendFileSync(outputPath, JSON.stringify(normalized) + '\n', 'utf8');
      }
      accepted += 1;
    } catch {
      rejected += 1;
    }
  }

  return { accepted, rejected, preview };
}

async function main() {
  const input = arg('input');
  if (!input) {
    console.error('Usage: node scripts/atlas/ingest-autoresearch-jsonl.mjs --input <file.jsonl> [--dry-run]');
    process.exit(1);
  }

  const dryRun = hasFlag('dry-run');
  const rootDir = process.cwd().endsWith('sveltekit-frontend')
    ? resolve(process.cwd(), '..')
    : process.cwd();

  const datasetDir = join(rootDir, 'memory', 'datasets', 'autoresearch');
  mkdirSync(datasetDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const outputPath = join(datasetDir, `${today}.jsonl`);

  const result = await ingest(resolve(input), outputPath, dryRun);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        input: resolve(input),
        output: outputPath,
        accepted: result.accepted,
        rejected: result.rejected,
        preview: result.preview,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[ingest-autoresearch-jsonl] fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
