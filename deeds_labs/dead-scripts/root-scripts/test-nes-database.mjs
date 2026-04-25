/**
 * NES Command Center Database Test
 *
 * Tests database connection and query helpers to verify Phase 6 implementation.
 * Run with: node test-nes-database.mjs
 */

import { testConnection, healthCheck, closePool } from './src/lib/db/pool.ts';
import {
  getAllRouteMetadata,
  getAllEnrichedRouteMetadata,
  getErrorClusters,
  getHealthEvents,
} from './src/lib/db/queries/nes-command-center.ts';

console.log('🧪 NES Command Center Database Test\n');

async function runTests() {
  let exitCode = 0;

  try {
    // Test 1: Connection Test
    console.log('1️⃣  Testing database connection...');
    const isConnected = await testConnection();
    if (isConnected) {
      console.log('   ✅ Database connection successful\n');
    } else {
      console.log('   ❌ Database connection failed\n');
      exitCode = 1;
    }

    // Test 2: Health Check
    console.log('2️⃣  Running health check...');
    const health = await healthCheck();
    console.log(`   Response time: ${health.responseTime}ms`);
    if (health.healthy) {
      console.log('   ✅ Database is healthy\n');
    } else {
      console.log(`   ❌ Database is unhealthy: ${health.error}\n`);
      exitCode = 1;
    }

    // Test 3: Query Route Metadata
    console.log('3️⃣  Querying route metadata...');
    const routes = await getAllRouteMetadata();
    console.log(`   Found ${routes.length} routes in database`);
    if (routes.length > 0) {
      console.log('   ✅ Route metadata query successful');
      console.log(`   Sample route: ${routes[0].path} (${routes[0].kind})\n`);
    } else {
      console.log('   ⚠️  No routes found in database (this is expected if database is empty)\n');
    }

    // Test 4: Query Enriched Route Metadata
    console.log('4️⃣  Querying enriched route metadata...');
    const enrichedRoutes = await getAllEnrichedRouteMetadata();
    console.log(`   Found ${enrichedRoutes.length} enriched routes`);
    if (enrichedRoutes.length > 0) {
      const sample = enrichedRoutes[0];
      console.log('   ✅ Enriched metadata query successful');
      console.log(`   Sample enriched route:`);
      console.log(`     - Path: ${sample.path}`);
      console.log(`     - Status: ${sample.healthStatus || sample.status}`);
      console.log(`     - Error count: ${sample.errorCount}`);
      console.log(`     - Suggestion count: ${sample.suggestionCount}\n`);
    } else {
      console.log('   ⚠️  No enriched routes found (database may be empty)\n');
    }

    // Test 5: Query Error Clusters (if routes exist)
    if (routes.length > 0) {
      console.log('5️⃣  Querying error clusters...');
      const routeId = routes[0].routeId;
      const { clusters, total } = await getErrorClusters(routeId, { limit: 5 });
      console.log(`   Found ${total} error clusters for route: ${routeId}`);
      if (clusters.length > 0) {
        console.log('   ✅ Error cluster query successful');
        console.log(`   Sample error: ${clusters[0].message}\n`);
      } else {
        console.log('   ⚠️  No error clusters found for this route\n');
      }

      // Test 6: Query Health Events
      console.log('6️⃣  Querying health events...');
      const { events, total: healthTotal } = await getHealthEvents(routeId, { limit: 5 });
      console.log(`   Found ${healthTotal} health events for route: ${routeId}`);
      if (events.length > 0) {
        console.log('   ✅ Health event query successful');
        console.log(`   Latest status: ${events[0].newStatus}\n`);
      } else {
        console.log('   ⚠️  No health events found for this route\n');
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Test Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Database Connection: ${isConnected ? '✅' : '❌'}`);
    console.log(`Health Check: ${health.healthy ? '✅' : '❌'}`);
    console.log(`Route Metadata: ${routes.length} routes`);
    console.log(`Enriched Metadata: ${enrichedRoutes.length} routes`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (routes.length === 0) {
      console.log('💡 Next Steps:');
      console.log('   1. Run route scanner to populate route_metadata table');
      console.log('   2. Import error logs into error_cluster table');
      console.log('   3. Generate health events from build logs\n');
    } else {
      console.log('✅ Database is ready for Phase 6 testing!');
      console.log('   Navigate to http://localhost:5173/all-routes to see enriched data\n');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    exitCode = 1;
  } finally {
    // Close database connection
    await closePool();
    console.log('🔌 Database connection closed');
    process.exit(exitCode);
  }
}

// Run tests
runTests();
