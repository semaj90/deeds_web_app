/**
 * Test script for atlas.identity_audit and atlas.cross_store_proof MCP tools
 *
 * This script directly invokes the tool handlers without requiring MCP server startup.
 * Useful for rapid iteration and debugging.
 */

import { handleAtlasIdentityAudit, handleAtlasCrossStoreProof } from '../../src/mcp/atlas_identity_audit_tools.js';

const isVerbose = process.argv.includes('--verbose');

async function main() {
  console.log('═'.repeat(80));
  console.log('TESTING: atlas.identity_audit (Phase 1 — Postgres only)');
  console.log('═'.repeat(80));

  try {
    const auditResult = await handleAtlasIdentityAudit({
      packet_limit: 1000,
      include_qdrant_payloads: false,
      include_neo4j_nodes: false,
      include_redis_centroids: false,
      verbose: isVerbose,
    });

    console.log('\n[Phase 1 Audit Result]');
    console.log(JSON.stringify(auditResult, null, 2));

    console.log('\n' + '═'.repeat(80));
    console.log('TESTING: atlas.cross_store_proof (Phase 1 Gate Report)');
    console.log('═'.repeat(80));

    const proofResult = await handleAtlasCrossStoreProof({
      gate_name: 'ATLAS_CROSS_STORE_IDENTITY_PROVEN',
      phase: '1',
      show_blockers: true,
      show_five_counts: true,
    });

    console.log('\n[Phase 1 Gate Proof]');
    console.log(JSON.stringify(proofResult, null, 2));

    console.log('\n' + '═'.repeat(80));
    console.log('SUCCESS: Both tools executed without errors');
    console.log('═'.repeat(80));

    console.log('\n[Summary]');
    console.log(`- Postgres packets found: ${auditResult.postgres_count}`);
    console.log(`- Gate status: ${proofResult.status}`);
    console.log(`- Pass criterion: ${proofResult.pass_criterion}`);
    console.log(`- Blockers: ${proofResult.blockers.length}`);
    console.log(`- Next action: ${proofResult.next_action}`);

    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err instanceof Error ? err.message : String(err));
    if (isVerbose && err instanceof Error) {
      console.error('[Stack]', err.stack);
    }
    process.exit(1);
  }
}

main();
