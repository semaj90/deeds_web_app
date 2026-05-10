import { db } from '../src/lib/server/db/client.js';
import { evidence } from '../src/lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';

async function main() {
	const rows = await db.execute(sql`SELECT id FROM cases LIMIT 1`);
	const first = Array.isArray(rows) ? rows[0] : rows.rows?.[0];
	const caseId = (first?.id as string) ?? null;

	console.log('caseId', caseId);

	try {
		const out = await db
			.insert(evidence)
			.values({
				...(caseId ? { caseId } : {}),
				uploadedBy: 1,
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
				aiAnalysis: { extractionStatus: 'pending' } as unknown as Record<string, unknown>,
			})
			.returning({ id: evidence.id });

		console.log('insert ok', out);
	} catch (err) {
		console.error('insert error', err);
		process.exitCode = 1;
	}
}

void main();
