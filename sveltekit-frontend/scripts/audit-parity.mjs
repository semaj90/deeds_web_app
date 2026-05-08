/**
 * D20 Audit Gate: Qdrant ↔ Postgres Manifold4 / SOM Cluster Parity Check
 *
 * Samples N points from Qdrant codebase_chunks_768 and verifies:
 *   1. Each point has a matching row in codebase_chunk_index (Postgres)
 *   2. som_cluster matches between Qdrant payload and Postgres
 *   3. gpu_cluster matches between Qdrant payload and Postgres
 *   4. manifold4 is a 4-element finite float[] in Postgres (if Qdrant carries it)
 *
 * Usage:
 *   node scripts/audit-parity.mjs                    # sample=250, non-strict
 *   node scripts/audit-parity.mjs --strict           # exit 1 on first mismatch
 *   node scripts/audit-parity.mjs --sample=100       # smaller sample
 *   node scripts/audit-parity.mjs --strict --sample=500
 */
import pg from 'pg';
const { Pool } = pg;

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 250;

// ── Config ───────────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DATABASE_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const COLLECTION = 'codebase_chunks_768';
const pool = new Pool({ connectionString: DATABASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────
function isFinite4(arr) {
	return (
		Array.isArray(arr) &&
		arr.length === 4 &&
		arr.every((v) => typeof v === 'number' && Number.isFinite(v))
	);
}

function normVal(v) {
	// Qdrant payload values may be null/undefined; normalise to null for comparison
	return v == null ? null : v;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function runAudit() {
	console.log(`\n─── D20 Parity Audit ─── (sample=${SAMPLE}, strict=${strict})`);
	console.log(`Qdrant : ${QDRANT_URL}/${COLLECTION}`);
	console.log(`Postgres: ${DATABASE_URL.split('@')[1] ?? DATABASE_URL}\n`);

	// 1. Sample from Qdrant
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ limit: SAMPLE, with_payload: true }),
	});
	if (!res.ok) {
		console.error(`Qdrant scroll failed: ${res.status} ${res.statusText}`);
		process.exit(1);
	}
	const { result } = await res.json();
	const points = result?.points ?? [];

	if (points.length === 0) {
		console.warn('⚠  No points found in Qdrant — collection may be empty.');
		process.exit(0);
	}

	console.log(`Sampled ${points.length} points from Qdrant.\n`);

	let missing = 0;
	let somMismatches = 0;
	let gpuMismatches = 0;
	let manifoldGap = 0; // Qdrant has manifold4, Postgres does not
	let mismatches = 0;

	for (const point of points) {
		const qid = point.id;
		const p = point.payload ?? {};

		const qSom = normVal(p.som_cluster);
		const qGpu = normVal(p.gpuCluster ?? p.gpu_cluster);
		const qManifold = Array.isArray(p.manifold4) ? p.manifold4 : null;

		// 2. Postgres lookup
		const pgRes = await pool.query(
			`SELECT gpu_cluster, som_cluster, manifold4
       FROM codebase_chunk_index
       WHERE qdrant_id = $1`,
			[qid],
		);

		if (pgRes.rows.length === 0) {
			console.warn(`[MISSING] Qdrant point ${qid} has no Postgres row`);
			missing++;
			mismatches++;
			if (strict) {
				console.error('Strict mode: aborting on first failure.');
				await pool.end();
				process.exit(1);
			}
			continue;
		}

		const row = pgRes.rows[0];
		const pgSom = normVal(row.som_cluster);
		const pgGpu = normVal(row.gpu_cluster);
		const pgManifold = row.manifold4;

		let rowOk = true;

		// 3. som_cluster parity
		if (qSom !== null && qSom !== pgSom) {
			console.error(
				`[SOM_MISMATCH] ${qid}: Qdrant som_cluster=${qSom}  Postgres=${pgSom}`,
			);
			somMismatches++;
			rowOk = false;
		}

		// 4. gpu_cluster parity
		if (qGpu !== null && qGpu !== pgGpu) {
			console.error(
				`[GPU_MISMATCH] ${qid}: Qdrant gpu_cluster=${qGpu}  Postgres=${pgGpu}`,
			);
			gpuMismatches++;
			rowOk = false;
		}

		// 5. manifold4 completeness (Qdrant carries it → Postgres must too)
		if (qManifold !== null && !isFinite4(pgManifold)) {
			console.warn(
				`[MANIFOLD_GAP] ${qid}: Qdrant has manifold4 but Postgres row is missing/malformed`,
			);
			manifoldGap++;
			rowOk = false;
		}

		if (!rowOk) {
			mismatches++;
			if (strict) {
				console.error('Strict mode: aborting on first failure.');
				await pool.end();
				process.exit(1);
			}
		}
	}

	// ── Report ────────────────────────────────────────────────────────────────
	const synced = points.length - mismatches;
	const pct = ((synced / points.length) * 100).toFixed(1);

	console.log('─── D20 Result ───');
	console.log(`Sampled  : ${points.length}`);
	console.log(`Synced   : ${synced}  (${pct}%)`);
	console.log(`Missing  : ${missing}`);
	console.log(`SOM mis  : ${somMismatches}`);
	console.log(`GPU mis  : ${gpuMismatches}`);
	console.log(`Manifold4: ${manifoldGap} gap(s)`);
	console.log(`Total mis: ${mismatches}`);

	await pool.end();

	if (mismatches === 0) {
		console.log('\n✅ D20 PASSED — 100% Qdrant ↔ Postgres parity');
		process.exit(0);
	} else {
		console.log('\n❌ D20 FAILED — parity gaps detected');
		process.exit(1);
	}
}

runAudit().catch((err) => {
	console.error('Audit error:', err);
	process.exit(1);
});
