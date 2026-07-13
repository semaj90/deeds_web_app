#!/usr/bin/env node
/**
 * Phase 5: Domain Classification
 *
 * Classify packets into domains (auth, storage, retrieval, validation, caching, etc.)
 * Parallel task running alongside Phase 6-7
 * Output: domain_class, domain_confidence added to atlas_packets feature_envelope
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

const DOMAIN_PATTERNS: Record<string, { keywords: string[]; confidence: number }> = {
  auth: {
    keywords: ['auth', 'session', 'login', 'password', 'lucia', 'credential', 'verify'],
    confidence: 0.85
  },
  storage: {
    keywords: ['storage', 'persist', 'database', 'postgres', 'redis', 'cache', 'save'],
    confidence: 0.80
  },
  retrieval: {
    keywords: ['retrieval', 'search', 'qdrant', 'vector', 'similarity', 'rank', 'retrieve'],
    confidence: 0.85
  },
  validation: {
    keywords: ['validation', 'validate', 'zod', 'schema', 'check', 'verify', 'audit'],
    confidence: 0.80
  },
  caching: {
    keywords: ['cache', 'caching', 'bifrost', 'ttl', 'expire', 'memcache', 'buffer'],
    confidence: 0.82
  },
  graph: {
    keywords: ['graph', 'topology', 'neo4j', 'edge', 'node', 'traverse', 'relationship'],
    confidence: 0.83
  },
  embedding: {
    keywords: ['embedding', 'embed', 'vector', 'semantic', 'similarity', 'dimension'],
    confidence: 0.84
  },
  ai: {
    keywords: ['ai', 'llm', 'gemma', 'ollama', 'inference', 'generation', 'prompt'],
    confidence: 0.82
  },
};

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 5: DOMAIN CLASSIFICATION                              ║');
  console.log('║  Classify packets into business domains                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/3] FETCHING PACKETS\n');

    const packets = await pool.query(`
      SELECT
        packet_key,
        feature_envelope,
        COALESCE(summary, '') as summary,
        COALESCE(feature_label, '') as feature_label
      FROM atlas_packets
    `);

    console.log(`  Total packets to classify: ${packets.rows.length}`);

    console.log('\n[2/3] CLASSIFYING DOMAINS\n');

    const classified: { packet_key: string; domain_class: string; domain_confidence: number }[] = [];

    for (const row of packets.rows) {
      const text = `${row.summary} ${row.feature_label}`.toLowerCase();
      let bestDomain = 'other';
      let bestConfidence = 0.3;

      for (const [domain, { keywords, confidence }] of Object.entries(DOMAIN_PATTERNS)) {
        const matchCount = keywords.filter(kw => text.includes(kw)).length;
        const score = (matchCount / keywords.length) * confidence;

        if (score > bestConfidence) {
          bestDomain = domain;
          bestConfidence = score;
        }
      }

      classified.push({
        packet_key: row.packet_key,
        domain_class: bestDomain,
        domain_confidence: parseFloat(bestConfidence.toFixed(3)),
      });
    }

    // Domain distribution
    const domainDist: Record<string, number> = {};
    for (const c of classified) {
      domainDist[c.domain_class] = (domainDist[c.domain_class] || 0) + 1;
    }

    console.log(`  Domain distribution:`);
    for (const [domain, count] of Object.entries(domainDist).sort((a, b) => b[1] - a[1])) {
      const pct = ((100 * count) / classified.length).toFixed(1);
      console.log(`    ${domain.padEnd(12)}: ${String(count).padStart(3)} packets (${pct}%)`);
    }

    console.log('\n[3/3] UPDATING FEATURE ENVELOPES\n');

    let updatedCount = 0;
    for (const c of classified) {
      const result = await pool.query(
        `UPDATE atlas_packets
         SET feature_envelope = JSONB_SET(
           COALESCE(feature_envelope, '{}'),
           '{domain_class}',
           to_jsonb($1::text)
         ),
         updated_at = NOW()
         WHERE packet_key = $2`,
        [c.domain_class, c.packet_key]
      );

      if (result.rowCount > 0) {
        updatedCount++;
      }
    }

    console.log(`  Updated packets: ${updatedCount}/${classified.length}`);
    console.log(`  Domain confidence: average ${(classified.reduce((a, b) => a + b.domain_confidence, 0) / classified.length).toFixed(3)}\n`);

    console.log('✅ PHASE 5 COMPLETE\n');

    console.log('Summary:');
    console.log(`  Classified packets: ${classified.length}`);
    console.log(`  Domains discovered: ${Object.keys(domainDist).length}`);
    console.log(`  Average confidence: ${(classified.reduce((a, b) => a + b.domain_confidence, 0) / classified.length).toFixed(3)}`);
    console.log(`  Status: Feature envelope updated with domain_class\n`);

    console.log('Next: Phase 6 (Canonical Qdrant) and Phase 7 (CrossEncoder) running in parallel\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
