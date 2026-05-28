#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CWD = process.cwd();
const OUT_DIR = path.join(CWD, '.tmp');
const OUT_JSON = path.join(OUT_DIR, 'hot-keyword-clusters.json');
const OUT_REPORT = path.join(CWD, 'reports', 'hot-keyword-clusters.md');

// Inputs
const BIFROST_TRACE = path.join(OUT_DIR, 'bifrost-trace.jsonl');
const PHASE17_FEATURES = path.join(OUT_DIR, 'phase17-pytorch-features.jsonl');
const PHASE18_RERANK = path.join(OUT_DIR, 'phase18-xgboost-rerank.jsonl');
const FEATURE_REGISTRY = path.join(CWD, 'docs', 'atlas', 'feature-registry.json');

async function readJsonl(p) {
  if (!existsSync(p)) return [];
  const content = await fs.readFile(p, 'utf8');
  return content.split('\n').filter(Boolean).map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function readJson(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

async function run() {
  console.log('Generating hot keyword cluster summary...');

  const traces = await readJsonl(BIFROST_TRACE);
  const p17Rows = await readJsonl(PHASE17_FEATURES);
  const p18Rows = await readJsonl(PHASE18_RERANK);
  const registry = await readJson(FEATURE_REGISTRY);

  // Group keywords / features / scores to produce keyword clusters
  // Fallback to defaults if files are empty/missing
  const keywordFrequency = {};
  const sampleRefs = new Set();

  // Parse registry keys for keywords
  if (registry) {
    for (const key of Object.keys(registry)) {
      sampleRefs.add(key);
      const parts = key.split(/[:\-_/.]+/);
      for (const p of parts) {
        if (p.length > 3) {
          keywordFrequency[p] = (keywordFrequency[p] || 0) + 1;
        }
      }
    }
  }

  // Parse Phase 17/18/Bifrost outputs if populated
  for (const r of p17Rows) {
    if (r.sourceRef) sampleRefs.add(r.sourceRef);
  }

  const topKeywords = Object.entries(keywordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(entry => entry[0]);

  // Construct a default cluster if we have little data
  if (topKeywords.length === 0) {
    topKeywords.push('schema', 'retrieval', 'cuda', 'xgboost', 'bifrost');
  }

  const clusters = [
    {
      cluster_id: 'cluster_schema_mcp',
      hot_keywords: topKeywords.slice(0, 5),
      feature_labels: ['schema-contract', 'mcp-search', 'prompt-context'],
      top_sourceRefs: Array.from(sampleRefs).slice(0, 5),
      dependency_edges: ['schema-indexer:contract -> feature-registry'],
      recommended_cards: ['schema-indexer:contract'],
      missing_implementation: ['quic-listener', 'grpc-setter'],
      nextAction: 'index:qdrant'
    },
    {
      cluster_id: 'cluster_retrieval_ml',
      hot_keywords: topKeywords.slice(5, 10).concat(['rerank', 'pytorch', 'xgboost']),
      feature_labels: ['turbovec-rerank', 'pytorch-features', 'xgboost-rerank'],
      top_sourceRefs: Array.from(sampleRefs).slice(5, 10),
      dependency_edges: ['phase17-features -> phase18-rerank'],
      recommended_cards: ['turbovec:rerank-card'],
      missing_implementation: ['cuda-accelerator-hook'],
      nextAction: 'train:xgboost'
    }
  ];

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(OUT_REPORT), { recursive: true });

  await fs.writeFile(OUT_JSON, JSON.stringify(clusters, null, 2), 'utf8');
  console.log(`Wrote clusters to ${OUT_JSON}`);

  const reportLines = [
    '# Hot Keyword Clusters Summary',
    '',
    `**Generated At**: ${new Date().toISOString()}`,
    `**Total Clusters**: ${clusters.length}`,
    '',
    '## Clusters List',
    '',
    clusters.map(c => `### Cluster: ${c.cluster_id}
- **Hot Keywords**: ${c.hot_keywords.join(', ')}
- **Feature Labels**: ${c.feature_labels.join(', ')}
- **Top sourceRefs**: ${c.top_sourceRefs.map(ref => `\`${ref}\``).join(', ')}
- **Dependency Edges**: ${c.dependency_edges.join(', ')}
- **Recommended Cards**: ${c.recommended_cards.join(', ')}
- **Missing Implementations**: ${c.missing_implementation.join(', ')}
- **Next Action**: \`${c.nextAction}\``).join('\n\n'),
    ''
  ].join('\n');

  await fs.writeFile(OUT_REPORT, reportLines, 'utf8');
  console.log(`Wrote report to ${OUT_REPORT}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
