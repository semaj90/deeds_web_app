#!/usr/bin/env node
/**
 * verify-qdrant-packet-payloads.mjs
 *
 * Verifies that Qdrant codebase_chunks_768 payloads contain all required fields
 * to support indexed retrieval + Karpathy reranking.
 *
 * Required payload fields:
 * - packet_key (for exact match retrieval)
 * - source_ref (for multi-hop Neo4j joins)
 * - feature_id (for grouping + Karpathy key)
 * - feature_label (for UI + context)
 * - domain_class (for domain filtering + agentic grouping)
 * - community_id (for community scoping)
 * - tags (for concept filtering)
 * - som_cluster (optional, for SOM topology routing)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

async function verifyQdrantPayloads() {
  console.log('\n═══ Qdrant Packet Payload Verification ═══\n');

  const requiredFields = [
    'packet_key',
    'source_ref',
    'feature_id',
    'feature_label',
    'domain_class',
    'community_id',
    'tags',
  ];

  try {
    // Get collection info
    const collInfo = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768`);
    if (!collInfo.ok) {
      console.log('❌ Collection codebase_chunks_768 not found');
      process.exit(1);
    }

    const collData = await collInfo.json();
    const pointCount = collData.result.points_count;
    console.log(`Collection: codebase_chunks_768`);
    console.log(`Points: ${pointCount.toLocaleString()}`);

    // Scroll points and check payload coverage
    let checkedCount = 0;
    const fieldCoverage = Object.fromEntries(requiredFields.map(f => [f, 0]));
    const errors = [];

    let offset = null;
    let batch = 0;
    while (checkedCount < Math.min(1000, pointCount)) {
      batch++;
      const scrollReq = {
        limit: 100,
        ...(offset ? { offset } : {}),
        with_payload: true,
      };

      const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scrollReq),
      });

      const scrollData = await scrollRes.json();
      if (!scrollData.result?.points) break;

      for (const point of scrollData.result.points) {
        checkedCount++;
        const payload = point.payload || {};

        for (const field of requiredFields) {
          if (field in payload && payload[field] !== null && payload[field] !== '') {
            fieldCoverage[field]++;
          }
        }

        // Collect sample errors
        if (errors.length < 5) {
          const missing = requiredFields.filter(f => !(f in payload));
          if (missing.length > 0) {
            errors.push({
              pointId: point.id,
              missingFields: missing,
            });
          }
        }
      }

      offset = scrollData.result.next_page_offset;
      if (!offset) break;
    }

    console.log(`\nPayload Coverage (${checkedCount} sampled points):`);
    for (const field of requiredFields) {
      const coverage = ((fieldCoverage[field] / checkedCount) * 100).toFixed(1);
      const status = coverage >= 90 ? '✅' : coverage >= 50 ? '⚠️ ' : '❌';
      console.log(`  ${field.padEnd(20)} ${status} ${coverage}%`);
    }

    const gate = Object.values(fieldCoverage).every(count => (count / checkedCount) >= 0.90);
    console.log(`\n${gate ? '✅' : '❌'} Payload Alignment: ${gate ? 'PASS' : 'FAIL'}`);

    if (errors.length > 0) {
      console.log(`\nSample missing payload fields (first 5):`);
      for (const err of errors) {
        console.log(`  Point ${err.pointId}: missing ${err.missingFields.join(', ')}`);
      }
    }

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    const jsonPath = join(reportDir, 'qdrant-payload-alignment.json');
    writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: 'codebase_chunks_768',
      totalPoints: pointCount,
      sampledPoints: checkedCount,
      fieldCoverage: Object.fromEntries(
        Object.entries(fieldCoverage).map(([field, count]) => [
          field,
          ((count / checkedCount) * 100).toFixed(1),
        ])
      ),
      sampleErrors: errors,
      gate: gate ? 'PASS' : 'FAIL',
    }, null, 2));

    const mdPath = join(reportDir, 'qdrant-payload-alignment.md');
    const mdContent = `# Qdrant Packet Payload Verification

**Generated**: ${new Date().toISOString()}

## Summary
${gate ? '✅ **PASS**' : '❌ **FAIL**'} — Qdrant payloads are ${gate ? 'properly aligned for indexed retrieval' : 'incomplete'}.

## Collection Status

- **Collection**: codebase_chunks_768
- **Total points**: ${pointCount.toLocaleString()}
- **Sampled**: ${checkedCount} points

## Payload Field Coverage

| Field | Coverage | Status |
|-------|----------|--------|
${requiredFields.map(field => {
  const count = fieldCoverage[field];
  const coverage = ((count / checkedCount) * 100).toFixed(1);
  const status = coverage >= 90 ? '✅ PASS' : coverage >= 50 ? '⚠️ PARTIAL' : '❌ FAIL';
  return `| ${field} | ${coverage}% | ${status} |`;
}).join('\n')}

## Purpose

These payload fields enable:
- **packet_key**: Exact-match retrieval + deduplication
- **source_ref**: Multi-hop Neo4j joins + Redis centroid lookup
- **feature_id**: Grouping + Karpathy ranking key
- **feature_label**: UI context + ranking blend context
- **domain_class**: Domain filtering + agentic grouping
- **community_id**: Community scoping + confidence scoring
- **tags**: Concept filtering + multi-vector queries
- **som_cluster**: SOM topology routing (optional, preferred when available)

## Next Steps

${gate ? `
✅ Qdrant payloads are ready. Proceed to:
1. Inspect \`/api/atlas/search\` — Verify payload projection in responses
2. Run \`npm run atlas:search:cascade\` — Test full retrieval pipeline
3. Monitor Karpathy blend: \`curl http://localhost:6379 -c "HGET gpu:karpathy:scores <packet_key>"\`
` : `
❌ Qdrant payload alignment incomplete. Diagnose:
1. Is Qdrant running? \`curl http://localhost:6333/collections\`
2. Check point sample: \`curl -X POST http://localhost:6333/collections/codebase_chunks_768/points/scroll -d '{"limit":1}' -H 'Content-Type: application/json'\`
3. Re-run enrichment: \`npm run atlas:4b:qdrant-payload --apply\`
`}
`;
    writeFileSync(mdPath, mdContent);

    console.log(`\nReports:\n  JSON: ${jsonPath}\n  Markdown: ${mdPath}\n`);

    if (!gate) process.exit(1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

verifyQdrantPayloads().catch(err => {
  console.error(err);
  process.exit(1);
});
