import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Work from workspace root or parent of scripts
const rootDir = process.cwd().replace(/\\/g, '/');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("⚠️ DATABASE_URL not set. Writing dummy cache report.");
    const dummyReport = {
      generatedAt: new Date().toISOString(),
      totalTraces: 0,
      hitRates: {
        redisExact: 0,
        redisSemantic: 0,
        qdrant: 0,
        postgresHybrid: 0
      },
      avgLatencyMs: 0
    };
    writeReport(dummyReport);
    return;
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const res = await pool.query('SELECT hits, token_estimate, latency_ms FROM retrieval_cache_traces LIMIT 1000');
    const traces = res.rows;
    
    let total = traces.length;
    let redisExactHits = 0;
    let redisSemanticHits = 0;
    let qdrantHits = 0;
    let pgHits = 0;
    let totalLatency = 0;
    
    for (const row of traces) {
      const hits = typeof row.hits === 'string' ? JSON.parse(row.hits) : row.hits || {};
      if (hits.redisExact) redisExactHits++;
      if (hits.redisSemantic) redisSemanticHits++;
      if (hits.qdrant) qdrantHits++;
      if (hits.postgresHybrid) pgHits++;
      totalLatency += row.latency_ms || 0;
    }
    
    const report = {
      generatedAt: new Date().toISOString(),
      totalTraces: total,
      hitRates: {
        redisExact: total ? (redisExactHits / total) : 0,
        redisSemantic: total ? (redisSemanticHits / total) : 0,
        qdrant: total ? (qdrantHits / total) : 0,
        postgresHybrid: total ? (pgHits / total) : 0
      },
      avgLatencyMs: total ? (totalLatency / total) : 0
    };
    
    writeReport(report);
  } catch (err) {
    console.error("❌ Failed to query retrieval cache traces:", err);
    writeReport({ error: err.message, generatedAt: new Date().toISOString() });
  } finally {
    await pool.end();
  }
}

function writeReport(data) {
  const outPath = path.join(rootDir, 'docs', 'reports', 'cache-hit-protocol-lane-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[cache-hit-protocol-report] Successfully wrote report to ${outPath}`);
}

main();
