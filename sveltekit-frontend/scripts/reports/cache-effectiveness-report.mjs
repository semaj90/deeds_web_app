import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function generateReport() {
  console.log('📊 Generating Cache Effectiveness Report...');

  // 1. Fetch Synthesis Logs
  let rows = [];
  try {
    const res = await pool.query('SELECT * FROM synthesis_logs ORDER BY created_at DESC LIMIT 500');
    rows = res.rows;
  } catch (err) {
    console.error('Error fetching synthesis_logs:', err.message);
  }

  let totalRuns = rows.length;
  let llmOutputHits = 0;
  let bifrostHits = 0;
  let centroidHits = 0;
  let graphCacheHits = 0;
  
  let nonCachedLatencies = [];
  let cachedLatencies = [];

  for (const row of rows) {
    const trace = row.cache_trace || {};
    const metadata = row.metadata || {};
    // Extract layer correctly from wherever it's stored in older vs newer rows
    const layer = row.cache_layer_used || trace.layerUsed || metadata.cacheLayerUsed || 'none';
    
    if (layer === 'llm_output') llmOutputHits++;
    if (layer === 'bifrost_semantic') bifrostHits++;
    if (layer === 'centroid') centroidHits++;
    if (layer === 'graph' || trace.layerUsed === 'graph') graphCacheHits++;
    
    const latencyMs = metadata.latencyMs || 0;
    if (latencyMs > 0) {
      if (layer === 'none') {
        nonCachedLatencies.push(latencyMs);
      } else {
        cachedLatencies.push(latencyMs);
      }
    }
  }

  const avgNonCached = nonCachedLatencies.length ? nonCachedLatencies.reduce((a, b) => a + b) / nonCachedLatencies.length : 0;
  const avgCached = cachedLatencies.length ? cachedLatencies.reduce((a, b) => a + b) / cachedLatencies.length : 0;
  const latencySavedMs = Math.max(0, avgNonCached - avgCached);

  // 2. Fallback Count from Redis Learning Strategies
  const fallbackStrats = await redis.zscore('learning:strategy_weights', 'failure_lookup');
  const fallbackCount = fallbackStrats ? parseFloat(fallbackStrats) : 0;

  const report = {
    timestamp: new Date().toISOString(),
    total_runs_analyzed: totalRuns,
    hit_rates: {
      llm_output: totalRuns > 0 ? ((llmOutputHits / totalRuns) * 100).toFixed(2) + '%' : '0%',
      bifrost_prefix: totalRuns > 0 ? ((bifrostHits / totalRuns) * 100).toFixed(2) + '%' : '0%',
      centroid: totalRuns > 0 ? ((centroidHits / totalRuns) * 100).toFixed(2) + '%' : '0%',
      graph_cache: totalRuns > 0 ? ((graphCacheHits / totalRuns) * 100).toFixed(2) + '%' : '0%'
    },
    latency_heuristics: {
      avg_non_cached_ms: Math.round(avgNonCached),
      avg_cached_ms: Math.round(avgCached),
      latency_saved_ms: Math.round(latencySavedMs)
    },
    fallback_count: Math.abs(Math.round(fallbackCount))
  };

  const reportPath = path.resolve(ROOT_DIR, 'docs/reports/cache-effectiveness-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  
  console.log(`✅ Saved report to ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  redis.disconnect();
}

generateReport().catch(err => {
  console.error(err);
  process.exit(1);
});
