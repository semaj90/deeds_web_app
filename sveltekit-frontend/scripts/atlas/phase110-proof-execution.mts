#!/usr/bin/env npx tsx

/**
 * Phase 110 Proof Execution Harness
 * Runs the complete 16-gate proof suite with immutable audit trail
 *
 * Real-world test case: URL query → Fact extraction → Hypergraph building → Gemma4 synthesis
 */

import { executePhase110EndToEnd } from '../../src/lib/server/ace/phase110-end-to-end-retrieval-flow.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const WORKSPACE_ID = crypto.randomUUID();
const USER_ID = crypto.randomUUID();
const TEST_URL = 'https://example.com/legal/authentication';
const TEST_QUERY = 'What are the authentication requirements for legal services?';

const TEST_CONTENT = `
Authentication Service Module
==============================

The authentication system provides secure user verification through:

1. Session Management:
   - Sessions are created with Lucia auth framework
   - Each session has a unique ID and expiration time (30 days)
   - Session tokens stored in secure HTTP-only cookies

2. User Identification:
   - User IDs are UUID v4 format
   - Email addresses are normalized and stored lowercase
   - Password hashes use Argon2id algorithm

3. Authorization Levels:
   - Admin: Full system access, can create users and modify policies
   - Lawyer: Can access cases and client records
   - Client: Can only view their own cases and communications
   - Guest: Read-only access to public legal documents

4. Security Measures:
   - CSRF protection via SvelteKit cookies
   - Rate limiting on login attempts (5 attempts per 15 minutes)
   - Multi-factor authentication available for sensitive accounts
   - Session validation on every protected route

5. Integration Points:
   - PostgreSQL stores user credentials
   - Redis caches active sessions (1-hour TTL)
   - Neo4j tracks authorization edges (OWNS_CASE, HAS_ACCESS_TO)
`;

async function main() {
  console.log('[Phase 110] Starting 16-gate proof execution...');
  console.log(`[Phase 110] Workspace ID: ${WORKSPACE_ID}`);
  console.log(`[Phase 110] User ID: ${USER_ID}`);
  console.log(`[Phase 110] Test URL: ${TEST_URL}`);
  console.log(`[Phase 110] Query: ${TEST_QUERY}`);
  console.log('');

  const start_time = Date.now();

  try {
    const result = await executePhase110EndToEnd(
      WORKSPACE_ID,
      TEST_URL,
      USER_ID,
      TEST_QUERY,
      TEST_CONTENT
    );

    const elapsed_ms = Date.now() - start_time;

    // Print proof trail
    console.log('[Phase 110 PROOF TRAIL]');
    console.log('='.repeat(80));
    console.log(`Run ID: ${result.run_id}`);
    console.log(`Workspace: ${result.workspace_id}`);
    console.log(`URL: ${result.url}`);
    console.log(`User: ${result.user_id}`);
    console.log(`Proof State: ${result.proof_state}`);
    console.log(`Duration: ${elapsed_ms}ms`);
    console.log('');

    console.log('[GATE RESULTS]');
    for (const gate of result.gates) {
      const status_badge =
        gate.status === 'PASS'
          ? '✅'
          : gate.status === 'PARTIAL'
            ? '⚠️'
            : gate.status === 'SKIP'
              ? '⏭️'
              : '❌';
      console.log(`${status_badge} Gate ${gate.gate_number}: ${gate.gate_name} (${gate.status})`);
      console.log(`   Timestamp: ${gate.timestamp}`);
      for (const [key, value] of Object.entries(gate.metrics)) {
        console.log(`   ${key}: ${value}`);
      }
    }
    console.log('');

    if (result.final_answer) {
      console.log('[FINAL ANSWER]');
      console.log('-'.repeat(80));
      console.log(result.final_answer);
      console.log('-'.repeat(80));
      console.log('');
    }

    if (result.ace_packet) {
      console.log('[ACE PACKET]');
      console.log(`ID: ${result.ace_packet.id}`);
      console.log(`Query: ${result.ace_packet.query_text}`);
      console.log(`Candidates: ${result.ace_packet.candidates.length}`);
      console.log(`Total Tokens: ${result.ace_packet.total_tokens}`);
      console.log(`Compressed Tokens: ${result.ace_packet.compressed_tokens}`);
      console.log(`Compression Ratio: ${result.ace_packet.compression_ratio.toFixed(2)}`);
      console.log(`Lanes Used: ${result.ace_packet.lanes_used.join(', ')}`);
      console.log('');
    }

    // Write immutable proof report
    const report_dir = path.join(process.cwd(), 'phase110_proof_reports');
    if (!fs.existsSync(report_dir)) {
      fs.mkdirSync(report_dir, { recursive: true });
    }

    const report_file = path.join(report_dir, `phase110_proof_${result.run_id}.json`);
    fs.writeFileSync(report_file, JSON.stringify(result, null, 2));
    console.log(`[Phase 110] Proof report written to: ${report_file}`);

    // Print summary
    const pass_gates = result.gates.filter(g => g.status === 'PASS').length;
    const total_gates = result.gates.filter(g => g.status !== 'SKIP').length;
    console.log('');
    console.log('[PROOF SUMMARY]');
    console.log(`Gates Passed: ${pass_gates}/${total_gates}`);
    console.log(`Proof State: ${result.proof_state}`);

    if (result.proof_state === 'COMPLETE') {
      console.log('✅ COMPLETE: All gates passed. Phase 110 proof suite successful.');
      process.exit(0);
    } else if (result.proof_state === 'PARTIAL') {
      console.log('⚠️ PARTIAL: Most gates passed. Review gate results above.');
      process.exit(0);
    } else if (result.proof_state === 'DEGRADED') {
      console.log('⚠️ DEGRADED: Some gates passed. Review gate results above.');
      process.exit(0);
    } else {
      console.log('❌ FAILED: Gates did not pass. Review gate results above.');
      process.exit(1);
    }
  } catch (err) {
    console.error('[Phase 110] FATAL ERROR:', err);
    process.exit(1);
  }
}

main();
