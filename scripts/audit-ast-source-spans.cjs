const { Client } = require('pg');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db'
});

async function main() {
  await client.connect();

  console.log('=== 1. AUDIT atlas_ast_nodes STATS ===');
  const astStats = await client.query(`
    SELECT 
      count(*) as total_ast,
      count(source_revision) as has_source_revision,
      count(source_content_hash) as has_source_content_hash,
      count(start_byte) as has_start_byte
    FROM atlas_ast_nodes;
  `);
  console.table(astStats.rows[0]);

  const sampleAst = await client.query(`
    SELECT tree_node_id, relative_path, source_revision, source_content_hash, start_byte, end_byte
    FROM atlas_ast_nodes
    WHERE source_revision IS NOT NULL
    LIMIT 3;
  `);
  console.log('Sample AST with source_revision:');
  console.table(sampleAst.rows);

  console.log('=== JOIN: CHUNKS -> LINEAGE -> PACKETS -> BINDINGS -> AST NODES ===');
  const query = `
    WITH candidate_chunks AS (
      SELECT 
        c.id as chunk_id,
        c.source_ref,
        c.content_embedding IS NOT NULL as has_halfvec768,
        c.content_embedding_768 IS NOT NULL as has_vector768,
        l.packet_key,
        l.source_revision as lineage_source_revision,
        p.source_revision as packet_source_revision,
        b.workspace_revision,
        b.content_digest as workspace_content_digest
      FROM codebase_chunk_index c
      JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
      JOIN atlas_packets p ON p.packet_key = l.packet_key
      JOIN atlas_workspace_source_bindings b 
        ON b.source_revision = p.source_revision 
       AND b.canonical_source_ref = c.source_ref
      WHERE l.source_ref = c.source_ref 
        AND p.source_ref = c.source_ref
        AND l.source_revision = p.source_revision
        AND l.membership_status = 'PROVEN'
    )
    SELECT 
      cc.chunk_id,
      cc.source_ref,
      cc.packet_source_revision,
      cc.workspace_content_digest,
      cc.has_vector768,
      a.tree_node_id,
      a.node_kind,
      a.qualified_symbol,
      a.start_byte,
      a.end_byte,
      a.source_content_hash as ast_source_hash
    FROM candidate_chunks cc
    JOIN atlas_ast_nodes a 
      ON a.relative_path = cc.source_ref 
     AND a.source_revision = cc.packet_source_revision
     AND a.source_content_hash = cc.workspace_content_digest
    LIMIT 20;
  `;

  const sampleCandidates = await client.query(query);
  console.log(`Found ${sampleCandidates.rows.length} candidate sample rows.`);

  if (sampleCandidates.rows.length > 0) {
    for (let i = 0; i < Math.min(3, sampleCandidates.rows.length); i++) {
      const candidate = sampleCandidates.rows[i];
      console.log(`\n--- Candidate #${i + 1} ---`);
      console.log('Chunk ID:', candidate.chunk_id);
      console.log('Source ref path:', candidate.source_ref);
      console.log('Source revision:', candidate.packet_source_revision);
      console.log('Workspace content digest:', candidate.workspace_content_digest);
      console.log('AST source content hash:', candidate.ast_source_hash);
      console.log('AST node kind & symbol:', candidate.node_kind, candidate.qualified_symbol);
      console.log('AST byte span: [', candidate.start_byte, ',', candidate.end_byte, ']');

      // Check current file on disk
      const filePath = path.resolve(__dirname, '..', candidate.source_ref);
      if (fs.existsSync(filePath)) {
        const currentBytes = fs.readFileSync(filePath);
        const currentHash = crypto.createHash('sha256').update(currentBytes).digest('hex');
        console.log('Current file bytes on disk:', currentBytes.length);
        console.log('Current whole-file SHA-256:', currentHash);
        const matchesWholeFile = (currentHash === candidate.workspace_content_digest);
        console.log('Whole-file hash matches workspace/AST digest?', matchesWholeFile);

        if (candidate.start_byte !== null && candidate.end_byte !== null) {
          const start = Number(candidate.start_byte);
          const end = Number(candidate.end_byte);
          if (start >= 0 && end <= currentBytes.length && start <= end) {
            const spanBytes = currentBytes.subarray(start, end);
            const spanDigest = crypto.createHash('sha256').update(spanBytes).digest('hex');
            console.log(`Extracted span (${spanBytes.length} bytes, SHA-256: ${spanDigest}):`);
            console.log(spanBytes.toString('utf8').slice(0, 120).replace(/\n/g, ' ') + '...');
          } else {
            console.log('Span bounds out of range for current file:', { start, end, fileLength: currentBytes.length });
          }
        } else {
          console.log('AST start_byte / end_byte is NULL for this node');
        }
      } else {
        console.log('File does NOT exist on disk at current HEAD:', filePath);
      }
    }
  }

  // Count total unique chunk IDs in this joined candidate pool
  const countQuery = `
    WITH candidate_chunks AS (
      SELECT 
        c.id as chunk_id,
        c.source_ref,
        p.source_revision
      FROM codebase_chunk_index c
      JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
      JOIN atlas_packets p ON p.packet_key = l.packet_key
      JOIN atlas_workspace_source_bindings b 
        ON b.source_revision = p.source_revision 
       AND b.canonical_source_ref = c.source_ref
      WHERE l.source_ref = c.source_ref 
        AND p.source_ref = c.source_ref
        AND l.source_revision = p.source_revision
        AND l.membership_status = 'PROVEN'
    )
    SELECT 
      count(DISTINCT cc.chunk_id) as unique_candidate_chunks,
      count(DISTINCT a.tree_node_id) as unique_ast_nodes,
      count(*) as total_joined_rows
    FROM candidate_chunks cc
    JOIN atlas_ast_nodes a 
      ON a.relative_path = cc.source_ref 
     AND a.source_revision = cc.source_revision;
  `;
  const counts = await client.query(countQuery);
  console.log('\n=== TOTAL CANDIDATE COUNTS ===');
  console.table(counts.rows[0]);

  await client.end();
}

main().catch(console.error);
