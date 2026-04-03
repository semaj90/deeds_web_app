#!/usr/bin/env node
/**
 * Seed graph data into Docker PG (port 5434) — the actual DB the SvelteKit app uses.
 *
 * Creates: case row + evidence rows + evidence nodes + graph connections
 * Then upserts evidence vectors to Qdrant.
 */
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
const QDRANT = 'http://127.0.0.1:6333';
const OLLAMA = 'http://127.0.0.1:11434';
const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000'; // dev@deeds.local

async function main() {
  console.log('=== Seeding Docker PG (port 5434) ===\n');

  // Phase 1: Create case
  console.log('--- Phase 1: Case ---');
  const caseRes = await pool.query(`
    INSERT INTO cases (id, title, description, case_number, status, priority, jurisdiction, court, practice_area, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `, [
    CASE_ID,
    'Smith v. Johnson - Breach of Contract',
    'Breach of contract action arising from failure to perform under construction services agreement. Plaintiff alleges defendant failed to complete renovation work per contract terms, seeking damages for material breach, unjust enrichment, and breach of implied covenant.',
    'CV-2026-0042',
    'open',
    'high',
    'California',
    'Superior Court of California, County of Los Angeles',
    'civil_litigation'
  ]);
  console.log(`  Case: ${caseRes.rows.length ? 'CREATED' : 'EXISTS'}`);

  // Phase 2: Create evidence documents
  console.log('\n--- Phase 2: Evidence Documents ---');
  const evidenceDocs = [
    {
      id: 'cb4b0a08-2b34-48ce-b5ea-9d3fcb45e2a1',
      title: 'Original Complaint - Smith v. Johnson',
      type: 'documentary',
      content: 'COMPLAINT FOR DAMAGES: 1. BREACH OF CONTRACT. Plaintiff John Smith entered into a written contract with Defendant Robert Johnson on January 15, 2025 for renovation services. 2. PARTIES. Plaintiff is an individual residing in Los Angeles County. Defendant is a licensed contractor. 3. FACTUAL ALLEGATIONS. Defendant agreed to complete full kitchen and bathroom renovation for $85,000. Plaintiff paid $42,500 deposit. Defendant commenced work but abandoned the project after completing only demolition. 4. CAUSES OF ACTION. First: Material Breach of Contract. Second: Breach of Implied Covenant of Good Faith. Third: Unjust Enrichment. PRAYER FOR RELIEF: Plaintiff seeks compensatory damages, restitution, and attorney fees.'
    },
    {
      id: 'e04fd058-1234-4abc-9def-abcdef123456',
      title: 'Construction Contract Agreement',
      type: 'document',
      content: 'CONSTRUCTION SERVICES AGREEMENT dated January 15, 2025 between John Smith (Owner) and Robert Johnson dba Johnson Construction (Contractor). SCOPE OF WORK: Complete renovation of kitchen and master bathroom at 1234 Oak Lane, Los Angeles CA 90001. PRICE: Total contract price $85,000 payable as: 50% deposit ($42,500) upon signing, 25% at rough completion, 25% at final inspection. TIMELINE: Work to commence within 14 days of signing, substantial completion within 90 days. WARRANTY: Contractor warrants all work for 1 year. TERMINATION: Either party may terminate with 30 days written notice. California law governs.'
    },
    {
      id: '4fc9c5d1-5678-4def-abcd-123456789abc',
      title: 'Payment Receipt and Bank Records',
      type: 'document',
      content: 'PAYMENT RECORDS: Wire transfer $42,500 from Smith to Johnson Construction, dated January 20, 2025. Reference: Contract deposit per Section 3. Bank: First National Bank, Account ending 4521. ADDITIONAL EXPENSES: Permit fees $1,200 paid by Owner. Material purchases by Contractor: Home Depot receipts totaling $8,340 (demolition supplies, dumpster rental). No further payments made by Owner. Total Owner expenditure: $43,700.'
    }
  ];

  // Check evidence table columns
  const { rows: evCols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='evidence' ORDER BY ordinal_position"
  );
  const colNames = evCols.map(c => c.column_name);
  console.log(`  Evidence columns: ${colNames.slice(0, 10).join(', ')}...`);

  for (const doc of evidenceDocs) {
    const res = await pool.query(`
      INSERT INTO evidence (id, case_id, title, evidence_type, file_type, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `, [doc.id, CASE_ID, doc.title, doc.type, 'application/pdf', doc.content]);
    console.log(`  ${doc.title.slice(0, 40)}: ${res.rows.length ? 'CREATED' : 'EXISTS'}`);
  }

  // Phase 3: Create evidence nodes
  console.log('\n--- Phase 3: Evidence Nodes ---');
  const nodes = [
    { title: 'PARTIES Section', type: 'document-section', path: `evidence/${evidenceDocs[0].id}/parties` },
    { title: 'FACTUAL ALLEGATIONS Section', type: 'document-section', path: `evidence/${evidenceDocs[0].id}/allegations` },
    { title: 'CAUSES OF ACTION Section', type: 'document-section', path: `evidence/${evidenceDocs[0].id}/causes` },
    { title: 'PRAYER FOR RELIEF Section', type: 'document-section', path: `evidence/${evidenceDocs[0].id}/prayer` },
    { title: 'SCOPE OF WORK Section', type: 'document-section', path: `evidence/${evidenceDocs[1].id}/scope` },
    { title: 'PAYMENT TERMS Section', type: 'document-section', path: `evidence/${evidenceDocs[1].id}/payment` },
    { title: 'CONTRACT TIMELINE Section', type: 'document-section', path: `evidence/${evidenceDocs[1].id}/timeline` },
    { title: 'PAYMENT RECORDS Section', type: 'document-section', path: `evidence/${evidenceDocs[2].id}/payments` },
    { title: 'ADDITIONAL EXPENSES Section', type: 'document-section', path: `evidence/${evidenceDocs[2].id}/expenses` },
  ];

  const nodeIds = [];
  for (const node of nodes) {
    const id = crypto.randomUUID();
    nodeIds.push(id);
    const res = await pool.query(`
      INSERT INTO yorha_evidence_nodes (id, case_id, title, evidence_type, file_path, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
      RETURNING id
    `, [id, CASE_ID, node.title, node.type, node.path, SYSTEM_USER]);
    console.log(`  ${node.title.slice(0, 35).padEnd(35)} → ${id.slice(0, 8)}`);
  }

  // Phase 4: Create connections
  console.log('\n--- Phase 4: Graph Connections ---');
  const connections = [
    { src: 0, tgt: 1, type: 'supports', str: 85, conf: 90, desc: 'Parties section establishes standing for factual allegations' },
    { src: 1, tgt: 2, type: 'supports', str: 95, conf: 95, desc: 'Factual allegations form basis for causes of action' },
    { src: 2, tgt: 3, type: 'supports', str: 80, conf: 85, desc: 'Causes of action support prayer for relief' },
    { src: 4, tgt: 1, type: 'contextualizes', str: 75, conf: 80, desc: 'Contract scope provides context for breach allegations' },
    { src: 5, tgt: 7, type: 'references', str: 90, conf: 92, desc: 'Contract payment terms verified by payment records' },
    { src: 6, tgt: 1, type: 'establishes-authority', str: 70, conf: 75, desc: 'Timeline establishes breach deadline' },
    { src: 7, tgt: 2, type: 'supports', str: 85, conf: 88, desc: 'Payment records prove damages for unjust enrichment claim' },
    { src: 8, tgt: 3, type: 'supports', str: 65, conf: 70, desc: 'Additional expenses support prayer for damages' },
    { src: 0, tgt: 4, type: 'related-claim', str: 60, conf: 65, desc: 'Parties relate to contract scope' },
    { src: 1, tgt: 5, type: 'references', str: 80, conf: 82, desc: 'Allegations reference payment terms' },
    { src: 3, tgt: 8, type: 'references', str: 55, conf: 60, desc: 'Relief prayer references total expenses' },
    { src: 6, tgt: 7, type: 'procedural-link', str: 50, conf: 55, desc: 'Timeline correlates with payment sequence' },
  ];

  let connInserted = 0;
  for (const conn of connections) {
    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO yorha_evidence_connections (id, case_id, source_node_id, target_node_id, connection_type, strength, description, ai_reasoning, confidence_score, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, NOW(), NOW())
    `, [id, CASE_ID, nodeIds[conn.src], nodeIds[conn.tgt], conn.type, conn.str, conn.desc, conn.conf, SYSTEM_USER]);
    connInserted++;
    console.log(`  ${nodes[conn.src].title.slice(0, 25)} →[${conn.type}]→ ${nodes[conn.tgt].title.slice(0, 25)} (str:${conn.str})`);
  }
  console.log(`  Inserted ${connInserted} connections`);

  // Phase 5: Generate embeddings and upsert to Qdrant
  console.log('\n--- Phase 5: Qdrant Evidence Vectors ---');

  // Generate chunks from evidence content
  const chunks = [];
  for (const doc of evidenceDocs) {
    // Split content into ~200 char chunks
    const sentences = doc.content.split(/(?<=[.!?])\s+/);
    let chunk = '';
    let chunkIdx = 0;
    for (const sentence of sentences) {
      chunk += (chunk ? ' ' : '') + sentence;
      if (chunk.length >= 150) {
        chunks.push({
          id: crypto.randomUUID(),
          evidenceId: doc.id,
          caseId: CASE_ID,
          content: chunk,
          title: doc.title,
          chunkIndex: chunkIdx++,
        });
        chunk = '';
      }
    }
    if (chunk) {
      chunks.push({
        id: crypto.randomUUID(),
        evidenceId: doc.id,
        caseId: CASE_ID,
        content: chunk,
        title: doc.title,
        chunkIndex: chunkIdx,
      });
    }
  }

  console.log(`  Generated ${chunks.length} chunks from ${evidenceDocs.length} documents`);

  // Embed all chunks
  const batchSize = 10;
  const points = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    const embedRes = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts }),
      signal: AbortSignal.timeout(30000),
    });

    if (!embedRes.ok) {
      console.log(`  Embedding batch ${i} failed: ${embedRes.status}`);
      continue;
    }

    const embedData = await embedRes.json();
    const vectors = embedData.embeddings ?? [embedData.embedding];

    for (let j = 0; j < batch.length; j++) {
      if (!vectors[j] || vectors[j].length !== 768) continue;
      points.push({
        id: batch[j].id,
        vector: vectors[j],
        payload: {
          case_id: batch[j].caseId,
          evidence_id: batch[j].evidenceId,
          document_id: batch[j].evidenceId,
          content: batch[j].content,
          title: batch[j].title,
          chunk_index: batch[j].chunkIndex,
          source: 'seed-script',
        },
      });
    }
    console.log(`  Embedded batch ${Math.floor(i / batchSize) + 1}: ${vectors.length} vectors`);
  }

  // Upsert to evidence_vectors
  if (points.length > 0) {
    const upsertRes = await fetch(`${QDRANT}/collections/evidence_vectors/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`  evidence_vectors upsert: ${upsertRes.ok ? 'OK' : 'FAIL'} (${points.length} points)`);

    // Also upsert to evidence_items (named vector: content)
    const namedPoints = points.map(p => ({
      id: crypto.randomUUID(), // Different ID for this collection
      vector: { content: p.vector },
      payload: p.payload,
    }));
    const upsertRes2 = await fetch(`${QDRANT}/collections/evidence_items/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: namedPoints }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`  evidence_items upsert: ${upsertRes2.ok ? 'OK' : 'FAIL'} (${namedPoints.length} points)`);
  }

  // Phase 6: Verify
  console.log('\n--- Phase 6: Verify ---');
  const { rows: [nodeCount] } = await pool.query('SELECT COUNT(*) FROM yorha_evidence_nodes WHERE case_id = $1', [CASE_ID]);
  const { rows: [connCount] } = await pool.query('SELECT COUNT(*) FROM yorha_evidence_connections WHERE case_id = $1', [CASE_ID]);
  const { rows: [evCount] } = await pool.query('SELECT COUNT(*) FROM evidence WHERE case_id = $1', [CASE_ID]);
  const { rows: [caseCount] } = await pool.query('SELECT COUNT(*) FROM cases WHERE id = $1', [CASE_ID]);

  console.log(`  Cases: ${caseCount.count}`);
  console.log(`  Evidence: ${evCount.count}`);
  console.log(`  Nodes: ${nodeCount.count}`);
  console.log(`  Connections: ${connCount.count}`);
  console.log(`  Qdrant points: ${points.length}`);

  console.log('\n=== SEED COMPLETE ===');
}

main().catch(console.error).finally(() => pool.end());