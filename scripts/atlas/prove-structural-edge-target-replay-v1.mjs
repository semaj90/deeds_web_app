#!/usr/bin/env node
/** Read-only single-edge replay for CSGR-2 timeout diagnostics. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';

const root = REPO_ROOT;
const frontendRoot = path.join(root, 'sveltekit-frontend');
const inputPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const outputPath = path.join(root, 'docs/reports/structural-edge-target-replay-v1.json');
const sourceRef = process.env.ATLAS_CSGR2_REPLAY_SOURCE_REF ?? 'sveltekit-frontend/scripts/atlas/codebase-ingester-unified.mjs';
const edgeType = process.env.ATLAS_CSGR2_REPLAY_EDGE_TYPE ?? 'CALLS';
const toEvidenceKey = process.env.ATLAS_CSGR2_REPLAY_TO ?? 'path.join';
const timeoutMs = Math.max(250, Math.min(15000, Number(process.env.ATLAS_CSGR2_REPLAY_TIMEOUT_MS ?? 15000)));

function languageForSourceRef(ref) {
  if (/\.(tsx?|mts|cts)$/.test(ref)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(ref)) return 'javascript';
  if (/\.svelte$/.test(ref)) return 'svelte';
  return null;
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function main() {
  const artifact = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const edge = (artifact.unresolvedEdges ?? []).find((candidate) => (
    candidate.sourceRef === sourceRef && candidate.type === edgeType && candidate.toEvidenceKey === toEvidenceKey
  ));
  if (!edge) throw new Error(`STRUCTURAL_EDGE_REPLAY_EDGE_NOT_FOUND:${sourceRef}:${edgeType}:${toEvidenceKey}`);
  const language = languageForSourceRef(sourceRef);
  if (!language) throw new Error(`STRUCTURAL_EDGE_REPLAY_UNSUPPORTED_LANGUAGE:${sourceRef}`);
  const absolutePath = path.join(root, sourceRef);
  const sourceBuffer = fs.readFileSync(absolutePath);
  const resolver = createCompilerSemanticResolver({ workspaceRoot: frontendRoot });
  const startedAt = Date.now();
  let resolution;
  try {
    resolution = await resolver.resolveDefinition({
      requestId: `csgr2-target-replay:${sourceRef}:${edge.fromEvidenceKey}:${toEvidenceKey}`,
      workspaceRevision: artifact.workspaceRevision,
      sourceRef,
      sourceRevision: edge.sourceRevision ?? null,
      sourceAbsolutePath: absolutePath,
      sourceBuffer,
      sourceText: sourceBuffer.toString('utf8'),
      position: { line: edge.evidenceStartLine - 1, character: edge.evidenceStartColumn },
      edgeType,
      sourceEvidenceRef: toEvidenceKey,
      language,
      timeoutMs,
    });
  } finally {
    await resolver.dispose();
  }
  const replay = {
    schema: 'atlas.structural-edge-target-replay.v1',
    mode: 'READ_ONLY_SINGLE_EDGE_REPLAY',
    generatedAt: new Date().toISOString(),
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphArtifacts: false },
    canonicalAuthority: false,
    sourceRef,
    sourceRevision: edge.sourceRevision ?? null,
    workspaceRevision: artifact.workspaceRevision ?? null,
    edgeType,
    fromEvidenceKey: edge.fromEvidenceKey,
    toEvidenceKey,
    evidencePosition: { line: edge.evidenceStartLine, column: edge.evidenceStartColumn },
    timeoutMs,
    durationMs: Date.now() - startedAt,
    resolver: resolution.resolver ?? null,
    result: resolution.result,
  };
  replay.replayChecksum = checksum(replay);
  fs.writeFileSync(outputPath, `${JSON.stringify(replay, null, 2)}\n`);
  console.log(JSON.stringify({
    status: replay.result.status === 'RESOLVED_IN_REPO' ? 'STRUCTURAL_EDGE_TARGET_REPLAY_PROVEN' : 'STRUCTURAL_EDGE_TARGET_REPLAY_RECORDED',
    sourceRef, edgeType, toEvidenceKey, result: replay.result.status,
    targetCount: replay.result.targets.length, durationMs: replay.durationMs,
    writes: replay.writes, reportPath: path.relative(root, outputPath),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
