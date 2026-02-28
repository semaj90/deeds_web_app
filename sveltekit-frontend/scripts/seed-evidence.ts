/**
 * Seed Evidence — Creates demo evidence items + relationships for the evidence board.
 *
 * Uses raw SQL via pg Pool to avoid import path issues.
 * Seeds into existing case (State v. Martinez) for dev-bypass user.
 *
 * Usage: npx tsx scripts/seed-evidence.ts
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

// Dev-bypass user + existing case
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CASE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

interface EvidenceRow { id: string }

async function seed() {
	console.log('[seed-evidence] Connecting to:', DATABASE_URL.replace(/:[^@]+@/, ':****@'));

	// Ensure evidence_relationships table exists
	await pool.query(`
		CREATE TABLE IF NOT EXISTS evidence_relationships (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
			from_evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
			to_evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
			relationship_type TEXT NOT NULL DEFAULT 'supports',
			label TEXT,
			strength VARCHAR(20) NOT NULL DEFAULT 'medium',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS evidence_relationships_case_id_idx ON evidence_relationships(case_id);
		CREATE INDEX IF NOT EXISTS evidence_relationships_from_idx ON evidence_relationships(from_evidence_id);
		CREATE INDEX IF NOT EXISTS evidence_relationships_to_idx ON evidence_relationships(to_evidence_id);
	`);
	console.log('[seed-evidence] evidence_relationships table ready.');

	// Clean old seeded evidence (keep user-uploaded)
	await pool.query(`DELETE FROM evidence WHERE case_id = $1 AND source = 'seed'`, [CASE_ID]);
	console.log('[seed-evidence] Cleaned old seed data.');

	// Unified 16-value evidence_type enum:
	// Media: document, photo, video, audio
	// Legal: documentary, testimonial, demonstrative, witness_statement
	// Forensic: forensic, scientific, expert
	// Physical: physical, real, digital
	// Context: circumstantial, hearsay
	const evidenceItems = [
		{
			title: 'Security Camera Footage — Main Lobby',
			description: 'HD video from lobby camera showing suspect entering building at 21:34. Captures face, clothing, and movement pattern. Duration: 18 minutes.',
			evidence_type: 'video',
			file_name: 'lobby-cam-2024-12-05.mp4',
			file_type: 'video/mp4',
			file_size: 245000000,
			canvas_position: JSON.stringify({ x: 100, y: 120 }),
			source: 'seed',
		},
		{
			title: 'Witness Statement — K. Ito',
			description: 'Sworn statement from building security guard describing verbal confrontation in B2 parking garage. Witness positively identifies suspect from photo lineup.',
			evidence_type: 'witness_statement',
			file_name: 'witness-statement-ito.pdf',
			file_type: 'application/pdf',
			file_size: 85000,
			canvas_position: JSON.stringify({ x: 400, y: 80 }),
			source: 'seed',
		},
		{
			title: 'Access Badge Log — Server Room',
			description: 'Electronic access control logs showing 4 badge swipes between 20:00-22:00 on Dec 5. Badge #4471 (registered to suspect) used at 21:15 and 21:52.',
			evidence_type: 'digital',
			file_name: 'badge-log-export.csv',
			file_type: 'text/csv',
			file_size: 12400,
			canvas_position: JSON.stringify({ x: 250, y: 300 }),
			source: 'seed',
		},
		{
			title: 'Forensic Photo — Server Room Cabinet',
			description: 'High-resolution photographs of server room cabinet showing tool marks consistent with forced entry. Evidence of pry bar use on lock mechanism.',
			evidence_type: 'photo',
			file_name: 'forensic-scene-001.jpg',
			file_type: 'image/jpeg',
			file_size: 8500000,
			canvas_position: JSON.stringify({ x: 550, y: 200 }),
			source: 'seed',
		},
		{
			title: 'DNA Analysis Report',
			description: 'Lab report from State Crime Lab. DNA recovered from server room door handle matches suspect profile with 99.97% probability. Chain of custody documented.',
			evidence_type: 'scientific',
			file_name: 'dna-analysis-SCL-2024-1205.pdf',
			file_type: 'application/pdf',
			file_size: 420000,
			canvas_position: JSON.stringify({ x: 700, y: 350 }),
			source: 'seed',
		},
		{
			title: 'Phone Records — Suspect Device',
			description: 'Call detail records and cell tower pings for suspect mobile device. Places suspect within 200m of building between 20:45-22:10.',
			evidence_type: 'digital',
			file_name: 'phone-records-subpoena-response.xlsx',
			file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			file_size: 156000,
			canvas_position: JSON.stringify({ x: 150, y: 450 }),
			source: 'seed',
		},
		{
			title: 'Interview Recording — Suspect',
			description: 'Audio recording of initial suspect interview conducted by Det. Rodriguez. Suspect denies presence at building. Miranda rights administered at 09:14.',
			evidence_type: 'audio',
			file_name: 'suspect-interview-2024-12-06.wav',
			file_type: 'audio/wav',
			file_size: 67000000,
			canvas_position: JSON.stringify({ x: 450, y: 420 }),
			source: 'seed',
		},
		{
			title: 'Recovered Hard Drive — Evidence Locker',
			description: 'Western Digital 2TB drive recovered from suspect vehicle. Contains encrypted partitions. Forensic imaging complete, analysis pending.',
			evidence_type: 'physical',
			file_name: 'evidence-tag-PHY-0088.pdf',
			file_type: 'application/pdf',
			file_size: 34000,
			canvas_position: JSON.stringify({ x: 680, y: 100 }),
			source: 'seed',
		},
		{
			title: 'Crime Scene Diagram',
			description: 'Detailed floor plan diagram with evidence marker positions, entry/exit points, and suspect movement path. Scale 1:50.',
			evidence_type: 'demonstrative',
			file_name: 'scene-diagram-v2.pdf',
			file_type: 'application/pdf',
			file_size: 2300000,
			canvas_position: JSON.stringify({ x: 850, y: 200 }),
			source: 'seed',
		},
		{
			title: 'Expert Opinion — Dr. Chen (Digital Forensics)',
			description: 'Professional opinion from certified digital forensics examiner regarding encrypted partition analysis. Concludes data exfiltration occurred between 21:20-21:45.',
			evidence_type: 'expert',
			file_name: 'expert-report-chen.pdf',
			file_type: 'application/pdf',
			file_size: 195000,
			canvas_position: JSON.stringify({ x: 850, y: 400 }),
			source: 'seed',
		},
		{
			title: 'Incident Report — Building Manager',
			description: 'Official incident report filed by building manager documenting unauthorized after-hours access and server room damage. Filed Dec 6, 2024.',
			evidence_type: 'documentary',
			file_name: 'incident-report-2024-12-06.pdf',
			file_type: 'application/pdf',
			file_size: 62000,
			canvas_position: JSON.stringify({ x: 300, y: 550 }),
			source: 'seed',
		},
		{
			title: 'Fingerprint Analysis — Server Cabinet',
			description: 'Latent fingerprint recovered from server cabinet handle. AFIS match to suspect with 12-point ridge detail confirmation.',
			evidence_type: 'forensic',
			file_name: 'fingerprint-analysis-FP-2024-089.pdf',
			file_type: 'application/pdf',
			file_size: 890000,
			canvas_position: JSON.stringify({ x: 600, y: 550 }),
			source: 'seed',
		},
	];

	const insertedIds: string[] = [];
	for (const item of evidenceItems) {
		const result = await pool.query<EvidenceRow>(
			`INSERT INTO evidence (case_id, user_id, title, description, evidence_type, file_name, file_type, file_size, canvas_position, source)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING id`,
			[CASE_ID, USER_ID, item.title, item.description, item.evidence_type, item.file_name, item.file_type, item.file_size, item.canvas_position, item.source]
		);
		insertedIds.push(result.rows[0].id);
		console.log(`  + ${item.evidence_type.padEnd(10)} ${item.title}`);
	}
	console.log(`[seed-evidence] Created ${insertedIds.length} evidence items.`);

	// Seed relationships between evidence
	const relationships = [
		{ from: 0, to: 1, type: 'corroborates', label: 'Timeline Match', strength: 'high' },
		{ from: 0, to: 2, type: 'supports', label: 'Suspect Identified', strength: 'high' },
		{ from: 2, to: 3, type: 'timeline', label: 'Access Before Damage', strength: 'high' },
		{ from: 3, to: 4, type: 'corroborates', label: 'DNA at Scene', strength: 'high' },
		{ from: 5, to: 0, type: 'supports', label: 'Places Near Building', strength: 'medium' },
		{ from: 6, to: 1, type: 'contradicts', label: 'Denies Presence', strength: 'medium' },
		{ from: 7, to: 3, type: 'chain_of_custody', label: 'Found in Vehicle', strength: 'high' },
		{ from: 4, to: 2, type: 'supports', label: 'DNA Matches Badge Owner', strength: 'high' },
		{ from: 5, to: 2, type: 'timeline', label: 'Phone Near Badge Swipe', strength: 'medium' },
		{ from: 8, to: 3, type: 'supports', label: 'Diagram Shows Entry Point', strength: 'medium' },
		{ from: 9, to: 7, type: 'supports', label: 'Expert Analyzes Drive', strength: 'high' },
		{ from: 10, to: 0, type: 'corroborates', label: 'Report Confirms Breach', strength: 'medium' },
		{ from: 11, to: 4, type: 'corroborates', label: 'Fingerprint + DNA Match', strength: 'high' },
		{ from: 9, to: 5, type: 'timeline', label: 'Exfiltration Window', strength: 'high' },
	];

	for (const rel of relationships) {
		await pool.query(
			`INSERT INTO evidence_relationships (case_id, from_evidence_id, to_evidence_id, relationship_type, label, strength)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			[CASE_ID, insertedIds[rel.from], insertedIds[rel.to], rel.type, rel.label, rel.strength]
		);
	}
	console.log(`[seed-evidence] Created ${relationships.length} relationships.`);

	console.log('\n[seed-evidence] Done! Navigate to /evidence?caseId=' + CASE_ID);
	await pool.end();
}

seed()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[seed-evidence] Failed:', err);
		process.exit(1);
	});
