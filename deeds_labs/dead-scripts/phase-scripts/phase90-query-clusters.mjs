#!/usr/bin/env node
/**
 * Phase 90: Query Error Clusters
 * Explore the GPU-clustered error patterns
 */

const QDRANT_URL = 'http://localhost:6333';

async function queryClusters() {
  console.log('\n🎯 Phase 90: Error Cluster Analysis\n');
  console.log('═'.repeat(70));

  try {
    // Get all clusters
    const response = await fetch(`${QDRANT_URL}/collections/phase90_error_clusters/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant query failed: ${response.statusText}`);
    }

    const data = await response.json();
    const clusters = data.result?.points || [];

    if (clusters.length === 0) {
      console.log('\n⏳ No clusters found yet. Pipeline may still be running.\n');
      console.log('Run: node scripts/phase90-monitor.mjs to track progress\n');
      return;
    }

    console.log(`\n📊 Found ${clusters.length} Error Clusters\n`);
    console.log('─'.repeat(70));

    // Sort by member count (largest clusters first)
    const sorted = clusters.sort((a, b) =>
      (b.payload.member_count || 0) - (a.payload.member_count || 0)
    );

    for (let i = 0; i < sorted.length; i++) {
      const cluster = sorted[i];
      const p = cluster.payload;

      console.log(`\n${i + 1}. Cluster: ${p.cluster_id || cluster.id}`);
      console.log(`   Error Code: ${p.dominant_code || 'Unknown'}`);
      console.log(`   Members: ${p.member_count || 0} errors`);

      if (p.top_files && p.top_files.length > 0) {
        console.log(`   Top Files:`);
        for (const file of p.top_files.slice(0, 5)) {
          console.log(`      • ${file}`);
        }
        if (p.top_files.length > 5) {
          console.log(`      ... and ${p.top_files.length - 5} more`);
        }
      }

      if (p.summary) {
        console.log(`   Summary: ${p.summary.substring(0, 100)}...`);
      }

      if (p.fix_suggestion) {
        console.log(`   Fix: ${p.fix_suggestion.substring(0, 100)}...`);
      }

      console.log('');
    }

    console.log('═'.repeat(70));

    // Statistics
    const totalErrors = sorted.reduce((sum, c) => sum + (c.payload.member_count || 0), 0);
    const topError = sorted[0]?.payload.dominant_code;
    const topCount = sorted[0]?.payload.member_count;

    console.log('\n📈 Statistics:');
    console.log(`   Total Errors Clustered: ${totalErrors.toLocaleString()}`);
    console.log(`   Most Common Pattern: ${topError} (${topCount} instances)`);
    console.log(`   Average Cluster Size: ${Math.round(totalErrors / clusters.length)}`);

    console.log('\n💡 Next Steps:');
    console.log('   • View individual cluster: node scripts/phase90-query-cluster.mjs <cluster_id>');
    console.log('   • Export to JSON: node scripts/phase90-query-clusters.mjs --json');
    console.log('   • Start Command Center UI: npm run dev\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
  }
}

// Handle --json export
const args = process.argv.slice(2);
if (args.includes('--json')) {
  // Export logic here
  console.log('JSON export not yet implemented');
} else {
  queryClusters();
}
