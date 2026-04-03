#!/usr/bin/env node
/**
 * Debug: Test Qdrant filter behavior with should clauses
 */

const QDRANT = 'http://127.0.0.1:6333';
const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';

async function main() {
  // Get embedding
  const embedRes = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: 'breach of contract' }),
  });
  const embedData = await embedRes.json();
  const vec = embedData.embeddings?.[0] ?? embedData.embedding;

  // Test 1: No filter
  console.log('=== Test 1: No filter ===');
  const r1 = await search(vec, {});
  console.log(`Hits: ${r1.length}`);
  r1.slice(0, 2).forEach(r => console.log(`  ${r.score.toFixed(4)} | ev_id: ${r.payload?.evidence_id?.slice(0, 8)} | doc_id: ${r.payload?.document_id?.slice(0, 8)}`));

  // Test 2: must case_id only
  console.log('\n=== Test 2: must case_id only ===');
  const r2 = await search(vec, { must: [{ key: 'case_id', match: { value: CASE_ID } }] });
  console.log(`Hits: ${r2.length}`);
  r2.slice(0, 2).forEach(r => console.log(`  ${r.score.toFixed(4)} | ev_id: ${r.payload?.evidence_id?.slice(0, 8)} | doc_id: ${r.payload?.document_id?.slice(0, 8)}`));

  // Test 3: must case_id + should (graph node IDs — won't match)
  console.log('\n=== Test 3: must case_id + should (graph node IDs) ===');
  const graphNodeIds = [
    '2881752e-5ee3-4987-a3b6-a34a8a2a6b1d', // These are yorha_evidence_nodes.id
    '413d78ff-a9c2-4c0b-8b0a-b0c4a9d3e5f7',
    '9fad2491-00cb-4b8d-8398-3e56d57bf5a7',
  ];
  const r3 = await search(vec, {
    must: [{ key: 'case_id', match: { value: CASE_ID } }],
    should: [
      { key: 'document_id', match: { any: graphNodeIds } },
      { key: 'evidence_id', match: { any: graphNodeIds } },
      { key: 'source_id', match: { any: graphNodeIds } },
      { key: 'node_id', match: { any: graphNodeIds } },
    ],
  });
  console.log(`Hits: ${r3.length}`);
  r3.slice(0, 2).forEach(r => console.log(`  ${r.score.toFixed(4)} | ev_id: ${r.payload?.evidence_id?.slice(0, 8)} | doc_id: ${r.payload?.document_id?.slice(0, 8)}`));

  // Test 4: should only (no must) — should is a soft boost in Qdrant
  console.log('\n=== Test 4: should only (soft boost, no must) ===');
  const r4 = await search(vec, {
    should: [
      { key: 'document_id', match: { any: graphNodeIds } },
      { key: 'evidence_id', match: { any: graphNodeIds } },
    ],
  });
  console.log(`Hits: ${r4.length}`);
  r4.slice(0, 2).forEach(r => console.log(`  ${r.score.toFixed(4)} | ev_id: ${r.payload?.evidence_id?.slice(0, 8)} | doc_id: ${r.payload?.document_id?.slice(0, 8)}`));

  // Check what payloads actually contain
  console.log('\n=== Payload inspection (first 3 points) ===');
  const scrollRes = await fetch(`${QDRANT}/collections/evidence_vectors/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 3, with_payload: true, filter: { must: [{ key: 'case_id', match: { value: CASE_ID } }] } }),
  });
  const scrollData = await scrollRes.json();
  for (const pt of scrollData.result?.points ?? []) {
    console.log(`Point ${String(pt.id).slice(0, 8)}:`, JSON.stringify(pt.payload, null, 2).slice(0, 300));
  }
}

async function search(vec, filter) {
  const res = await fetch(`${QDRANT}/collections/evidence_vectors/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: vec,
      limit: 5,
      with_payload: true,
      score_threshold: 0.2,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }),
  });
  const data = await res.json();
  return data.result ?? [];
}

main().catch(console.error);
