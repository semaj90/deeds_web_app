#!/usr/bin/env node
/**
 * Phase 78 - Check Results
 *
 * Displays current status of Phase 78 error tracking:
 * - Total errors in error_events
 * - Route health distribution
 * - Cluster statistics
 * - Suggestion statistics
 *
 * Usage:
 *   npm run phase78:check-results
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { errorEventsTable, errorSuggestionsTable, routeHealthTable } from '../src/lib/server/db/schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { onnotice: () => {} });
const db = drizzle(client);

async function checkResults() {
  console.log('\n📊 Phase 78 - Error Tracking Results\n');

  try {
    // Count errors by severity
    const errorCounts = await db
      .select({
        severity: errorEventsTable.severity,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(errorEventsTable)
      .groupBy(errorEventsTable.severity);

    const totalErrors = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(errorEventsTable);

    console.log('📈 Error Events:');
    console.log(`   Total errors: ${totalErrors[0]?.count || 0}`);

    if (errorCounts.length > 0) {
      for (const { severity, count } of errorCounts) {
        console.log(`   ${severity}: ${count}`);
      }
    }

    // Route health distribution
    const healthDist = await db
      .select({
        state: routeHealthTable.errorState,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(routeHealthTable)
      .groupBy(routeHealthTable.errorState);

    const totalRoutes = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(routeHealthTable);

    console.log('\n🏥 Route Health:');
    console.log(`   Total routes: ${totalRoutes[0]?.count || 0}`);

    if (healthDist.length > 0) {
      for (const { state, count } of healthDist) {
        const icon = state === 'healthy' ? '✅' : state === 'flaky' ? '⚠️' : '❌';
        console.log(`   ${icon} ${state}: ${count}`);
      }
    }

    // Cluster statistics
    const clusterCounts = await db
      .select({ count: sql<number>`COUNT(DISTINCT cluster_id)`.as('count') })
      .from(errorEventsTable);

    const avgClusterSize = await db
      .select({
        clusterId: errorEventsTable.clusterId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(errorEventsTable)
      .groupBy(errorEventsTable.clusterId)
      .then(rows => {
        const sizes = rows.map(r => r.count);
        return sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
      });

    console.log('\n🧠 Clustering:');
    console.log(`   Clusters: ${clusterCounts[0]?.count || 0}`);
    console.log(`   Avg cluster size: ${avgClusterSize}`);

    // Suggestion statistics
    const suggestionCounts = await db
      .select({
        riskLevel: errorSuggestionsTable.riskLevel,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(errorSuggestionsTable)
      .groupBy(errorSuggestionsTable.riskLevel);

    const appliedCount = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(errorSuggestionsTable)
      .where(sql`applied = true`);

    const totalSuggestions = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(errorSuggestionsTable);

    console.log('\n💡 Suggestions:');
    console.log(`   Total suggestions: ${totalSuggestions[0]?.count || 0}`);
    console.log(`   Applied: ${appliedCount[0]?.count || 0}`);

    if (suggestionCounts.length > 0) {
      for (const { riskLevel, count } of suggestionCounts) {
        const icon = riskLevel === 'low' ? '🟢' : riskLevel === 'medium' ? '🟡' : '🔴';
        console.log(`   ${icon} ${riskLevel}: ${count}`);
      }
    }

    console.log('\n✅ Phase 78 status check complete\n');

  } catch (err) {
    console.error('❌ Failed to check results:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkResults();
