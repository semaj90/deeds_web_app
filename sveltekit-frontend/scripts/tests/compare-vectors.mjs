import pg from 'pg';
import fetch from 'node-fetch';

const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function compare() {
  try {
    const { rows } = await pool.query("SELECT relative_path, content_embedding FROM codebase_chunk_index WHERE relative_path LIKE '%evidence.ts%' LIMIT 1");
    if (rows.length === 0) {
      console.log('❌ Not found in PG');
      return;
    }
    const pgVec = JSON.parse(rows[0].content_embedding);
    console.log('PG Path:', rows[0].relative_path);

    const qRes = await fetch('http://localhost:6333/collections/codebase_chunks_768/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true, with_vector: true })
    });
    const qData = await qRes.json();
    const qPoint = qData.result.points.find(p => (p.payload.relativePath || p.payload.path || p.payload.stable_key || '').includes('evidence.ts'));
    
    if (!qPoint) {
      console.log('❌ Not found in Qdrant');
      return;
    }
    const qVec = qPoint.vector.content || qPoint.vector;
    console.log('Qdrant Path:', qPoint.payload.relativePath || qPoint.payload.path || qPoint.payload.stable_key);

    console.log('PG Vec (first 5):', pgVec.slice(0, 5));
    console.log('Qdrant Vec (first 5):', qVec.slice(0, 5));

    let dot = 0;
    let magPg = 0;
    let magQ = 0;
    for (let i = 0; i < pgVec.length; i++) {
      dot += pgVec[i] * qVec[i];
      magPg += pgVec[i] * pgVec[i];
      magQ += qVec[i] * qVec[i];
    }
    const cosine = dot / (Math.sqrt(magPg) * Math.sqrt(magQ));
    console.log('Cosine Similarity:', cosine);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

compare();
