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

  console.log('=== FIND EXACT CHUNK -> PACKET -> AST JOIN WITH MATCHING HASH ===');
  const res = await client.query(`
    SELECT 
      c.id as chunk_id,
      c.source_ref as chunk_source_ref,
      p.packet_key,
      p.source_revision as packet_source_rev,
      a.tree_node_id,
      a.relative_path as ast_path,
      a.node_kind,
      a.qualified_symbol,
      a.start_byte,
      a.end_byte,
      a.source_content_hash,
      a.source_revision as ast_source_rev
    FROM codebase_chunk_index c
    JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
    JOIN atlas_packets p ON p.packet_key = l.packet_key
    JOIN atlas_ast_nodes a 
      ON (a.relative_path = c.source_ref OR a.relative_path = regexp_replace(c.source_ref, '^sveltekit-frontend/', ''))
     AND (a.source_revision = p.source_revision OR a.source_content_hash = regexp_replace(p.source_revision, '^sha256:', ''))
    WHERE l.source_ref = c.source_ref
      AND p.source_ref = c.source_ref
    LIMIT 5;
  `);

  console.log(`Found ${res.rows.length} candidate rows with matching path and revision/hash:`);
  console.dir(res.rows, { depth: 3 });

  for (let i = 0; i < res.rows.length; i++) {
    const candidate = res.rows[i];
    console.log(`\n--- Evaluating Candidate #${i + 1} ---`);
    console.log('Chunk ID:', candidate.chunk_id);
    console.log('Path in chunk index:', candidate.chunk_source_ref);
    console.log('AST node symbol & kind:', candidate.qualified_symbol, `(${candidate.node_kind})`);
    console.log('AST byte span: [', candidate.start_byte, ',', candidate.end_byte, ']');
    console.log('AST source_content_hash:', candidate.source_content_hash);
    console.log('Packet source_revision:', candidate.packet_source_rev);

    // Resolve file on disk
    let candidatePath = candidate.chunk_source_ref;
    let fullPath = path.resolve(__dirname, '..', candidatePath);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(__dirname, '../sveltekit-frontend', candidate.chunk_source_ref);
    }
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(__dirname, '..', candidate.ast_path);
    }

    if (fs.existsSync(fullPath)) {
      const diskBytes = fs.readFileSync(fullPath);
      const diskHash = crypto.createHash('sha256').update(diskBytes).digest('hex');
      console.log(`File on disk (${diskBytes.length} bytes): ${fullPath}`);
      console.log(`Disk SHA-256: ${diskHash}`);

      const hashMatches = (diskHash === candidate.source_content_hash);
      console.log(`Disk SHA-256 matches AST source_content_hash? ${hashMatches ? 'YES (EXACT MATCH)' : 'NO (DRIFTED)'}`);

      if (candidate.start_byte != null && candidate.end_byte != null) {
        const start = Number(candidate.start_byte);
        const end = Number(candidate.end_byte);
        if (start >= 0 && end <= diskBytes.length && start <= end) {
          const spanBytes = diskBytes.subarray(start, end);
          const spanHash = crypto.createHash('sha256').update(spanBytes).digest('hex');
          console.log(`Extracted span (${spanBytes.length} bytes, SHA-256: ${spanHash}):`);
          console.log(spanBytes.toString('utf8').slice(0, 140).replace(/\n/g, ' ') + '...');
        } else {
          console.log('Byte span out of bounds on current file:', { start, end, fileSize: diskBytes.length });
        }
      }
    } else {
      console.log('File does NOT exist on disk at current HEAD:', fullPath);
    }
  }

  await client.end();
}

main().catch(console.error);
