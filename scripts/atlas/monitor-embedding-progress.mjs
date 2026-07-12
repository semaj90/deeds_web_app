#!/usr/bin/env node

/**
 * Monitor Embedding Backfill Progress
 * Polls database every 10 seconds to show live coverage %
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

async function monitor() {
  console.log('\n🔄 Embedding Backfill Monitor (CTRL+C to exit)\n');
  console.log('Time       | Embedded | Coverage | Remaining | ETA (at current rate)');
  console.log('-----------|----------|----------|-----------|--------------------');

  const startTime = Date.now();
  let lastEmbedded = 0;

  const interval = setInterval(async () => {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) total, COUNT(CASE WHEN content_embedding_384 IS NOT NULL THEN 1 END) embedded FROM atlas_packets`
      );

      const { total, embedded } = result.rows[0];
      const pct = ((embedded / total) * 100).toFixed(1);
      const remaining = total - embedded;
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const intervalSeconds = 10;
      const packetsPerSecond = (embedded - lastEmbedded) / intervalSeconds;

      let eta = 'Unknown';
      if (packetsPerSecond > 0) {
        const secondsRemaining = remaining / packetsPerSecond;
        const minutes = Math.round(secondsRemaining / 60);
        eta = minutes > 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
      }

      const now = new Date().toLocaleTimeString();
      console.log(`${now} | ${String(embedded).padStart(8)} | ${String(pct).padStart(6)}% | ${String(remaining).padStart(9)} | ${eta}`);

      lastEmbedded = embedded;

      // Exit when done
      if (embedded >= total * 0.80) {
        console.log('\n✅ Reached 80% coverage. Stopping monitor.\n');
        process.exit(0);
      }

      // Also check eligible packets threshold if available
      // For now, 80% of all packets is the target
    } catch (err) {
      console.error('Monitor error:', err.message);
    }
  }, 10000); // poll every 10 seconds

  process.on('SIGINT', async () => {
    clearInterval(interval);
    await pool.end();
    process.exit(0);
  });
}

monitor().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
