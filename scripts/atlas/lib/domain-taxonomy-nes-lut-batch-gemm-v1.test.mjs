import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_DOMAINS,
  NES_LUT_DOMAIN_PALETTE,
  FEATURE_MATRIX_COLS_25,
  GEMM_OUT_DIM_64,
  classifyTextWithNesLutSubHelper,
  DomainDictLinkedList,
  BatchFeatureMatrixDatasetV1,
  runTensorRtRtxBatchGemmBridge,
  compareSvelteKitLlmsTxtVsOkfPinnedBatchGemm,
} from './domain-taxonomy-nes-lut-batch-gemm-v1.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

test('shared palette reserves zero for unresolved and matches the generated artifact', () => {
  const artifact = JSON.parse(readFileSync(resolve(ROOT, 'scripts/atlas/data/nes-domain-palette-v1.json'), 'utf8'));
  assert.equal(artifact.schema, 'atlas.nes-domain-palette.v1');
  const { checksum, ...unsignedArtifact } = artifact;
  assert.equal(checksum, `sha256:${createHash('sha256').update(JSON.stringify(unsignedArtifact)).digest('hex')}`);
  assert.equal(artifact.unresolved.lutByte, 0x00);
  assert.deepEqual(artifact.domains, NES_LUT_DOMAIN_PALETTE);
  assert.equal(artifact.domains.general.lutByte, 0x0A);
  assert.equal(artifact.subLabels.svelte5_runes.domain, 'ui');
  assert.equal(artifact.subLabels.svelte5_runes.nesHex, '0x2A');
  assert.equal(new Set(Object.values(artifact.domains).map(({ lutByte }) => lutByte)).size, 10);
});

test('classifyTextWithNesLutSubHelper maps Svelte 5 runes to ui and keeps 0x2A as NES color', () => {
  const rec = classifyTextWithNesLutSubHelper({
    chunk_id: 'doc:svelte5:1',
    source_url: 'https://svelte.dev/docs/svelte/$state',
    text: 'Use let count = $state(0) and $derived(count * 2) inside a Svelte 5 component button onclick modal.',
    heading_path: ['Runes', '$state'],
    code_blocks: [{ language: 'ts', code: 'let count = $state(0);' }],
    start_byte: 0,
    end_byte: 96,
  });
  assert.equal(rec.primaryDomain, 'ui');
  assert.equal(rec.nesHex, '0x2A');
  assert.equal(rec.lutByte, 0x02);
  assert.equal(rec.canonicalAuthority, false);
  assert.ok(rec.structural.hasByteSpan);
});

test('DomainDictLinkedList deserializes JSON batches into O(1) doubly-linked domain chains', () => {
  const list = new DomainDictLinkedList();
  const batch = [
    JSON.stringify({
      chunk_id: 'c1',
      text: 'PostgreSQL 18 drizzle schema migration table gin index select',
      start_byte: 0,
      end_byte: 60,
    }),
    JSON.stringify({
      chunk_id: 'c2',
      text: 'PostgreSQL transaction sql query column row hnsw brin index',
      start_byte: 61,
      end_byte: 120,
    }),
    JSON.stringify({
      chunk_id: 'c3',
      text: 'Redis Valkey bitfrost cache ttl lru indexeddb hydrate ssr',
      start_byte: 121,
      end_byte: 180,
    }),
  ];

  const ids = list.ingestJsonBatch(batch);
  assert.deepEqual(ids, ['c1', 'c2', 'c3']);

  const dbChain = list.traverseDomainChain('database');
  assert.equal(dbChain.length, 2);
  assert.equal(dbChain[0].id, 'c1');
  assert.equal(dbChain[0].prevKey, null);
  assert.equal(dbChain[0].nextKey, 'c2');
  assert.equal(dbChain[1].id, 'c2');
  assert.equal(dbChain[1].prevKey, 'c1');
  assert.equal(dbChain[1].nextKey, null);
});

test('BatchFeatureMatrixDatasetV1 collates [B, 25] Float32 tensor and executes TensorRT-RTX [B, 64] GEMM', () => {
  const list = new DomainDictLinkedList();
  list.ingestJsonBatch([
    { chunk_id: 'n1', text: 'Qdrant vector embedding retrieval search rank rrf bm25' },
    { chunk_id: 'n2', text: 'PyTorch ATen tensorrt gemm cuda xgboost model inference' },
    { chunk_id: 'n3', text: 'Svelte 5 $state $derived $props component button dialog' },
    { chunk_id: 'n4', text: 'Neo4j cuGraph pagerank louvain community graph traversal' },
  ]);

  const dataset = new BatchFeatureMatrixDatasetV1([...list.nodesById.values()]);
  assert.equal(dataset.length, 4);

  const collated = dataset.collateBatch(0, 4);
  assert.equal(collated.batchSize, 4);
  assert.equal(collated.featureCols, FEATURE_MATRIX_COLS_25);
  assert.equal(collated.byteLength, 4 * 25 * 4);
  assert.equal(collated.dmaAligned4Byte, true);
  assert.equal(collated.pytorchDataLoaderSpec.pinMemory, true);

  const gemm = runTensorRtRtxBatchGemmBridge(collated);
  assert.deepEqual(gemm.inputShape, [4, 25]);
  assert.deepEqual(gemm.weightShape, [25, GEMM_OUT_DIM_64]);
  assert.deepEqual(gemm.outputShape, [4, GEMM_OUT_DIM_64]);
  assert.equal(gemm.allFinite, true);
  assert.equal(CANONICAL_DOMAINS.length, 9);
});

test('compareSvelteKitLlmsTxtVsOkfPinnedBatchGemm compares sveltekit.llms-full.txt vs 346 OKF pinned chunks', () => {
  const cmp = compareSvelteKitLlmsTxtVsOkfPinnedBatchGemm(ROOT);
  assert.ok(cmp.llmsTxtSummary.sectionCount >= 3);
  assert.equal(cmp.okfPinnedSummary.sveltekitChunks, 233);
  assert.equal(cmp.okfPinnedSummary.svelte5RunesChunks, 113);
  assert.equal(cmp.okfPinnedSummary.totalChunksIngested, 346);
  assert.equal(cmp.pytorchCollateVerification.batchSize, 32);
  assert.equal(cmp.pytorchCollateVerification.featureCols, 25);
  assert.equal(cmp.tensorRtRtxGemmVerification.allFinite, true);
});
