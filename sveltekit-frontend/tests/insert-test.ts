import { db } from '../src/lib/server/db/client.ts';
import { evidence } from '../src/lib/server/db/schema-postgres.ts';
import { sql } from 'drizzle-orm';

async function main() {
	const rows = await db.execute(sql`SELECT id FROM cases LIMIT 1`);
	const first = Array.isArray(rows) ? rows[0] : rows.rows?.[0];
	const caseId = first?.id;

	console.log('caseId', caseId);

	try {
		const out = await db
			.insert(evidence)
			.values({
				caseId,
				userId: '00000000-0000-0000-0000-000000000001',
				evidenceNumber: 'EV-TEST',
				title: 'TSX Insert Test',
				type: 'document',
				summary: 'test',
				description: 'test',
				evidenceType: 'photo',
				fileType: 'image/png',
				mimeType: 'image/png',
				fileUrl: 'minio://legal-evidence/test.png',
				fileName: 'test.png',
				fileSize: 1,
				hash: 'sha256:test',
				uploadedAt: new Date().toISOString(),
				aiAnalysis: { extractionStatus: 'pending' },
				uploadedBy: '00000000-0000-0000-0000-000000000001',
			})
			.returning({ id: evidence.id });

		console.log('insert ok', out);
	} catch (err) {
		console.error('insert error', err);
		process.exitCode = 1;
	}
}

void main();
