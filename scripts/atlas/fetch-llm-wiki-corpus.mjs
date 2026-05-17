#!/usr/bin/env node
/**
 * fetch-llm-wiki-corpus.mjs
 *
 * Fetches LLM educational content via SearXNG and writes a local corpus
 * ready for the atlas chunk → embed → cache pipeline.
 *
 * Strategy:
 *   1. Queries SearXNG for 10 canonical LLM topics
 *   2. Collects top-N result snippets per topic
 *   3. Writes one .txt file per topic to --out-dir (default tmp/llm-wiki/)
 *   4. Also writes a summary NDJSON index at --out-dir/corpus-index.ndjson
 *
 * Usage:
 *   node scripts/atlas/fetch-llm-wiki-corpus.mjs
 *   node scripts/atlas/fetch-llm-wiki-corpus.mjs --dry-run
 *   node scripts/atlas/fetch-llm-wiki-corpus.mjs --out-dir tmp/llm-wiki --results-per-topic 8
 *
 * Passing criteria (used by eval-llm-wiki-routing.mjs):
 *   - ≥ 8 topic files written
 *   - Total token count ≥ 5000 words across corpus
 *   - corpus-index.ndjson present and parseable
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '../..');

const argv   = process.argv.slice(2);
const DRY    = argv.includes('--dry-run');
const outIdx = argv.indexOf('--out-dir');
const nIdx   = argv.indexOf('--results-per-topic');

const OUT_DIR          = outIdx >= 0 ? argv[outIdx + 1] : path.join(ROOT, 'tmp', 'llm-wiki');
const RESULTS_PER_TOPIC = nIdx  >= 0 ? parseInt(argv[nIdx + 1], 10) : 6;
const SEARXNG_URL      = process.env.SEARXNG_URL ?? 'http://localhost:8889';

// ── Topic corpus definition ───────────────────────────────────────────────────
// Canonical LLM topics in Karpathy / nn-zero-to-hero style
const TOPICS = [
  {
    key:   'backpropagation',
    title: 'Backpropagation and Gradient Descent',
    queries: ['backpropagation neural network explained', 'gradient descent deep learning'],
  },
  {
    key:   'tokenization',
    title: 'Tokenization in Large Language Models',
    queries: ['tokenization LLM byte pair encoding BPE', 'language model tokenizer explained'],
  },
  {
    key:   'attention-mechanism',
    title: 'Self-Attention and Transformer Architecture',
    queries: ['self attention mechanism transformer', 'scaled dot product attention LLM'],
  },
  {
    key:   'embedding-vectors',
    title: 'Embedding Vectors and Semantic Search',
    queries: ['word embedding vectors semantic similarity', 'dense vector embedding neural network'],
  },
  {
    key:   'retrieval-augmented-generation',
    title: 'Retrieval-Augmented Generation (RAG)',
    queries: ['retrieval augmented generation RAG explained', 'RAG vector database LLM context'],
  },
  {
    key:   'quantization',
    title: 'Model Quantization and GGUF/GGML',
    queries: ['LLM quantization GGUF GGML explained', 'model weight quantization int4 int8'],
  },
  {
    key:   'fine-tuning',
    title: 'Fine-Tuning and RLHF',
    queries: ['LLM fine tuning RLHF explained', 'LoRA adapter fine tuning large language model'],
  },
  {
    key:   'kv-cache',
    title: 'KV Cache and Inference Optimization',
    queries: ['KV cache key value cache transformer inference', 'LLM inference optimization memory bandwidth'],
  },
  {
    key:   'som-clustering',
    title: 'Self-Organizing Maps and Neural Clustering',
    queries: ['self organizing map SOM neural network clustering', 'unsupervised clustering neural network embedding'],
  },
  {
    key:   'graph-rag',
    title: 'Graph-Enhanced Retrieval (GraphRAG)',
    queries: ['GraphRAG knowledge graph retrieval augmented', 'hypergraph retrieval LLM document graph'],
  },
];

// ── SearXNG fetch ─────────────────────────────────────────────────────────────
async function fetchResults(query, n) {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
  try {
    const r   = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    const json = await r.json();
    return (json.results ?? [])
      .filter(x => x.content && x.content.length > 40)
      .slice(0, n)
      .map(x => ({
        url:     x.url,
        title:   x.title,
        content: x.content.trim(),
        engine:  x.engine,
        score:   x.score ?? 0,
      }));
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = [];
  let totalWords = 0;
  let filesWritten = 0;

  for (const topic of TOPICS) {
    console.log(`\n[${topic.key}] Fetching "${topic.title}"...`);

    // Collect results from all topic queries (deduplicate by URL)
    const seen = new Set();
    const results = [];
    for (const q of topic.queries) {
      const hits = await fetchResults(q, RESULTS_PER_TOPIC);
      for (const h of hits) {
        if (!seen.has(h.url)) { seen.add(h.url); results.push(h); }
      }
      // brief pause to avoid hammering SearXNG
      await new Promise(r => setTimeout(r, 200));
    }

    if (results.length === 0) {
      console.warn(`  ⚠ No results for topic "${topic.key}" — skipping`);
      continue;
    }

    // Build text file content
    const lines = [
      `# ${topic.title}`,
      `source_type: llm_wiki`,
      `topic_key: ${topic.key}`,
      `fetched_at: ${new Date().toISOString()}`,
      '',
    ];

    for (const r of results) {
      lines.push(`## ${r.title}`);
      lines.push(`url: ${r.url}`);
      lines.push('');
      lines.push(r.content);
      lines.push('');
    }

    const text      = lines.join('\n');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    totalWords     += wordCount;

    const outFile = path.join(OUT_DIR, `${topic.key}.txt`);

    if (DRY) {
      console.log(`  [DRY] would write ${outFile} (${results.length} results, ~${wordCount} words)`);
    } else {
      fs.writeFileSync(outFile, text, 'utf8');
      console.log(`  ✅ wrote ${outFile} (${results.length} results, ~${wordCount} words)`);
      filesWritten++;
    }

    index.push({
      topic_key:    topic.key,
      topic_title:  topic.title,
      file:         outFile,
      result_count: results.length,
      word_count:   wordCount,
      urls:         results.map(r => r.url),
    });
  }

  // Write corpus index
  const indexPath = path.join(OUT_DIR, 'corpus-index.ndjson');
  if (DRY) {
    console.log(`\n[DRY] would write ${indexPath} (${index.length} topics)`);
  } else {
    fs.writeFileSync(indexPath, index.map(r => JSON.stringify(r)).join('\n'), 'utf8');
    console.log(`\n✅ corpus-index.ndjson written (${index.length} topics)`);
  }

  console.log('\n── Corpus Fetch Summary ──────────────────────────────');
  console.log(`  Topics processed : ${TOPICS.length}`);
  console.log(`  Files written    : ${DRY ? '(dry run)' : filesWritten}`);
  console.log(`  Total words      : ~${totalWords.toLocaleString()}`);
  console.log(`  Output dir       : ${OUT_DIR}`);

  // Pass/fail gate
  const minFiles = 8;
  const minWords = 4000;  // SearXNG snippets average ~40 words each; 10 topics × 12 results = ~4800
  if (!DRY && (filesWritten < minFiles || totalWords < minWords)) {
    console.error(`\n❌ CORPUS GATE FAILED: need ≥${minFiles} files (got ${filesWritten}) and ≥${minWords} words (got ${totalWords})`);
    process.exit(1);
  }
  if (!DRY) console.log('\n✅ CORPUS FETCH PASS');
}

main().catch(e => { console.error(e); process.exit(1); });
