import pg from 'pg';

const DOC_ID = 'a683d98d-f853-412c-a51f-8f4d74eb2447';
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

const [doc, nodes, chunks, types, articles] = await Promise.all([
	pool.query('SELECT id, title, corpus_type, page_count, processing_status, minio_key FROM library_documents WHERE id = $1', [DOC_ID]),
	pool.query('SELECT COUNT(*) as cnt FROM legal_nodes WHERE document_id = $1', [DOC_ID]),
	pool.query('SELECT COUNT(*) as cnt FROM legal_chunks WHERE legal_node_id IN (SELECT id FROM legal_nodes WHERE document_id = $1)', [DOC_ID]),
	pool.query('SELECT node_type, COUNT(*) as cnt FROM legal_nodes WHERE document_id = $1 GROUP BY node_type ORDER BY cnt DESC', [DOC_ID]),
	pool.query('SELECT heading, node_type, depth FROM legal_nodes WHERE document_id = $1 AND node_type = $2 ORDER BY page_start LIMIT 30', [DOC_ID, 'article']),
]);

const d = doc.rows[0];
console.log('Document:', d.title);
console.log('Status:', d.processing_status, '| Pages:', d.page_count, '| MinIO:', d.minio_key);
console.log('Nodes:', nodes.rows[0].cnt, '| Chunks:', chunks.rows[0].cnt);
console.log('');
console.log('Node types:');
types.rows.forEach((r) => console.log('  ' + r.node_type + ': ' + r.cnt));
console.log('');
console.log('Articles/Amendments:');
articles.rows.forEach((r) => console.log('  ' + r.heading));

await pool.end();
