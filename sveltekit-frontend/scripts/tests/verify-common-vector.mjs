import pg from 'pg';
import fetch from 'node-fetch';

const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function findCommonAndCompare() {
  try {
    console.log("🔍 Finding common file between PG and Qdrant...");
    
    // 1. Get 50 files from PG
    const { rows: pgRows } = await pool.query("SELECT relative_path FROM codebase_chunk_index WHERE content_embedding IS NOT NULL LIMIT 50");
    const pgPaths = new Set(pgRows.map(r => r.relative_path));
    console.log(`  PG has ${pgPaths.size} paths with vectors (sample)`);

    // 2. Get 100 files from Qdrant
    const qRes = await fetch('http://localhost:6333/collections/codebase_chunks_768/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true })
    });
    const qData = await qRes.json();
    const qPoints = qData.result.points;
    console.log(`  Qdrant has ${qPoints.length} points (sample)`);

    // 3. Find intersection
    let commonPath = null;
    let commonQPoint = null;
    for (const p of qPoints) {
      const path = p.payload.relativePath || p.payload.path || p.payload.stable_key;
      if (pgPaths.has(path)) {
        commonPath = path;
        commonQPoint = p;
        break;
      }
    }

    if (!commonPath) {
      console.log("❌ No common paths found in samples. PG paths sampled:", Array.from(pgPaths).slice(0, 5));
      console.log("   Qdrant paths sampled:", qPoints.slice(0, 5).map(p => p.payload.relativePath || p.payload.path));
      return;
    }

    console.log(`✅ Found common file: ${commonPath}`);

    // 4. Get vectors and compare
    const { rows: finalPg } = await pool.query("SELECT content_embedding FROM codebase_chunk_index WHERE relative_path = $1 LIMIT 1", [commonPath]);
    const pgVec = JSON.parse(finalPg[0].content_embedding);

    const qFull = await fetch(`http://localhost:6333/collections/codebase_chunks_768/points/${commonQPoint.id}`);
    const qFullData = await qFull.json();
    const qVec = qFullData.result.vector.content || qFullData.result.vector;

    let dot = 0;
    let magPg = 0;
    let magQ = 0;
    for (let i = 0; i < pgVec.length; i++) {
      dot += pgVec[i] * qVec[i];
      magPg += pgVec[i] * pgVec[i];
      magQ += qVec[i] * qVec[i];
    }
    const cosine = dot / (Math.sqrt(magPg) * Math.sqrt(magQ));
    console.log(`Cosine Similarity for ${commonPath}:`, cosine.toFixed(6));

    if (cosine > 0.99) {
      console.log("✅ Vectors match perfectly!");
    } else {
      console.log("⚠️ Vectors differ! Cosine similarity:", cosine);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

findCommonAndCompare();
