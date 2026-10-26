// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_QDRANT_COLLECTION } from '../embedding/embedding-contract-768.js';
import { runRepositoryProvenanceWorkflow } from './repository-provenance-workflow.js';

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase109b-repo-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'src', 'example.ts'),
    [
      "import { readFileSync } from 'node:fs';",
      '',
      'export function helloWorld(name: string) {',
      "  return `${name}:${readFileSync ? 'ok' : 'missing'}`;",
      '}',
      '',
      'export const VALUE = 42;',
      '',
    ].join('\n'),
  );
  fs.copyFileSync(path.join(root, 'src', 'example.ts'), path.join(root, 'src', 'example-copy.ts'));

  fs.writeFileSync(
    path.join(root, 'docs', 'README.md'),
    '# Phase 109B\n',
  );

  return root;
}

describe('repository provenance workflow', () => {
  it('runs the provenance workflow end to end and reuses the prior snapshot', async () => {
    const repoRoot = makeTempRepo();
    const outputDir = path.join(repoRoot, '.tmp', 'phase109b');
    const corpusPath = path.resolve(process.cwd(), '..', 'scripts', 'eval', 'data', 'labeled_queries.json');

    const embedder = async () => ({
      model: 'mock-embedder',
      source: 'mock',
      embedding: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
    });

    const first = await runRepositoryProvenanceWorkflow({
      repoRoot,
      outputDir,
      queryCorpusPath: corpusPath,
      semanticSampleLimit: 4,
      embedder,
    });

    expect(first.stages.snapshot.totalFiles).toBeGreaterThanOrEqual(3);
    expect(first.stages.inventory.codeFiles).toBeGreaterThanOrEqual(1);
    expect(first.stages.structural.factCount).toBeGreaterThan(0);
    expect(first.stages.identity.duplicateIds).toBe(0);
    expect(first.stages.validation.duplicateFileHashes).toBeGreaterThan(0);
    expect(first.stages.validation.pass).toBe(true);
    expect(first.stages.semantic.embeddedFiles).toBeGreaterThan(0);
    expect(first.stages.gpu).toMatchObject({
      status: 'SKIPPED',
      embeddingProbeCount: 0,
      embeddingProbeHits: 0,
      analysisMode: 'unavailable',
      reason: 'GPU_EXECUTOR_NOT_INVOKED',
    });
    expect(first.stages.projection).toMatchObject({
      status: 'SKIPPED',
      postgresCanonicalRecords: 0,
      qdrantProjectionRecords: 0,
      neo4jProjectionRecords: 0,
      redisProjectionRecords: 0,
      candidateCounts: { sources: first.stages.snapshot.totalFiles },
      reason: 'PROJECTION_WRITERS_NOT_INVOKED',
    });
    expect(first.stages.relationships.entries).toBeGreaterThan(0);
    expect(first.stages.validation.pass).toBe(true);
    expect(first.stages.evaluation.totalQueries).toBeGreaterThan(0);
    expect(fs.existsSync(first.outputs.latestReportPath)).toBe(true);
    expect(fs.existsSync(first.outputs.markdownReportPath)).toBe(true);

    const second = await runRepositoryProvenanceWorkflow({
      repoRoot,
      outputDir,
      queryCorpusPath: corpusPath,
      semanticSampleLimit: 4,
      embedder,
    });

    expect(second.stages.incremental.priorReportFound).toBe(true);
    expect(second.stages.incremental.reusedFiles).toBeGreaterThan(0);
    // Single source: the declared embedding contract (a literal here drifted from it; whether the
    // contract should name the _v2 collection is an open owner decision, not a spec concern).
    expect(second.stages.projection.collectionName).toBe(CANONICAL_QDRANT_COLLECTION);
    expect(second.stages.projection.denseVectorName).toBe('content');

    const latest = JSON.parse(fs.readFileSync(second.outputs.latestReportPath, 'utf8'));
    expect(latest.runId).toBe(second.runId);
    expect(Array.isArray(latest.stages.structural.samples)).toBe(true);
  });
});
