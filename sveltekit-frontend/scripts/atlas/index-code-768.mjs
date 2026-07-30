#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stdin, env } from 'node:process';
import { pathToFileURL } from 'node:url';

import { alignCwdToRepoRoot } from '../_repo-root.mjs';

const CANONICAL = {
  representationId: 'embeddinggemma_768_native_v1',
  vectorName: 'dense_768',
  collectionName: 'codebase_chunks_768',
  dimensions: 768,
  normalization: 'l2',
  reduction: 'none',
};

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    dryRun: false,
    apply: false,
    limit: null,
    verbose: false,
    qdrantUrl: env.QDRANT_URL ?? 'http://127.0.0.1:6333',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--input') args.input = argv[++i] ?? null;
    else if (value === '--output') args.output = argv[++i] ?? null;
    else if (value === '--limit') args.limit = Number(argv[++i]);
    else if (value === '--dry-run') args.dryRun = true;
    else if (value === '--apply') args.apply = true;
    else if (value === '--verbose') args.verbose = true;
    else if (value === '--qdrant-url') args.qdrantUrl = argv[++i] ?? args.qdrantUrl;
  }

  return args;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function hashHex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeVector(vector) {
  if (!Array.isArray(vector)) {
    const error = new Error('vector must be an array');
    error.code = 'dimension_not_768';
    throw error;
  }

  if (vector.length === 384) {
    const error = new Error('384-dimensional code indexing is rejected');
    error.code = 'dimension_384_detected';
    throw error;
  }

  if (vector.length !== CANONICAL.dimensions) {
    const error = new Error(`expected exactly ${CANONICAL.dimensions} values`);
    error.code = 'dimension_not_768';
    throw error;
  }

  const values = vector.map((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      const error = new Error(`non-finite value at index ${index}`);
      error.code = 'invalid_vector_value';
      throw error;
    }
    return numeric;
  });

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) {
    const error = new Error('zero-magnitude vectors cannot be normalized');
    error.code = 'invalid_vector_value';
    throw error;
  }

  return values.map((value) => value / norm);
}

function vectorHash(vector) {
  return hashHex(Buffer.from(new Float32Array(vector).buffer));
}

function determinePointId(row, projectionHash) {
  return row.point_id ?? row.pointId ?? row.artifact_id ?? row.artifactId ?? row.packet_key ?? row.packetKey ?? row.source_ref ?? row.sourceRef ?? projectionHash;
}

function buildProjectionHash(row, normalizedVector) {
  return hashHex(
    canonicalJson({
      artifactId: row.artifact_id ?? row.artifactId ?? null,
      embeddingInputHash: row.embedding_input_hash ?? row.embeddingInputHash ?? null,
      normalizedVectorHash: vectorHash(normalizedVector),
      packetKey: row.packet_key ?? row.packetKey ?? null,
      projectionHash: row.projection_hash ?? row.projectionHash ?? null,
      representationId: CANONICAL.representationId,
      sourceContentHash: row.source_content_hash ?? row.sourceContentHash ?? null,
      vectorName: CANONICAL.vectorName,
      workspaceRevision: row.workspace_revision ?? row.workspaceRevision ?? null,
    })
  );
}

function parseRecords(inputText) {
  const trimmed = inputText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readInputRecords(inputPath) {
  if (inputPath) {
    return parseRecords(await readFile(inputPath, 'utf8'));
  }

  if (stdin.isTTY) {
    return [];
  }

  let buffer = '';
  for await (const chunk of stdin) {
    buffer += chunk.toString('utf8');
  }
  return parseRecords(buffer);
}

async function upsertPoints(qdrantUrl, collectionName, points) {
  const response = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ points }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qdrant upsert failed (${response.status} ${response.statusText}): ${text.slice(0, 500)}`);
  }

  return response.json().catch(() => ({}));
}

export async function main(argv = process.argv.slice(2)) {
  alignCwdToRepoRoot();
  const args = parseArgs(argv);
  const records = await readInputRecords(args.input);
  const selected = args.limit ? records.slice(0, args.limit) : records;

  const results = [];
  for (const row of selected) {
    const rawVector = row.vector ?? row.embedding ?? row.values ?? row.content_embedding ?? row.contentEmbedding;
    const normalizedVector = normalizeVector(rawVector);
    const projectionHash = buildProjectionHash(row, normalizedVector);
    const pointId = determinePointId(row, projectionHash);

    const payload = {
      artifact_id: row.artifact_id ?? row.artifactId ?? null,
      embedding_input_hash: row.embedding_input_hash ?? row.embeddingInputHash ?? null,
      packet_key: row.packet_key ?? row.packetKey ?? null,
      projection_hash: projectionHash,
      representation_id: CANONICAL.representationId,
      source_content_hash: row.source_content_hash ?? row.sourceContentHash ?? null,
      source_ref: row.source_ref ?? row.sourceRef ?? null,
      vector_name: CANONICAL.vectorName,
      vector_dimensions: CANONICAL.dimensions,
      workspace_revision: row.workspace_revision ?? row.workspaceRevision ?? null,
    };

    results.push({
      point_id: pointId,
      projection_hash: projectionHash,
      vector_dimensions: CANONICAL.dimensions,
      vector_name: CANONICAL.vectorName,
      payload,
    });
  }

  if (args.output) {
    const lines = results.map((entry) => JSON.stringify(entry)).join('\n') + (results.length ? '\n' : '');
    await import('node:fs/promises').then((fs) => fs.writeFile(args.output, lines, 'utf8'));
  }

  if (!args.dryRun && args.apply) {
    const payloads = selected.map((row) => {
      const normalizedVector = normalizeVector(row.vector ?? row.embedding ?? row.values ?? row.content_embedding ?? row.contentEmbedding);
      const projectionHash = buildProjectionHash(row, normalizedVector);
      return {
        id: determinePointId(row, projectionHash),
        vector: { [CANONICAL.vectorName]: normalizedVector },
        payload: {
          artifact_id: row.artifact_id ?? row.artifactId ?? null,
          embedding_input_hash: row.embedding_input_hash ?? row.embeddingInputHash ?? null,
          packet_key: row.packet_key ?? row.packetKey ?? null,
          projection_hash: projectionHash,
          representation_id: CANONICAL.representationId,
          source_content_hash: row.source_content_hash ?? row.sourceContentHash ?? null,
          source_ref: row.source_ref ?? row.sourceRef ?? null,
          vector_name: CANONICAL.vectorName,
          vector_dimensions: CANONICAL.dimensions,
          workspace_revision: row.workspace_revision ?? row.workspaceRevision ?? null,
        },
      };
    });

    await upsertPoints(args.qdrantUrl, CANONICAL.collectionName, payloads);
  }

  const summary = {
    applied: Boolean(args.apply && !args.dryRun),
    collection: CANONICAL.collectionName,
    dryRun: args.dryRun,
    rejected384: true,
    requested: records.length,
    selected: selected.length,
    vectorName: CANONICAL.vectorName,
  };

  if (args.verbose) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify(summary));
  }

  return summary;
}

const cliPath = process.argv[1];

if (cliPath && import.meta.url === pathToFileURL(cliPath).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = Number(error?.code === 'dimension_384_detected' ? 2 : 1);
  });
}
