/**
 * Ingest fictional cases from JSONL into PostgreSQL
 * Links charges to canonical chunks for citation-faithful generation
 *
 * Usage: node scripts/ingest-fictional-cases.mjs
 */

import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

function mapJurisdiction(city) {
	if (!city) return 'US-FED';
	const parts = city.split(',').map(s => s.trim());
	const state = parts[parts.length - 1]?.toUpperCase();
	const valid = new Set([
		'PA','CA','NY','TX','FL','IL','OH','GA','NC','MI','NJ','VA','WA','AZ','MA',
		'TN','IN','MO','MD','WI','CO','MN','SC','AL','LA','KY','OR','OK','CT','UT',
		'IA','NV','AR','MS','KS','NM','NE','ID','WV','HI','NH','ME','MT','RI','DE',
		'SD','ND','AK','VT','WY','DC',
	]);
	return valid.has(state) ? state : 'US-FED';
}

async function findCanonChunkIds(statute) {
	if (!statute) return [];
	try {
		const { rows } = await pool.query(
			`SELECT cc.chunk_id FROM canonical_chunks cc
			 JOIN canonical_documents cd ON cc.document_id = cd.id
			 WHERE cd.citation ILIKE $1 LIMIT 5`,
			[`%${statute.replace(/%/g, '')}%`]
		);
		return rows.map(r => r.chunk_id);
	} catch {
		return [];
	}
}

async function main() {
	const lines = fs.readFileSync('scripts/case_data/fictional_cases.jsonl', 'utf8').trim().split('\n');
	console.log(`Processing ${lines.length} JSONL lines...`);

	let caseCount = 0;
	let chargeCount = 0;
	let actorCount = 0;
	let linkedCount = 0;
	const seen = new Set();

	for (const line of lines) {
		let c;
		try { c = JSON.parse(line); } catch { continue; }
		if (!c.case_id || !c.narrative) continue;
		if (seen.has(c.case_id)) continue;
		seen.add(c.case_id);

		const jur = mapJurisdiction(c.jurisdiction_city);
		const caseUuid = randomUUID();

		// Insert fictional case
		await pool.query(
			`INSERT INTO fictional_cases
			 (id, case_id, category, charge, primary_statute, defendant_name,
			  incident_date, jurisdiction_city, jurisdiction, financial_loss,
			  narrative, disclaimer, is_fictional, generated_by, guardrail_triggered, metadata)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
			 ON CONFLICT (case_id) DO NOTHING`,
			[
				caseUuid,
				c.case_id,
				c.category,
				c.charge,
				c.primary_statute || null,
				c.defendant_name,
				c.incident_date || null,
				c.jurisdiction_city || null,
				jur,
				c.financial_loss || null,
				c.narrative,
				c.disclaimer || null,
				true,
				c.generated_by || null,
				c.guardrail_triggered || false,
				JSON.stringify({
					generated_at: c.generated_at,
					guardrail_tokens_found: c.guardrail_tokens_found || [],
				}),
			]
		);
		caseCount++;

		// Insert primary charge with canonical chunk links
		const canonChunkIds = await findCanonChunkIds(c.primary_statute);
		if (canonChunkIds.length > 0) linkedCount++;

		await pool.query(
			`INSERT INTO fictional_case_charges
			 (fictional_case_id, charge_name, statute, canon_chunk_ids, is_primary)
			 VALUES ($1,$2,$3,$4,true)`,
			[caseUuid, c.charge, c.primary_statute || null, JSON.stringify(canonChunkIds)]
		);
		chargeCount++;

		// Insert defendant actor
		await pool.query(
			`INSERT INTO fictional_case_actors
			 (fictional_case_id, name, role, description)
			 VALUES ($1,$2,'defendant',$3)`,
			[caseUuid, c.defendant_name, `Defendant in ${c.charge} case`]
		);
		actorCount++;

		process.stdout.write('.');
	}

	// Final counts
	const { rows: [fc] } = await pool.query('SELECT count(*) as c FROM fictional_cases');
	const { rows: [fch] } = await pool.query('SELECT count(*) as c FROM fictional_case_charges');
	const { rows: [fa] } = await pool.query('SELECT count(*) as c FROM fictional_case_actors');

	console.log('\n');
	console.log('╔══════════════════════════════════════════════╗');
	console.log('║   Fictional Case Ingestion Complete          ║');
	console.log('╠══════════════════════════════════════════════╣');
	console.log(`║  fictional_cases:         ${String(fc.c).padStart(5)}              ║`);
	console.log(`║  fictional_case_charges:  ${String(fch.c).padStart(5)}              ║`);
	console.log(`║  charges → canon linked:  ${String(linkedCount).padStart(5)}              ║`);
	console.log(`║  fictional_case_actors:   ${String(fa.c).padStart(5)}              ║`);
	console.log('╚══════════════════════════════════════════════╝');

	// Show linking stats
	const { rows: linkStats } = await pool.query(
		`SELECT fcc.statute, array_length(string_to_array(fcc.canon_chunk_ids::text, ','), 1) as chunk_count
		 FROM fictional_case_charges fcc
		 WHERE fcc.canon_chunk_ids != '[]'
		 ORDER BY fcc.statute
		 LIMIT 10`
	);
	if (linkStats.length > 0) {
		console.log('\nCharge → Canon Chunk Links:');
		for (const s of linkStats) {
			console.log(`  ${s.statute} → ${s.chunk_count} chunk(s)`);
		}
	}

	await pool.end();
}

main().catch(err => {
	console.error('Fatal:', err);
	pool.end();
	process.exit(1);
});
