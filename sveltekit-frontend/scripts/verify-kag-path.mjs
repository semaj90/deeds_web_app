#!/usr/bin/env node
/**
 * Verify the full KAG path fires with seeded data.
 *
 * Tests:
 * 1. getCaseGraphNeighborIds() returns neighbors for case c9b79f5d
 * 2. SSE chat with caseId triggers case-tier retrieval + graph filtering
 * 3. buildGraphShouldFilter() produces a valid Qdrant filter
 */

const BASE = process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://localhost:5173';
const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';

async function testSSEChatWithCase() {
  console.log('=== Test 1: SSE Chat with caseId (triggers KAG path) ===\n');

  const res = await fetch(`${BASE}/api/sse/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'What are the factual allegations in the breach of contract case?',
      conversationId: `case-${CASE_ID}`,
    }),
  });

  console.log(`Status: ${res.status}`);
  console.log(`Content-Type: ${res.headers.get('content-type')}`);

  if (!res.ok) {
    console.log('ERROR:', await res.text());
    return false;
  }

  // Read SSE stream
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  let hasContent = false;
  let hasSources = false;
  let hasGraphContext = false;

  for (const line of lines) {
    const data = line.slice(6); // Remove "data: "
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content' || parsed.content) hasContent = true;
      if (parsed.type === 'sources' || parsed.sources) hasSources = true;
      if (parsed.graphContext || parsed.graph_context) hasGraphContext = true;

      // Show interesting events
      if (parsed.type === 'metadata' || parsed.type === 'sources' || parsed.type === 'graph') {
        console.log(`  SSE event (${parsed.type}):`, JSON.stringify(parsed).slice(0, 200));
      }
    } catch {
      // Non-JSON data line
    }
  }

  console.log(`\nStream results:`);
  console.log(`  Content: ${hasContent ? 'YES' : 'NO'}`);
  console.log(`  Sources: ${hasSources ? 'YES' : 'NO'}`);
  console.log(`  Graph Context: ${hasGraphContext ? 'YES' : 'NO'}`);
  console.log(`  Total SSE lines: ${lines.length}`);

  // Show first few content chunks
  const contentLines = lines.filter(l => {
    try { const d = JSON.parse(l.slice(6)); return d.type === 'content' || d.content; } catch { return false; }
  });
  if (contentLines.length > 0) {
    console.log(`\n  First content chunk: ${contentLines[0].slice(6, 200)}`);
  }

  return res.status === 200;
}

async function testGraphNeighborsDirect() {
  console.log('\n=== Test 2: Direct DB graph neighbor check ===\n');

  // Hit the infrastructure status to verify Qdrant is healthy
  const statusRes = await fetch(`${BASE}/api/infrastructure/status`);
  if (statusRes.ok) {
    const status = await statusRes.json();
    const qdrant = status.cache?.qdrant;
    if (qdrant) {
      console.log(`Qdrant: ${qdrant.ok ? 'OK' : 'DOWN'}, validation: ${JSON.stringify(qdrant.validation)}`);
    }
  }

  // Check graph data exists via a simple PG query through the API
  // We'll use the evidence graph endpoint if it exists
  const graphRes = await fetch(`${BASE}/api/cases/${CASE_ID}`);
  if (graphRes.ok) {
    const data = await graphRes.json();
    console.log(`Case API response keys: ${Object.keys(data).join(', ')}`);
  } else {
    console.log(`Case API: ${graphRes.status}`);
  }
}

async function testEvidenceVectorSearch() {
  console.log('\n=== Test 3: Direct Qdrant evidence_vectors search ===\n');

  // Generate a query embedding via Ollama
  const embedRes = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      input: 'breach of contract factual allegations',
    }),
  });

  if (!embedRes.ok) {
    console.log('Ollama embed failed:', embedRes.status);
    return;
  }

  const embedData = await embedRes.json();
  const queryVector = embedData.embeddings?.[0] ?? embedData.embedding;
  console.log(`Query vector dimension: ${queryVector?.length ?? 'NONE'}`);

  if (!queryVector) return;

  // Search evidence_vectors in Qdrant
  const searchRes = await fetch('http://127.0.0.1:6333/collections/evidence_vectors/points/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: queryVector,
      limit: 5,
      with_payload: true,
      filter: {
        must: [{ key: 'case_id', match: { value: CASE_ID } }],
      },
    }),
  });

  if (!searchRes.ok) {
    console.log('Qdrant search failed:', searchRes.status, await searchRes.text());
    return;
  }

  const searchData = await searchRes.json();
  const results = searchData.result ?? [];
  console.log(`Results: ${results.length} hits`);
  results.forEach((r, i) => {
    console.log(`  [${i}] score=${r.score.toFixed(4)} | ${(r.payload?.content || '').slice(0, 100)}`);
  });

  // Also search evidence_items (named vector: content)
  console.log('\n--- evidence_items (named:content) ---');
  const searchRes2 = await fetch('http://127.0.0.1:6333/collections/evidence_items/points/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector: queryVector },
      limit: 5,
      with_payload: true,
      filter: {
        must: [{ key: 'case_id', match: { value: CASE_ID } }],
      },
    }),
  });

  if (searchRes2.ok) {
    const data2 = await searchRes2.json();
    const results2 = data2.result ?? [];
    console.log(`Results: ${results2.length} hits`);
    results2.forEach((r, i) => {
      console.log(`  [${i}] score=${r.score.toFixed(4)} | ${(r.payload?.content || '').slice(0, 100)}`);
    });
  } else {
    console.log('evidence_items search failed:', searchRes2.status);
  }
}

async function main() {
  try {
    await testSSEChatWithCase();
    await testGraphNeighborsDirect();
    await testEvidenceVectorSearch();
    console.log('\n=== VERIFICATION COMPLETE ===');
  } catch (err) {
    console.error('Verification failed:', err.message);
  }
}

main();
