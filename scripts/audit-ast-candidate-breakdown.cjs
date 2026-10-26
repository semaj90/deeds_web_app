const { Client } = require('pg');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const client = new Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5434'),
  database: process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456'
});

async function main() {
  await client.connect();

  console.log('=== AUDITING THE 1,676 AST CANDIDATE CHUNKS ===');
  
  // Query candidate chunks with AST nodes and workspace bindings
  const query = `
    WITH candidate_chunks AS (
      SELECT 
        c.id as chunk_id,
        c.source_ref,
        p.packet_key,
        p.source_revision,
        p.byte_start as packet_byte_start,
        p.byte_end as packet_byte_end,
        p.workspace_revision_key
      FROM codebase_chunk_index c
      JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
      JOIN atlas_packets p ON p.packet_key = l.packet_key
      WHERE l.source_ref = c.source_ref 
        AND p.source_ref = c.source_ref
        AND l.source_revision = p.source_revision
        AND l.revision_status = 'PROVEN'
    ),
    ast_matches AS (
      SELECT 
        cc.chunk_id,
        cc.source_ref,
        cc.packet_key,
        cc.source_revision,
        cc.packet_byte_start,
        cc.packet_byte_end,
        a.tree_node_id,
        a.workspace_id,
        a.node_kind,
        a.qualified_symbol,
        a.start_byte,
        a.end_byte,
        a.source_content_hash,
        a.superseded_by,
        b.content_digest as workspace_content_digest
      FROM candidate_chunks cc
      JOIN atlas_workspace_source_bindings b 
        ON b.source_revision = cc.source_revision 
       AND (b.canonical_source_ref = cc.source_ref OR b.canonical_source_ref = regexp_replace(cc.source_ref, '^sveltekit-frontend/', ''))
      JOIN atlas_ast_nodes a 
        ON (a.relative_path = cc.source_ref OR a.relative_path = regexp_replace(cc.source_ref, '^sveltekit-frontend/', ''))
       AND (a.source_revision = cc.source_revision OR a.source_revision = regexp_replace(cc.source_revision, '^sha256:', ''))
    )
    SELECT * FROM ast_matches;
  `;

  const res = await client.query(query);
  console.log('Total joined AST match rows:', res.rows.length);

  // Group by chunk_id
  const chunksMap = new Map();
  for (const r of res.rows) {
    if (!chunksMap.has(r.chunk_id)) chunksMap.set(r.chunk_id, []);
    chunksMap.get(r.chunk_id).push(r);
  }
  console.log('Unique chunk IDs matching AST:', chunksMap.size);

  let singleAstMatch = 0;
  let multipleAstMatches = 0;
  let hasValidByteSpans = 0;
  let hasMatchingDigest = 0;
  let notSuperseded = 0;
  let diskByteVerified = 0;

  for (const [chunkId, nodes] of chunksMap.entries()) {
    if (nodes.length === 1) singleAstMatch++;
    else multipleAstMatches++;

    const allValidSpans = nodes.every(n => n.start_byte != null && n.end_byte != null && Number(n.end_byte) > Number(n.start_byte));
    if (allValidSpans) hasValidByteSpans++;

    const allMatchingDigest = nodes.every(n => {
      const astHash = String(n.source_content_hash).replace(/^sha256:/i, '');
      const wsHash = String(n.workspace_content_digest).replace(/^sha256:/i, '');
      return astHash === wsHash;
    });
    if (allMatchingDigest) hasMatchingDigest++;

    const allNotSuperseded = nodes.every(n => n.superseded_by == null);
    if (allNotSuperseded) notSuperseded++;

    // Test first node against disk if single match
    if (nodes.length === 1) {
      const n = nodes[0];
      let p = n.source_ref;
      let fullPath = path.resolve(__dirname, '..', p);
      if (!fs.existsSync(fullPath)) {
        fullPath = path.resolve(__dirname, '../sveltekit-frontend', p);
      }
      if (fs.existsSync(fullPath)) {
        const diskBytes = fs.readFileSync(fullPath);
        const diskHash = crypto.createHash('sha256').update(diskBytes).digest('hex');
        const astHash = String(n.source_content_hash).replace(/^sha256:/i, '');
        if (diskHash === astHash) diskByteVerified++;
      }
    }
  }

  console.log({
    uniqueCandidateChunks: chunksMap.size,
    singleAstMatch,
    multipleAstMatches,
    hasValidByteSpans,
    hasMatchingDigest,
    notSuperseded,
    diskByteVerified
  });

  await client.end();
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
