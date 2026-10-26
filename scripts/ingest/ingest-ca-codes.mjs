#!/usr/bin/env node
/**
 * Ingest California code sections (JSONL from extract-ca-codes-pubinfo.py) into the legal corpus:
 *   library_documents (one per code) -> legal_nodes (one per section) -> legal_chunks (text only).
 * Postgres is truth. Embeddings are NOT computed here: use --publish to queue unembedded chunks on
 * RabbitMQ (legal.chunk.embed); scripts/workers/legal-chunk-embed-worker.mjs embeds them on CPU.
 *
 *   node --env-file=.env scripts/ingest/ingest-ca-codes.mjs --jsonl sections.jsonl [--dry-run]
 *   node --env-file=.env scripts/ingest/ingest-ca-codes.mjs --publish [--limit N]
 *   node --env-file=.env scripts/ingest/ingest-ca-codes.mjs --finalize
 *
 * Re-runs are idempotent. A section whose text changed is counted and skipped, never deleted/overwritten.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import amqp from 'amqplib';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL is required (run with --env-file=.env)'); process.exit(1); }
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const QUEUE = 'legal.chunk.embed';
const BATCH = 16;
const CHUNK_MAX = 1500;
const SOURCE_LABEL = 'leginfo pubinfo bulk feed (downloads.leginfo.legislature.ca.gov)';

const CODES = {
	PEN: { title: 'California Penal Code', short: 'Cal. Pen. Code' },
	HSC: { title: 'California Health and Safety Code', short: 'Cal. Health & Safety Code' },
	CIV: { title: 'California Civil Code', short: 'Cal. Civ. Code' },
	EVID: { title: 'California Evidence Code', short: 'Cal. Evid. Code' },
	WIC: { title: 'California Welfare and Institutions Code', short: 'Cal. Welf. & Inst. Code' },
	CCP: { title: 'California Code of Civil Procedure', short: 'Cal. Civ. Proc. Code' },
	FAM: { title: 'California Family Code', short: 'Cal. Fam. Code' },
	VEH: { title: 'California Vehicle Code', short: 'Cal. Veh. Code' },
};

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

function chunkSection(label, text) {
	const paras = text.split('\n');
	const out = [];
	let cur = '';
	const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
	for (let p of paras) {
		while (p.length > CHUNK_MAX) {
			const cut = Math.max(p.lastIndexOf('. ', CHUNK_MAX), p.lastIndexOf('; ', CHUNK_MAX), CHUNK_MAX >> 1);
			const head = p.slice(0, cut + 1);
			if (cur && (cur.length + head.length) > CHUNK_MAX) push();
			cur += (cur ? '\n' : '') + head; push();
			p = p.slice(cut + 1).trimStart();
		}
		if (cur && (cur.length + p.length + 1) > CHUNK_MAX) push();
		cur += (cur ? '\n' : '') + p;
	}
	push();
	// each chunk is self-describing for retrieval
	return out.map((c) => `${label}\n${c}`);
}

async function ingest() {
	const file = opt('jsonl');
	if (!file) throw new Error('--jsonl required');
	const dry = flag('dry-run');
	const { rows: [ca] } = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'ca'`);
	if (!ca) throw new Error('ca jurisdiction missing: apply drizzle/manual/legal_corpus_indexes.sql');

	const byCode = new Map();
	const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
	for await (const line of rl) {
		if (!line.trim()) continue;
		const s = JSON.parse(line);
		if (!CODES[s.law_code]) continue;
		if (!s.section_num || !s.text) continue; // hard fail would hide data; counted below
		(byCode.get(s.law_code) ?? byCode.set(s.law_code, []).get(s.law_code)).push(s);
	}

	for (const [code, sections] of byCode) {
		const meta = CODES[code];
		const srcHash = createHash('sha256').update(sections.map((s) => s.sha256).sort().join('')).digest('hex');
		const stat = { code, sections: sections.length, newNodes: 0, unchanged: 0, changedSkipped: 0, chunks: 0 };
		if (dry) { console.log('[dry-run]', stat); continue; }

		let docId = (await pool.query(
			`SELECT id FROM library_documents WHERE source_kind = 'pubinfo_bulk' AND short_title = $1`, [meta.short])).rows[0]?.id;
		let versionId;
		if (!docId) {
			docId = randomUUID(); versionId = randomUUID();
			await pool.query(
				`INSERT INTO library_documents (id, source_type, corpus_type, jurisdiction_id, title, short_title, citation,
				   official_url, source_hash, mime_type, minio_key, is_official, processing_status, source_confidence,
				   fetched_at, source_kind)
				 VALUES ($1,'state_official','statute',$2,$3,$4,$4,'https://leginfo.legislature.ca.gov/faces/codes.xhtml',
				   $5,'text/plain',$6,true,'chunking','high', now(),'pubinfo_bulk')`,
				[docId, ca.id, meta.title, meta.short, srcHash, `official/leginfo/pubinfo/${code}`]);
			await pool.query(
				`INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
				 VALUES ($1,$2,$3, now(), true)`, [versionId, docId, `pubinfo_2025 (${SOURCE_LABEL})`]);
		} else {
			versionId = (await pool.query(
				`SELECT id FROM library_document_versions WHERE document_id = $1 AND is_current LIMIT 1`, [docId])).rows[0]?.id;
		}

		const existing = new Map((await pool.query(
			`SELECT node_path, tags_json->>'sha256' AS sha FROM legal_nodes WHERE document_id = $1`, [docId]))
			.rows.map((r) => [r.node_path, r.sha]));

		const client = await pool.connect();
		try {
			for (let i = 0; i < sections.length; i += 200) {
				await client.query('BEGIN');
				for (const s of sections.slice(i, i + 200)) {
					const path = `${code}/${s.section_num}`;
					if (existing.has(path)) {
						existing.get(path) === s.sha256 ? stat.unchanged++ : stat.changedSkipped++;
						continue;
					}
					const label = `${meta.short} § ${s.section_num}`;
					const nodeId = randomUUID();
					const tags = {
						law_code: code, section_num: s.section_num, division: s.division, title: s.title, part: s.part,
						chapter: s.chapter, article: s.article, history: s.history, effective_date: s.effective_date,
						op_statutes: s.op_statutes, op_chapter: s.op_chapter, op_section: s.op_section,
						version_id: s.version_id, source_id: s.source_id, sha256: s.sha256,
					};
					await client.query(
						`INSERT INTO legal_nodes (id, document_id, version_id, node_type, heading, citation_label, node_path,
						   depth, full_text, text_clean, tags_json)
						 VALUES ($1,$2,$3,'section',$4,$5,$6,1,$7,$7,$8)
						 ON CONFLICT (document_id, node_path) DO NOTHING`,
						[nodeId, docId, versionId, `${meta.title} § ${s.section_num}`, label, path, s.text, JSON.stringify(tags)]);
					const chunks = chunkSection(label, s.text);
					let off = 0;
					for (let k = 0; k < chunks.length; k++) {
						await client.query(
							`INSERT INTO legal_chunks (id, legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
							 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (legal_node_id, chunk_index) DO NOTHING`,
							[randomUUID(), nodeId, k, chunks[k], Math.ceil(chunks[k].length / 4), off, off + chunks[k].length]);
						off += chunks[k].length; stat.chunks++;
					}
					stat.newNodes++;
				}
				await client.query('COMMIT');
			}
		} catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
		await pool.query(`UPDATE library_documents SET processing_status = 'embedding', updated_at = now() WHERE id = $1`, [docId]);
		console.log(stat);
	}
}

async function publish() {
	const limit = Number(opt('limit', '0')) || null;
	const conn = await amqp.connect(RABBITMQ_URL);
	const ch = await conn.createChannel();
	await ch.assertQueue(`${QUEUE}.dlq`, { durable: true });
	await ch.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${QUEUE}.dlq` } });
	const { rows } = await pool.query(
		`SELECT c.id FROM legal_chunks c JOIN legal_nodes n ON n.id = c.legal_node_id
		 JOIN library_documents d ON d.id = n.document_id
		 WHERE c.embedding IS NULL AND d.source_kind = 'pubinfo_bulk' ORDER BY c.id ${limit ? `LIMIT ${limit}` : ''}`);
	let batches = 0;
	for (let i = 0; i < rows.length; i += BATCH) {
		ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify({ chunkIds: rows.slice(i, i + BATCH).map((r) => r.id) })), { persistent: true });
		batches++;
	}
	await ch.close(); await conn.close();
	console.log({ queuedChunks: rows.length, batches, queue: QUEUE });
}

async function finalize() {
	const { rowCount } = await pool.query(
		`UPDATE library_documents d SET processing_status = 'complete', updated_at = now()
		 WHERE d.source_kind = 'pubinfo_bulk' AND NOT EXISTS (
		   SELECT 1 FROM legal_chunks c JOIN legal_nodes n ON n.id = c.legal_node_id
		   WHERE n.document_id = d.id AND c.embedding IS NULL)`);
	console.log({ documentsCompleted: rowCount });
}

try {
	if (flag('publish')) await publish();
	else if (flag('finalize')) await finalize();
	else await ingest();
} finally { await pool.end(); }
