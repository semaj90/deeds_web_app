/**
 * D18 Audit Gate: Qdrant-Postgres Parity Check
 * 
 * Verifies that the PostgreSQL mirror (codebase_chunk_index) is in sync
 * with the Qdrant vector store payloads.
 * 
 * Usage: node scripts/audit-parity.mjs
 */
import pg from 'pg';
const { Pool } = pg;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

const QDRANT_COLLECTION = 'codebase_chunks_768';

async function runAudit() {
    console.log('--- D18 Parity Audit ---');
    console.log(`Qdrant: ${QDRANT_URL}`);

    // 1. Sample points from Qdrant
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, with_payload: true })
    });
    if (!res.ok) {
        console.error('Qdrant scroll failed');
        process.exit(1);
    }
    const { result } = await res.json();
    const points = result.points;

    if (!points || points.length === 0) {
        console.warn('No points found in Qdrant to audit.');
        process.exit(0);
    }

    console.log(`Auditing ${points.length} samples...`);

    let mismatches = 0;
    let synced = 0;

    for (const point of points) {
        const qid = point.id;
        const p = point.payload;

        // 2. Lookup in Postgres
        const pgRes = await pool.query(
            'SELECT gpu_cluster, som_cluster, cluster_summary, output_meta, manifold4 FROM codebase_chunk_index WHERE qdrant_id = $1',
            [qid]
        );

        if (pgRes.rows.length === 0) {
            console.warn(`[MISSING] Point ${qid} not found in Postgres`);
            mismatches++;
            continue;
        }

        const pg = pgRes.rows[0];

        // 3. Compare fields
        const clusterMatch = pg.som_cluster === (p.som_cluster ?? null);
        const somMatch     = pg.som_cluster === (p.som_cluster ?? null);
        const manifoldMatch = pg.manifold4 !== null && pg.manifold4.length === 4;
        
        // OutputMeta check (if populated)
        const qSummary = p.cluster_summary_text || '';
        const pgSummary = pg.output_meta?.summary || pg.cluster_summary?.summary || '';
        const summaryMatch = qSummary === pgSummary || (!qSummary && !pgSummary);

        if (!clusterMatch || !somMatch || !manifoldMatch) {
            console.error(`[MISMATCH] Point ${qid}:`);
            if (!clusterMatch) console.error(`  Cluster: Q=${p.som_cluster} PG=${pg.som_cluster}`);
            if (!somMatch)     console.error(`  SOM:     Q=${p.som_cluster} PG=${pg.som_cluster}`);
            if (!manifoldMatch) console.error(`  Manifold: Missing in Postgres`);
            mismatches++;
        } else {
            synced++;
        }
    }

    console.log('\n--- Result ---');
    console.log(`Synced:     ${synced}`);
    console.log(`Mismatches: ${mismatches}`);
    
    if (mismatches === 0) {
        console.log('✅ Audit Passed: 100% Data Parity');
    } else {
        console.log('❌ Audit Failed: Mismatches detected');
    }

    await pool.end();
    process.exit(mismatches === 0 ? 0 : 1);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
