#!/usr/bin/env node
/**
 * Record Parent Atlas Phase/Gate Completion Proofs
 *
 * Purpose: Telemetry tracking for P1–P7 phases. Records story_id, phase, gate, status,
 * and proof_data to atlas_story_proofs for audit trail and gate-driven promotion flow.
 *
 * Usage:
 *   npm run atlas:phase-proof -- --story-id=ATLAS-P1-VERIFY --phase=P1 --gate=feature-envelope --status=PASS
 *   npm run atlas:phase-proof -- --story-id=ATLAS-P3-VERIFY --phase=P3 --gate=qdrant-join --status=PASS --report=reports/qdrant-join-audit.json
 */

const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1];
const PHASE = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1];
const GATE = process.argv.find(a => a.startsWith('--gate='))?.split('=')[1];
const STATUS = process.argv.find(a => a.startsWith('--status='))?.split('=')[1];
const REPORT_PATH = process.argv.find(a => a.startsWith('--report='))?.split('=')[1] || null;
const VERBOSE = process.argv.includes('--verbose');

// Validation
if (!STORY_ID || !PHASE || !GATE || !STATUS) {
  console.error(`
❌ Missing required arguments:
   --story-id=<ID>     Story identifier (e.g., ATLAS-P1-VERIFY)
   --phase=<P>         Phase number (e.g., P1, P2, P3)
   --gate=<NAME>       Gate name (e.g., feature-envelope, qdrant-join, gds-cluster)
   --status=<STATUS>   Status: PASS, FAIL, PENDING, REVIEW

Optional:
   --report=<PATH>     Path to report JSON file (relative or absolute)
   --verbose           Show detailed output
  `);
  process.exit(1);
}

// Validate status
if (!['PASS', 'FAIL', 'PENDING', 'REVIEW'].includes(STATUS)) {
  console.error(`❌ Invalid status: ${STATUS}. Must be PASS, FAIL, PENDING, or REVIEW`);
  process.exit(1);
}

async function recordPhaseProof() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const fs = await import('fs');
    const path = await import('path');

    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Parent Atlas Phase/Gate Proof Recording                ║
╚════════════════════════════════════════════════════════════════╝

Story ID:      ${STORY_ID}
Phase:         ${PHASE}
Gate:          ${GATE}
Status:        ${STATUS}
Report:        ${REPORT_PATH || '(none)'}
Timestamp:     ${new Date().toISOString()}

`);

      // 1. Load report data if path provided
      let reportData = null;
      if (REPORT_PATH) {
        try {
          const reportFullPath = path.resolve(REPORT_PATH);
          if (VERBOSE) console.log(`📄 Loading report from: ${reportFullPath}\n`);

          const reportContent = fs.readFileSync(reportFullPath, 'utf-8');
          reportData = JSON.parse(reportContent);

          if (VERBOSE) {
            console.log(`✓ Report loaded: ${JSON.stringify(reportData).length} bytes\n`);
          }
        } catch (err) {
          console.warn(`⚠️  Could not load report: ${err.message}\n`);
        }
      }

      // 2. Construct proof data
      const proofData = {
        phase: PHASE,
        gate: GATE,
        status: STATUS,
        timestamp: new Date().toISOString(),
        report_path: REPORT_PATH || null,
        report_data: reportData,
        recorded_by: 'atlas:phase-proof-recorder',
        version: '1.0'
      };

      // 3. Insert into atlas_story_proofs
      console.log('📋 Recording proof in atlas_story_proofs...\n');

      const insertRes = await pool.query(`
        INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (story_id, stage, action) DO UPDATE
          SET proof_data = $4
      `, [
        STORY_ID,
        `phase_${PHASE}`,
        `gate_${GATE}`,
        JSON.stringify(proofData)
      ]);

      console.log(`✅ Recorded phase proof for ${STORY_ID}`);
      console.log(`   Phase: ${PHASE}, Gate: ${GATE}, Status: ${STATUS}\n`);

      // 4. Fetch and display the recorded proof
      const verifyRes = await pool.query(`
        SELECT
          story_id,
          (proof_data->>'phase') as phase,
          (proof_data->>'gate') as gate,
          (proof_data->>'status') as status,
          (proof_data->>'timestamp') as timestamp,
          created_at
        FROM atlas_story_proofs
        WHERE story_id = $1 AND proof_data->>'phase' = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [STORY_ID, PHASE]);

      if (verifyRes.rows.length > 0) {
        const proof = verifyRes.rows[0];
        console.log('✓ Proof verified in database:');
        console.log(`  Story ID:    ${proof.story_id}`);
        console.log(`  Phase:       ${proof.phase}`);
        console.log(`  Gate:        ${proof.gate}`);
        console.log(`  Status:      ${proof.status}`);
        console.log(`  Recorded at: ${proof.timestamp}\n`);
      }

      console.log(`═════════════════════════════════════════════════════════════════\n`);

      // 5. Check if this closes a phase (all gates PASS)
      const gateCheckRes = await pool.query(`
        SELECT
          (proof_data->>'gate') as gate,
          (proof_data->>'status') as status
        FROM atlas_story_proofs
        WHERE story_id LIKE $1 || '-%'
          AND proof_data->>'phase' = $2
          AND proof_data->>'gate' IS NOT NULL
        ORDER BY created_at DESC
      `, [STORY_ID.replace(/-\d+$/, ''), PHASE]);

      const gates = gateCheckRes.rows;
      const passCount = gates.filter(g => g.status === 'PASS').length;
      const totalGates = gates.length;

      if (totalGates > 0) {
        console.log(`📊 Phase ${PHASE} gate status (${passCount}/${totalGates} PASS):\n`);
        gates.forEach(g => {
          const icon = g.status === 'PASS' ? '✅' : g.status === 'FAIL' ? '❌' : '⏳';
          console.log(`   ${icon} ${g.gate}: ${g.status}`);
        });
        console.log('');

        if (passCount === totalGates && STATUS === 'PASS') {
          console.log(`🎉 Phase ${PHASE} COMPLETE — All gates PASS!\n`);
        }
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Phase proof recording failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

recordPhaseProof();
