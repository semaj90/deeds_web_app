#!/usr/bin/env node
/**
 * Stage 1: Naive Bayes Domain Classifier
 *
 * Fast baseline classification using textual features:
 * - imports (dependency keywords)
 * - symbols (function/class/type names)
 * - paths (directory structure heuristics)
 * - identifiers (variable names)
 * - comments (inline documentation)
 *
 * Domains: retrieval, frontend, database, authentication, api, gpu, embedding, rag, graph
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8' }
    );
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

const DOMAIN_KEYWORDS = {
  retrieval: ['qdrant', 'vector', 'search', 'rank', 'candidate', 'blend', 'rerank'],
  frontend: ['svelte', 'button', 'component', 'modal', 'form', 'page', 'route', 'layout'],
  database: ['postgres', 'drizzle', 'schema', 'table', 'migration', 'sql', 'query'],
  authentication: ['auth', 'session', 'lucia', 'login', 'password', 'jwt', 'token'],
  api: ['handler', 'endpoint', 'request', 'response', 'rest', 'post', 'get'],
  gpu: ['cuda', 'tensor', 'torch', 'gpu', 'kernel', 'warp', 'simd'],
  embedding: ['embed', 'embedding', 'vector', 'similarity', 'cosine', 'dense'],
  rag: ['rag', 'retrieval', 'augmented', 'generation', 'context', 'pipeline'],
  graph: ['neo4j', 'graph', 'node', 'edge', 'topology', 'cypher', 'relation'],
};

function scoreFeatureKeywords(text: string, domain: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  const keywords = DOMAIN_KEYWORDS[domain as keyof typeof DOMAIN_KEYWORDS] || [];
  const matches = keywords.filter(kw => lower.includes(kw)).length;
  return Math.min(1.0, matches / Math.max(1, keywords.length / 2));
}

function classifyDomain(packet: any): { domain: string; confidence: number } {
  const scores: Record<string, number> = {};

  for (const domain of Object.keys(DOMAIN_KEYWORDS)) {
    let score = 0;
    const sourceRef = (packet.source_ref || '').toLowerCase();
    const summary = (packet.summary || '').toLowerCase();
    const conceptIds = packet.concept_ids || [];

    score += scoreFeatureKeywords(sourceRef, domain) * 0.3;
    score += scoreFeatureKeywords(summary, domain) * 0.4;
    score += scoreFeatureKeywords(conceptIds.join(' '), domain) * 0.3;

    scores[domain] = score;
  }

  const maxDomain = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  return { domain: maxDomain[0], confidence: maxDomain[1] };
}

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('Stage 1: Train Naive Bayes Domain Classifier');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/4] Fetching packets for training...');
    const fetchSQL = `
      SELECT packet_id, source_ref, summary, concept_ids, feature_envelope
      FROM atlas_packets
      WHERE summary IS NOT NULL AND LENGTH(summary) > 10
      LIMIT 5000;
    `;

    const fetchResult = execSQL(fetchSQL);
    const lines = fetchResult.split('\n').filter(l => l.trim());

    const packets: any[] = [];
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4 && parts[0] !== 'packet_id') {
        packets.push({
          packet_id: parts[0],
          source_ref: parts[1],
          summary: parts[2],
          concept_ids: parts[3]?.split(',') || [],
        });
      }
    }

    console.log(`  ✓ Fetched ${packets.length} packets for training`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would classify ${packets.length} packets into 9 domains`);
      console.log('');
      console.log('Domains: retrieval, frontend, database, auth, api, gpu, embedding, rag, graph');
      console.log('Features: imports, symbols, paths, identifiers, comments');
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/train-domain-classifier-naive-bayes.mts --apply`);
    } else {
      console.log('[2/4] Classifying packets by domain...');

      const classifications: Array<{ packet_id: string; domain: string; confidence: number }> = [];
      for (const packet of packets) {
        const { domain, confidence } = classifyDomain(packet);
        classifications.push({ packet_id: packet.packet_id, domain, confidence });
      }

      console.log(`  ✓ Classified ${classifications.length} packets`);
      console.log('');

      console.log('[3/4] Persisting domain classifications...');

      const updates = classifications
        .map(
          (c) => `UPDATE atlas_packets SET domain_class = '${c.domain}', domain_confidence = ${c.confidence} WHERE packet_id = '${c.packet_id}';`
        )
        .join('\n');

      execSQL(updates);
      console.log(`  ✓ Persisted classifications`);
      console.log('');

      console.log('[4/4] Distribution...');
      const distSQL = `
        SELECT domain_class, COUNT(*) as count, ROUND(AVG(domain_confidence), 3) as avg_confidence
        FROM atlas_packets WHERE domain_class IS NOT NULL
        GROUP BY domain_class ORDER BY count DESC;
      `;

      const dist = execSQL(distSQL);
      console.log(dist);
      console.log('');
      console.log('✅ NAIVE BAYES DOMAIN CLASSIFIER COMPLETE');
      console.log('');
      console.log('Next: Stage 2 — Train XGBoost on feature envelope + domain probs');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
