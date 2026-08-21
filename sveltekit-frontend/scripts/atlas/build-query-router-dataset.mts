#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION,
  formatEmbeddingGemmaClassificationInput,
} from '../../src/lib/server/atlas/neural-routing/query-classification-v2.js';
import {
  QUERY_FEATURE_CONTRACT_REVISION,
  flattenQueryFeaturesV1,
  projectQueryFeaturesV1,
} from '../../src/lib/server/atlas/neural-routing/query-feature-projection-v1.js';
import {
  QueryRouterDatasetRowV1Schema,
  QueryRouterSeedV1Schema,
  flattenQueryRouterRetrievalNeedsV1,
  normalizeQueryRouterBudgetTargetsV1,
  sha256QueryRouterValueV1,
} from '../../src/lib/server/atlas/neural-routing/query-router-dataset-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const DEFAULT_OUT = path.resolve(FRONTEND, 'classifier-datasets/query-router-v1.jsonl');
const DEFAULT_RECEIPT = path.resolve(FRONTEND, '../docs/reports/query-router-dataset-export.json');
const MRL_PROJECTION_REVISION = 'embeddinggemma-classification-mrl-prefix128-l2-v1';

type Provider = 'ollama' | 'openai';
type Args = { input: string; output: string; receipt: string; provider: Provider; url: string; model: string; modelRevision: string; timeoutMs: number; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>(); let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') { dryRun = true; continue; }
    if (!token.startsWith('--')) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    map.set(token, value); i += 1;
  }
  const provider = (map.get('--provider') ?? 'ollama') as Provider;
  if (provider !== 'ollama' && provider !== 'openai') throw new Error(`Unsupported provider: ${provider}`);
  const input = map.get('--input'); if (!input) throw new Error('--input <seed.jsonl> is required');
  const defaultUrl = provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:8081';
  return { input: path.resolve(input), output: path.resolve(map.get('--output') ?? DEFAULT_OUT), receipt: path.resolve(map.get('--receipt') ?? DEFAULT_RECEIPT), provider, url: (map.get('--url') ?? defaultUrl).replace(/\/$/, ''), model: map.get('--model') ?? (provider === 'ollama' ? 'embeddinggemma:latest' : 'embeddinggemma'), modelRevision: map.get('--model-revision') ?? 'UNBOUND', timeoutMs: Number(map.get('--timeout-ms') ?? '30000'), dryRun };
}
function sha256(input: string | Buffer): string { return createHash('sha256').update(input).digest('hex'); }
function parseJsonl(text: string): unknown[] { const rows: unknown[] = []; for (const [index, line] of text.split(/\r?\n/).entries()) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${(error as Error).message}`); } } return rows; }
function assertNativeEmbedding768(values: unknown): number[] { if (!Array.isArray(values) || values.length !== 768) throw new Error(`EMBEDDINGGEMMA_CLASSIFICATION_768_REQUIRED: received ${Array.isArray(values) ? values.length : typeof values}`); const vector = values.map(Number); if (vector.some((value) => !Number.isFinite(value))) throw new Error('EMBEDDINGGEMMA_CLASSIFICATION_NON_FINITE'); const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); if (!Number.isFinite(norm) || norm <= 1e-12) throw new Error('EMBEDDINGGEMMA_CLASSIFICATION_ZERO_NORM'); return vector; }
function projectMrl128(native768: readonly number[]): number[] { if (native768.length !== 768) throw new Error('EMBEDDINGGEMMA_CLASSIFICATION_768_REQUIRED'); const out = native768.slice(0, 128); const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0)); if (!Number.isFinite(norm) || norm <= 1e-12) throw new Error('EMBEDDINGGEMMA_CLASSIFICATION_MRL_ZERO_NORM'); return out.map((value) => value / norm); }

async function embedClassification(text: string, args: Args): Promise<number[]> {
  const input = formatEmbeddingGemmaClassificationInput(text);
  if (args.provider === 'ollama') {
    const response = await fetch(`${args.url}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: args.model, input }), signal: AbortSignal.timeout(args.timeoutMs) });
    if (!response.ok) throw new Error(`OLLAMA_EMBED_HTTP_${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json() as { embeddings?: unknown[] }; return assertNativeEmbedding768(data.embeddings?.[0]);
  }
  const response = await fetch(`${args.url}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: args.model, input }), signal: AbortSignal.timeout(args.timeoutMs) });
  if (!response.ok) throw new Error(`OPENAI_EMBED_HTTP_${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { data?: Array<{ embedding?: unknown }> }; return assertNativeEmbedding768(data.data?.[0]?.embedding);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.modelRevision === 'UNBOUND' && !args.dryRun) throw new Error('--model-revision is required for a real dataset export');
  const seedBytes = await readFile(args.input); const rawSeeds = parseJsonl(seedBytes.toString('utf8'));
  const seeds = rawSeeds.map((row, index) => { try { return QueryRouterSeedV1Schema.parse(row); } catch (error) { throw new Error(`Seed row ${index + 1} failed schema validation: ${(error as Error).message}`); } });
  if (seeds.length < 30) throw new Error('QUERY_ROUTER_DATASET_MINIMUM_30_SEEDS_REQUIRED');
  const seenIds = new Set<string>(); const seenDigests = new Set<string>();
  for (const seed of seeds) { if (seenIds.has(seed.queryId)) throw new Error(`QUERY_ROUTER_DUPLICATE_QUERY_ID:${seed.queryId}`); const digest = sha256(seed.query.trim()); if (seenDigests.has(digest)) throw new Error(`QUERY_ROUTER_DUPLICATE_QUERY_TEXT:${seed.queryId}`); seenIds.add(seed.queryId); seenDigests.add(digest); }
  if (args.dryRun) { console.log(JSON.stringify({ status: 'SEED_CONTRACT_PROVEN', rows: seeds.length, input: args.input, inputSha256: sha256(seedBytes), provider: args.provider, model: args.model, writesPerformed: false }, null, 2)); return; }

  const outputLines: string[] = []; const embeddingDigests: string[] = [];
  for (const [index, seed] of seeds.entries()) {
    const native768 = await embedClassification(seed.query, args); const mrl128 = projectMrl128(native768); const queryFeatures = Array.from(flattenQueryFeaturesV1(projectQueryFeaturesV1(seed.query)));
    const row = QueryRouterDatasetRowV1Schema.parse({ schema: 'atlas.query-router-dataset-row.v1', query_id: seed.queryId, query_digest: sha256(seed.query.trim()), query_revision: seed.queryRevision, label_revision: seed.labelRevision, embedding_model_id: 'google/embeddinggemma-300m', embedding_model_revision: args.modelRevision, embedding_prompt_revision: EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION, embedding_source_representation_id: 'classification_768', embedding_representation_id: 'classification_mrl_128', embedding_projection_revision: MRL_PROJECTION_REVISION, embedding_mrl_128: mrl128, query_feature_contract_revision: QUERY_FEATURE_CONTRACT_REVISION, query_features: queryFeatures, domain_label: seed.domainLabel, operation_label: seed.operationLabel, retrieval_needs: flattenQueryRouterRetrievalNeedsV1(seed.retrievalNeeds), budget_targets: normalizeQueryRouterBudgetTargetsV1(seed.budget), evidence_refs: seed.evidenceRefs, source_seed_digest: sha256QueryRouterValueV1(seed), dataset_contract_revision: 'atlas.query-router-dataset.v1', evidenceAuthority: false });
    outputLines.push(JSON.stringify(row)); embeddingDigests.push(sha256(Buffer.from(Float32Array.from(mrl128).buffer))); process.stdout.write(`\r[query-router-dataset] ${index + 1}/${seeds.length}`);
  }
  process.stdout.write('\n'); const outputText = `${outputLines.join('\n')}\n`; await mkdir(path.dirname(args.output), { recursive: true }); await writeFile(args.output, outputText, 'utf8');
  const receiptCore = { schema: 'atlas.query-router-dataset-export-receipt.v1', generatedAt: new Date().toISOString(), inputPath: args.input, inputSha256: sha256(seedBytes), outputPath: args.output, outputSha256: sha256(outputText), rowCount: seeds.length, provider: args.provider, endpoint: args.url, executorModel: args.model, embeddingModelId: 'google/embeddinggemma-300m', embeddingModelRevision: args.modelRevision, embeddingPromptRevision: EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION, sourceRepresentationId: 'classification_768', representationId: 'classification_mrl_128', projectionRevision: MRL_PROJECTION_REVISION, nativeDimension: 768, trainingDimension: 128, queryFeatureContractRevision: QUERY_FEATURE_CONTRACT_REVISION, queryFeatureDimension: 26, embeddingDigestSetSha256: sha256(embeddingDigests.sort().join('\n')), canonicalWritesPerformed: false, qdrantWritesPerformed: false, postgresWritesPerformed: false, valkeyWritesPerformed: false };
  const receipt = { ...receiptCore, receiptSha256: sha256(JSON.stringify(receiptCore)) }; await mkdir(path.dirname(args.receipt), { recursive: true }); await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(receipt, null, 2));
}
main().catch((error) => { console.error('[query-router-dataset] FAILED:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
