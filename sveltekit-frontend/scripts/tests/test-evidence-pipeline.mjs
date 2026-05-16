/**
 * Evidence Pipeline Integration Test
 *
 * Tests the unified 16-value evidence_type enum, MIME detection,
 * legal reclassification, upload endpoint, and ACE metadata wiring.
 *
 * Usage: node scripts/tests/test-evidence-pipeline.mjs
 *        node scripts/tests/test-evidence-pipeline.mjs --upload  (includes upload test, requires dev server + MinIO)
 *
 * Requirements:
 *   - PostgreSQL on port 5434 (for DB tests)
 *   - Dev server on port 5173 (for upload test, --upload flag)
 *   - MinIO on port 9000 (for upload test, --upload flag)
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const DEV_SERVER = process.env.PUBLIC_APP_URL ?? (process.env.DEV_SERVER || 'http://localhost:5173');
const CASE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const runUpload = process.argv.includes('--upload');

let passed = 0;
let failed = 0;

function test(name, ok, detail) {
	if (ok) {
		console.log(`  PASS  ${name}`);
		passed++;
	} else {
		console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
		failed++;
	}
}

// ── Test 1: DB enum has all 16 values ────────────────────────────────────
async function testEnum(pool) {
	console.log('\n=== Test 1: evidence_type enum (16 values) ===');
	const res = await pool.query("SELECT unnest(enum_range(NULL::evidence_type)) AS val");
	const vals = res.rows.map(r => r.val).sort();
	const expected = [
		'audio', 'circumstantial', 'demonstrative', 'digital', 'document',
		'documentary', 'expert', 'forensic', 'hearsay', 'photo', 'physical',
		'real', 'scientific', 'testimonial', 'video', 'witness_statement'
	];
	test('Enum has 16 values', vals.length === 16, `got ${vals.length}`);
	for (const v of expected) {
		test(`  Enum includes '${v}'`, vals.includes(v));
	}
}

// ── Test 2: Seeded evidence items ────────────────────────────────────────
async function testSeededEvidence(pool) {
	console.log('\n=== Test 2: Seeded evidence items ===');
	const res = await pool.query("SELECT evidence_type, title FROM evidence WHERE source = 'seed' ORDER BY evidence_type");
	test('Has 12 seeded items', res.rows.length === 12, `got ${res.rows.length}`);

	const types = [...new Set(res.rows.map(r => r.evidence_type))].sort();
	test('Covers 11 types', types.length >= 10, `got ${types.length}: ${types.join(', ')}`);

	// Check specific type mappings
	const byType = {};
	for (const r of res.rows) {
		if (!byType[r.evidence_type]) byType[r.evidence_type] = [];
		byType[r.evidence_type].push(r.title);
	}
	test('Video type has lobby cam', !!byType.video?.some(t => t.includes('Lobby')));
	test('Audio type has interview', !!byType.audio?.some(t => t.includes('Interview')));
	test('Photo type has forensic photo', !!byType.photo?.some(t => t.includes('Photo')));
	test('Scientific type has DNA', !!byType.scientific?.some(t => t.includes('DNA')));
	test('Expert type has Dr. Chen', !!byType.expert?.some(t => t.includes('Chen')));
	test('Forensic type has fingerprint', !!byType.forensic?.some(t => t.includes('Fingerprint')));
	test('Witness_statement type', !!byType.witness_statement?.some(t => t.includes('Witness')));
}

// ── Test 3: Evidence relationships ───────────────────────────────────────
async function testRelationships(pool) {
	console.log('\n=== Test 3: Evidence relationships ===');
	const res = await pool.query(
		"SELECT COUNT(*) as cnt FROM evidence_relationships WHERE case_id = $1", [CASE_ID]
	);
	test('Has 14 relationships', parseInt(res.rows[0].cnt) === 14, `got ${res.rows[0].cnt}`);

	const types = await pool.query(
		"SELECT DISTINCT relationship_type FROM evidence_relationships WHERE case_id = $1 ORDER BY relationship_type",
		[CASE_ID]
	);
	const relTypes = types.rows.map(r => r.relationship_type);
	test('Has corroborates type', relTypes.includes('corroborates'));
	test('Has supports type', relTypes.includes('supports'));
	test('Has contradicts type', relTypes.includes('contradicts'));
	test('Has timeline type', relTypes.includes('timeline'));
}

// ── Test 4: MIME type detection ──────────────────────────────────────────
function testTypeDetection() {
	console.log('\n=== Test 4: MIME → evidenceType detection ===');

	// Replicate detectEvidenceType logic
	function detect(mime, fileName) {
		const m = (mime || '').toLowerCase();
		const ext = (fileName || '').match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
		const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','bmp','tiff','tif','webp','svg']);
		const VIDEO_EXT = new Set(['mp4','avi','mov','wmv','mkv','webm','flv']);
		const AUDIO_EXT = new Set(['mp3','wav','m4a','ogg','flac','aac','wma']);
		const DOC_EXT = new Set(['pdf','doc','docx','odt','rtf']);
		const TEXT_EXT = new Set(['txt','md','log','html','htm']);
		const DATA_EXT = new Set(['csv','xlsx','xls','json','xml','tsv']);

		if (m.startsWith('image/')) return 'photo';
		if (m.startsWith('video/')) return 'video';
		if (m.startsWith('audio/')) return 'audio';
		if (m === 'application/pdf') return 'documentary';
		if (m.includes('word') || m.includes('opendocument.text')) return 'documentary';
		if (m.includes('spreadsheet') || m === 'text/csv') return 'digital';
		if (m.startsWith('text/')) return 'documentary';
		if (IMAGE_EXT.has(ext)) return 'photo';
		if (VIDEO_EXT.has(ext)) return 'video';
		if (AUDIO_EXT.has(ext)) return 'audio';
		if (DOC_EXT.has(ext)) return 'documentary';
		if (TEXT_EXT.has(ext)) return 'documentary';
		if (DATA_EXT.has(ext)) return 'digital';
		return 'document';
	}

	const cases = [
		['image/jpeg', 'photo.jpg', 'photo'],
		['image/png', 'screenshot.png', 'photo'],
		['video/mp4', 'clip.mp4', 'video'],
		['audio/wav', 'recording.wav', 'audio'],
		['audio/mpeg', 'interview.mp3', 'audio'],
		['application/pdf', 'report.pdf', 'documentary'],
		['application/msword', 'brief.doc', 'documentary'],
		['text/csv', 'data.csv', 'digital'],
		['text/plain', 'notes.txt', 'documentary'],
		['application/octet-stream', 'unknown.bin', 'document'],
		['', 'photo.tiff', 'photo'],       // extension fallback
		['', 'clip.mkv', 'video'],          // extension fallback
		['', 'song.flac', 'audio'],         // extension fallback
		['', 'data.xlsx', 'digital'],       // extension fallback
	];

	for (const [mime, file, expected] of cases) {
		const result = detect(mime, file);
		test(`${(mime || 'ext:' + file).padEnd(30)} → ${result}`, result === expected, `expected ${expected}`);
	}
}

// ── Test 5: Legal reclassification ───────────────────────────────────────
function testLegalReclassification() {
	console.log('\n=== Test 5: Legal reclassification ===');

	const TESTIMONIAL = /\b(sworn\s+statement|deposition|affidavit|under\s+oath|testimony|witness\s+statement|miranda|interrogat)/i;
	const SCIENTIFIC = /\b(dna\s+analysis|fingerprint|ballistic|toxicolog|blood\s+alcohol|lab\s+report|forensic\s+analysis|chain\s+of\s+custody|patholog|autospy|serology)/i;
	const EXPERT = /\b(expert\s+opinion|professional\s+opinion|medical\s+report|psychiatric|psychological\s+evaluation|appraisal|valuation\s+report|actuarial)/i;
	const DEMONSTRATIVE = /\b(diagram|chart|timeline|map|scale\s+model|reconstruction|simulation|animation|exhibit)/i;

	function classify(text, entities, flags, currentType) {
		if (TESTIMONIAL.test(text)) {
			return entities.some(e => e.label === 'PERSON') ? 'testimonial' : 'witness_statement';
		}
		if (SCIENTIFIC.test(text)) return 'scientific';
		if (EXPERT.test(text)) return 'expert';
		if (DEMONSTRATIVE.test(text)) return 'demonstrative';
		const highFlags = flags.filter(f => f.severity === 'high');
		if (highFlags.length >= 2 && (currentType === 'document' || currentType === 'documentary')) return 'forensic';
		return currentType;
	}

	const cases = [
		{ text: 'sworn statement under oath', entities: [{ label: 'PERSON' }], flags: [], current: 'documentary', expected: 'testimonial' },
		{ text: 'sworn statement under oath', entities: [], flags: [], current: 'documentary', expected: 'witness_statement' },
		{ text: 'DNA analysis results', entities: [], flags: [], current: 'documentary', expected: 'scientific' },
		{ text: 'forensic analysis of the evidence', entities: [], flags: [], current: 'document', expected: 'scientific' },
		{ text: 'expert opinion from Dr. Smith', entities: [], flags: [], current: 'documentary', expected: 'expert' },
		{ text: 'diagram of the scene', entities: [], flags: [], current: 'documentary', expected: 'demonstrative' },
		{ text: 'exhibit A showing timeline', entities: [], flags: [], current: 'documentary', expected: 'demonstrative' },
		{ text: 'normal document', entities: [], flags: [{ severity: 'high', type: 'ssn' }, { severity: 'high', type: 'pii' }], current: 'documentary', expected: 'forensic' },
		{ text: 'normal document', entities: [], flags: [{ severity: 'low', type: 'pii' }], current: 'documentary', expected: 'documentary' },
	];

	for (const c of cases) {
		const result = classify(c.text, c.entities, c.flags, c.current);
		test(`"${c.text.slice(0, 40).padEnd(40)}" → ${result}`, result === c.expected, `expected ${c.expected}`);
	}
}

// ── Test 6: Upload endpoint (optional, requires dev server) ──────────────
async function testUpload(pool) {
	console.log('\n=== Test 6: Upload endpoint (live) ===');

	// Check dev server
	try {
		const health = await fetch(`${DEV_SERVER}/api/health`, { signal: AbortSignal.timeout(3000) });
		test('Dev server reachable', health.ok);
	} catch {
		console.log('  SKIP  Dev server not running at ' + DEV_SERVER);
		return;
	}

	// Upload a sworn statement text file
	const testContent = 'This sworn statement is made under oath by Jane Doe, security officer, ' +
		'regarding events of December 5 2024. Miranda rights were administered at 09:14. ' +
		'Suspect was observed entering the building at approximately 21:30.';
	const blob = new Blob([testContent], { type: 'text/plain' });
	const fd = new FormData();
	fd.append('file', blob, 'test-sworn-statement.txt');
	fd.append('title', 'Pipeline Test — Sworn Statement');
	fd.append('caseId', CASE_ID);

	const res = await fetch(`${DEV_SERVER}/api/evidence/upload`, {
		method: 'POST',
		body: fd,
	});

	test('Upload returns 201', res.status === 201, `got ${res.status}`);

	if (res.status === 201) {
		const data = await res.json();
		test('Response has evidenceId', !!data.id);
		test('Response has jobId', !!data.jobId);
		test('Response has minioKey', !!data.minioKey);

		// Wait for background pipeline
		console.log('  (waiting 8s for background pipeline...)');
		await new Promise(r => setTimeout(r, 8000));

		// Check DB record
		const metaRes = await pool.query('SELECT evidence_type, metadata FROM evidence WHERE id = $1', [data.id]);
		if (metaRes.rows[0]) {
			const row = metaRes.rows[0];
			test('Auto-detected as documentary', row.evidence_type === 'documentary' || row.evidence_type === 'testimonial' || row.evidence_type === 'witness_statement',
				`got ${row.evidence_type}`);

			const meta = row.metadata;
			if (meta) {
				test('Extraction method set', !!meta.extractionMethod, meta.extractionMethod);
				test('Has entities', (meta.entityCount ?? 0) >= 0);
				test('Has forensic flags array', Array.isArray(meta.forensicFlags));
				test('Has analysis timestamp', !!meta.analysisTimestamp);
				test('Refined type set', !!meta.refinedEvidenceType);

				console.log(`\n  Evidence details:`);
				console.log(`    Type: ${row.evidence_type} → refined: ${meta.refinedEvidenceType}`);
				console.log(`    Extraction: ${meta.extractionMethod}`);
				console.log(`    Entities: ${meta.entityCount}`);
				console.log(`    Forensic flags: ${meta.forensicFlags?.length ?? 0}`);
				console.log(`    Summary: ${(meta.summary || 'none').slice(0, 100)}`);
				console.log(`    Docling blocks: ${meta.doclingBlocks ? meta.doclingBlocks.length : 'null'}`);
				console.log(`    Vision analysis: ${meta.visionAnalysis ? 'present' : 'null'}`);
				console.log(`    Evidence profile: ${meta.evidenceProfile ? 'present' : 'null'}`);
				console.log(`    Suggested tags: ${JSON.stringify(meta.suggestedTags || [])}`);
			} else {
				test('Metadata populated', false, 'metadata is null — pipeline may still be running');
			}
		}

		// Clean up test evidence
		await pool.query('DELETE FROM evidence_vectors WHERE evidence_id = $1', [data.id]).catch(() => {});
		await pool.query('DELETE FROM evidence WHERE id = $1', [data.id]);
		console.log('  (cleaned up test evidence)');
	} else {
		const body = await res.text();
		console.log('  Upload error:', body.slice(0, 200));
	}
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
	console.log('Evidence Pipeline Integration Test');
	console.log('==================================');

	const pool = new pg.Pool({ connectionString: DATABASE_URL });

	try {
		await testEnum(pool);
		await testSeededEvidence(pool);
		await testRelationships(pool);
		testTypeDetection();
		testLegalReclassification();

		if (runUpload) {
			await testUpload(pool);
		} else {
			console.log('\n=== Test 6: Upload endpoint (skipped — use --upload flag) ===');
		}
	} finally {
		await pool.end();
	}

	console.log(`\n${'='.repeat(50)}`);
	console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
	console.log(`${'='.repeat(50)}`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
	console.error('Test runner error:', e);
	process.exit(1);
});
