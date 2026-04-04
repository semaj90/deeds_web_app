/**
 * Link fictional case charges to canonical chunks via fuzzy statute matching
 *
 * Usage: node scripts/link-charges-to-canon.mjs
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

function normalize(s) {
	return s
		.replace(/U\.S\.C\./g, 'USC')
		.replace(/\s+/g, '')
		.replace(/§/g, 's')
		.replace(/[()]/g, '')
		.toLowerCase();
}

async function main() {
	// Get all fictional charges
	const { rows: charges } = await pool.query(
		'SELECT fcc.id, fcc.statute FROM fictional_case_charges fcc WHERE fcc.statute IS NOT NULL'
	);

	// Get all canonical documents with chunks
	const { rows: canonDocs } = await pool.query(
		`SELECT cd.citation, array_agg(cc.chunk_id) as chunk_ids
		 FROM canonical_documents cd
		 JOIN canonical_chunks cc ON cc.document_id = cd.id
		 WHERE cd.citation IS NOT NULL
		 GROUP BY cd.citation`
	);

	// Build normalized lookup
	const canonLookup = canonDocs.map(d => ({
		citation: d.citation,
		normalized: normalize(d.citation),
		chunkIds: d.chunk_ids,
	}));

	let linkedCount = 0;
	for (const charge of charges) {
		const normStatute = normalize(charge.statute);
		// Extract base statute number (e.g., '18uscs1343' from '18uscs1343a2')
		const baseMatch = normStatute.match(/(\d+uscs\d+)/);
		const base = baseMatch ? baseMatch[1] : normStatute;

		const matches = canonLookup.filter(c =>
			c.normalized.includes(base) || base.includes(c.normalized)
		);

		if (matches.length > 0) {
			const allChunkIds = [...new Set(matches.flatMap(m => m.chunkIds))];
			await pool.query(
				'UPDATE fictional_case_charges SET canon_chunk_ids = $1 WHERE id = $2',
				[JSON.stringify(allChunkIds), charge.id]
			);
			linkedCount++;
		}
	}

	console.log(`Linked ${linkedCount} of ${charges.length} charges to canonical chunks`);

	// Show results
	const { rows: stats } = await pool.query(
		`SELECT fcc.statute, fcc.canon_chunk_ids
		 FROM fictional_case_charges fcc
		 WHERE fcc.canon_chunk_ids != '[]'
		 ORDER BY fcc.statute`
	);
	const byStatute = {};
	for (const s of stats) {
		const key = s.statute;
		byStatute[key] = (byStatute[key] || 0) + 1;
	}
	console.log('\nCharges linked by statute:');
	for (const [statute, count] of Object.entries(byStatute)) {
		console.log(`  ${statute}: ${count} charges linked`);
	}

	await pool.end();
}

main().catch(err => {
	console.error('Fatal:', err);
	pool.end();
	process.exit(1);
});
