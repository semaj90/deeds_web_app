#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return value ? resolve(repoRoot, value) : resolve(repoRoot, fallback);
}

const runRoot = option('run-root', 'docs/.okf/dev/context-engineering-docs-v1/run-20261006');
const outputPath = option('output', relative(repoRoot, join(runRoot, 'topic-extractions.jsonl')));
const reportPath = option('report', relative(repoRoot, join(runRoot, 'topic-extraction-receipt.json')));
const topicRules = [
  ['ACE_CONTEXT_PACKET', /\b(?:ACE|ContextManifest|context packet|packet assembler|packet materializer)\b/i],
  ['BITFROST_CACHE_RESIDENCY', /\b(?:BitFrost|residency|prefill cache|inference cache|token cache|bucket warming)\b/i],
  ['REDIS_VALKEY_CACHE', /\b(?:Redis|Valkey|TTL|client-side caching|invalidation|keyspace)\b/i],
  ['DOMAIN_TAXONOMY_ONTOLOGY', /\b(?:domain classification|domain_class|taxonomy|ontology|OAKlib|SSSOM|OntologyLinkedTupleV1|linked tuple)\b/i],
  ['SOURCE_AND_WORKSPACE_LINEAGE', /\b(?:sourceRevision|source revision|workspaceRevision|workspace revision|representationRevision|producerRevision|graphRevision)\b/i],
  ['SERIALIZATION_AND_RPC', /\b(?:MessagePack|msgpack|protobuf|Protocol Buffers|gRPC|RPC|bit encoding|bitencoding)\b/i],
  ['BATCH_DATA_INTERCHANGE', /\b(?:DuckDB|JSONL|NDJSON|Parquet|Arrow IPC)\b/i],
  ['CONTEXT_AND_PROMPT_ENGINEERING', /\b(?:context engineering|prompt engineering|context window|tool output|multi-agent context)\b/i],
  ['TASK_DAG_AND_SYNTHESIS', /\b(?:TaskDependencyDag|ContextDagPlan|DAG synthesis|bounded workflow|agentic error fixing)\b/i],
  ['SEMANTIC_768_AND_EMBEDDING_RECIPE', /\b(?:EmbeddingGemma|semantic_768|embedding recipe|query embedding|document embedding|pooling|tokenizer revision)\b/i],
  ['POSTGRES_PGVECTOR_RETRIEVAL', /\b(?:pgvector|vector_cosine_ops|HNSW|IVFFlat|exact nearest neighbor)\b/i],
  ['CUML_KMEANS_ROUTING', /\b(?:cuML|KMeans|k-means|centroid routing|cluster centers|cluster centroids)\b/i],
  ['ONTOLOGY_TOOLING', /\b(?:OAKlib|Ontology Access Kit|SSSOM|ontology adapter|ontology validation)\b/i],
  ['STRUCTURAL_CODE_ANALYSIS', /\b(?:Tree-sitter|tree sitter|AST-grep|ast-grep|CST|concrete syntax tree|symbol resolution)\b/i],
  ['JSON_STREAM_PARSING', /\b(?:simdjson|JSONL|NDJSON|streaming JSON|JSON parsing)\b/i],
];

const internalSources = [
  'docs/.okf/architecture/domain-classification-and-agentic-retrieval-v1.md',
  'docs/architecture/cold-warm-hot-packet-lifecycle.md',
  'docs/architecture/grpc-binary-memory-registry-plan.md',
  'docs/architecture/AGENTIC-ERROR-FIXING-ARCHITECTURE.md',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function listMarkdown(directory) {
  const found = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path);
    }
  }
  return found.sort();
}

function paragraphs(source) {
  const items = [];
  const pattern = /\S[\s\S]*?(?=\r?\n\s*\r?\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    const text = match[0].trim();
    if (!text) continue;
    const leading = match[0].indexOf(text);
    const startChar = match.index + leading;
    const endChar = startChar + text.length;
    items.push({ text, startChar, endChar });
  }
  return items;
}

async function main() {
  const rawRoot = join(runRoot, 'raw');
  const externalFiles = await listMarkdown(rawRoot).catch(() => []);
  const inputFiles = [
    ...externalFiles.map((path) => ({ path, sourceKind: 'EXTERNAL_DOC_CANDIDATE' })),
    ...internalSources.map((path) => ({ path: resolve(repoRoot, path), sourceKind: 'REPO_DOC_REFERENCE' })),
  ];
  const producerRevision = `sha256:${sha256(await readFile(fileURLToPath(import.meta.url)))}`;
  const extracted = [];
  let inputsRead = 0;
  for (const input of inputFiles) {
    let sourceBytes;
    try {
      sourceBytes = await readFile(input.path);
    } catch {
      continue;
    }
    inputsRead += 1;
    const source = sourceBytes.toString('utf8');
    const sourceRevision = `sha256:${sha256(sourceBytes)}`;
    const sourceRef = input.sourceKind === 'REPO_DOC_REFERENCE'
      ? relative(repoRoot, input.path).replaceAll('\\', '/')
      : relative(runRoot, input.path).replaceAll('\\', '/');
    for (const paragraph of paragraphs(source)) {
      const matchedTopics = topicRules
        .filter(([, expression]) => expression.test(paragraph.text))
        .map(([topic]) => topic);
      if (!matchedTopics.length) continue;
      const startByte = Buffer.byteLength(source.slice(0, paragraph.startChar), 'utf8');
      const endByte = Buffer.byteLength(source.slice(0, paragraph.endChar), 'utf8');
      const exactBytes = sourceBytes.subarray(startByte, endByte).toString('utf8');
      if (exactBytes !== paragraph.text) throw new Error(`span_mismatch:${sourceRef}:${startByte}`);
      const evidence = {
        text: paragraph.text,
        startChar: paragraph.startChar,
        endChar: paragraph.endChar,
        startByte,
        endByte,
        charSliceExact: source.slice(paragraph.startChar, paragraph.endChar) === paragraph.text,
        byteSliceExact: exactBytes === paragraph.text,
      };
      const base = {
        schema: 'okf.context-topic-observation.v1',
        sourceKind: input.sourceKind,
        sourceRef,
        sourceRevision,
        workspaceRevision: null,
        representationRevision: null,
        producerRevision,
        topics: matchedTopics,
        evidence,
        inputChecksum: sourceRevision,
        canonicalAuthority: false,
      };
      extracted.push({ ...base, outputChecksum: `sha256:${sha256(JSON.stringify(base))}` });
    }
  }
  if (!inputsRead) throw new Error(`no_inputs_found:${rawRoot}`);
  const outputDirectory = dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${extracted.map((item) => JSON.stringify(item)).join('\n')}\n`, { flag: 'wx' });
  const topicCounts = Object.fromEntries(topicRules.map(([topic]) => [topic, extracted.filter((item) => item.topics.includes(topic)).length]));
  const receipt = {
    schema: 'okf.context-topic-extraction-receipt.v1',
    mode: 'READ_ONLY_NONCANONICAL',
    inputsRead,
    observationCount: extracted.length,
    topicCounts,
    sourceKinds: Object.fromEntries([...new Set(extracted.map((item) => item.sourceKind))].map((kind) => [kind, extracted.filter((item) => item.sourceKind === kind).length])),
    exactCharAndByteSpans: extracted.every((item) => item.evidence.charSliceExact && item.evidence.byteSliceExact),
    outputPath: relative(repoRoot, outputPath).replaceAll('\\', '/'),
    writesPerformed: ['local_diagnostic_artifacts_only'],
    canonicalAuthority: false,
  };
  await writeFile(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
}

await main();
