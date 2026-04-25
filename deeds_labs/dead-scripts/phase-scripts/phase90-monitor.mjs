#!/usr/bin/env node
/**
 * Phase 90: Pipeline Monitor
 * Track progress of GPU clustering pipeline
 */

const QDRANT_URL = 'http://localhost:6333';
const CHECK_INTERVAL = 10000; // 10 seconds

let lastErrorCount = 0;
let lastClusterCount = 0;

async function checkProgress() {
  console.clear();
  console.log('\n🔮 Phase 90: GPU Clustering Pipeline Monitor\n');
  console.log('═'.repeat(70));

  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n⏰ Last Update: ${timestamp}\n`);

  try {
    // Check error cards
    const errorResp = await fetch(`${QDRANT_URL}/collections/phase90_error_cards`);
    if (errorResp.ok) {
      const errorData = await errorResp.json();
      const errorCount = errorData.result.points_count || 0;
      const errorDelta = errorCount - lastErrorCount;

      console.log('📊 Error Cards:');
      console.log(`   Total: ${errorCount.toLocaleString()} / 73,313 diagnostics`);
      if (errorDelta > 0) {
        console.log(`   ⬆️  +${errorDelta} since last check`);
      }
      console.log(`   Progress: ${(errorCount / 73313 * 100).toFixed(1)}%`);

      lastErrorCount = errorCount;
    } else {
      console.log('📊 Error Cards: Collection not ready');
    }

    console.log('');

    // Check cluster cards
    const clusterResp = await fetch(`${QDRANT_URL}/collections/phase90_error_clusters`);
    if (clusterResp.ok) {
      const clusterData = await clusterResp.json();
      const clusterCount = clusterData.result.points_count || 0;
      const clusterDelta = clusterCount - lastClusterCount;

      console.log('🎯 Cluster Cards:');
      console.log(`   Total: ${clusterCount} / ~12 expected clusters`);
      if (clusterDelta > 0) {
        console.log(`   ⬆️  +${clusterDelta} new clusters`);
      }

      if (clusterCount > 0) {
        console.log(`   Status: ✅ Clustering complete!`);
      }

      lastClusterCount = clusterCount;
    } else {
      console.log('🎯 Cluster Cards: Collection not ready');
    }

    console.log('\n' + '─'.repeat(70));

    // Estimate remaining time
    if (lastErrorCount > 0 && lastErrorCount < 73313) {
      const rate = lastErrorCount / ((Date.now() - startTime) / 1000); // per second
      const remaining = 73313 - lastErrorCount;
      const eta = remaining / rate;

      console.log(`\n⏱️  Estimated Time Remaining: ${Math.ceil(eta / 60)} minutes`);
    }

    console.log('\n💡 Commands:');
    console.log('   Ctrl+C to stop monitoring (pipeline continues in background)');
    console.log('   Query clusters: node scripts/phase90-query-clusters.mjs');

    console.log('\n' + '═'.repeat(70));

  } catch (error) {
    console.log(`\n⚠️  Error checking progress: ${error.message}`);
  }
}

const startTime = Date.now();

console.log('\n🚀 Starting Phase 90 Pipeline Monitor...\n');
console.log('Checking progress every 10 seconds...\n');

// Initial check
checkProgress();

// Check periodically
const interval = setInterval(checkProgress, CHECK_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Monitoring stopped. Pipeline continues in background.\n');
  clearInterval(interval);
  process.exit(0);
});
