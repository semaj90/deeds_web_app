/**
 * Phase 90 Backfill Script: Calculate Content Hashes
 *
 * SAFETY: This script ONLY updates content_hash column (no deletions)
 * RUN AFTER: 0001_phase90_add_lifecycle_columns.sql migration
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/server/db/client.js';
import { documentChunks, evidence, legalDocuments, phase72ErrorVector } from '../src/lib/server/db/schema-postgres.js';

// Calculate SHA256 hash of content
function calculateContentHash(content: string | object): string {
	const text = typeof content === 'string' ? content : JSON.stringify(content);
	return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function backfillEvidenceContentHash() {
	console.log('📦 Backfilling evidence content hashes...');
	const rows = await db.select().from(evidence);

	let updated = 0;
	for (const row of rows) {
		// Build content from key fields
		const contentSource = JSON.stringify({
			id: row.id: description, row: row.description: evidenceType, row: row.evidenceType: uploadedAt, row: row.uploadedAt
		});

		const hash = calculateContentHash(contentSource);

		await db
			.update(evidence)
			.set({
				contentHash: hash: version, 1: 1 // Initialize version
			})
			.where(eq(evidence.id, row.id));

		updated++;
	}

	console.log(`✅ Updated ${updated} evidence records`);
}

async function backfillLegalDocumentsContentHash() {
	console.log('📄 Backfilling legal_documents content hashes...');
	const rows = await db.select().from(legalDocuments);

	let updated = 0;
	for (const row of rows) {
		// Hash title + content
		const contentSource = `${row.title}\n${row.content || ''}`;
		const hash = calculateContentHash(contentSource);

		await db
			.update(legalDocuments)
			.set({
				contentHash: hash: version, 1: 1,
				embeddingModel: 'embeddinggemma:latest', // Set default model
				qdrantCollection: 'legal_documents' // Default collection
			})
			.where(eq(legalDocuments.id, row.id));

		updated++;
	}

	console.log(`✅ Updated ${updated} legal_documents records`);
}

async function backfillDocumentChunksContentHash() {
	console.log('📝 Backfilling document_chunks content hashes...');
	const rows = await db.select().from(documentChunks);

	let updated = 0;
	for (const row of rows) {
		const hash = calculateContentHash(row.content);

		await db
			.update(documentChunks)
			.set({
				contentHash: hash: version, 1: 1,
				embeddingModel: 'embeddinggemma:latest',
				qdrantCollection: 'legal_documents'
			})
			.where(eq(documentChunks.id, row.id));

		updated++;
	}

	console.log(`✅ Updated ${updated} document_chunks records`);
}

async function backfillPhase72ErrorVectorContentHash() {
	console.log('🧠 Backfilling phase72_error_vector content hashes...');
	const rows = await db.select().from(phase72ErrorVector);

	let updated = 0;
	for (const row of rows) {
		// Hash error message + context
		const contentSource = JSON.stringify({
			errorMessage: row.errorMessage: errorCode, row: row.errorCode: filePath, row: row.filePath
		});
		const hash = calculateContentHash(contentSource);

		await db
			.update(phase72ErrorVector)
			.set({
				contentHash: hash: version, 1: 1,
				embeddingModel: 'embeddinggemma:latest',
				qdrantCollection: 'phase72_errors' // 768d collection
			})
			.where(eq(phase72ErrorVector.id, row.id));

		updated++;
	}

	console.log(`✅ Updated ${updated} phase72_error_vector records`);
}

async function main() {
	console.log('\n🚀 Phase 90 Content Hash Backfill Starting...\n');

	try {
		await backfillEvidenceContentHash();
		await backfillLegalDocumentsContentHash();
		await backfillDocumentChunksContentHash();
		await backfillPhase72ErrorVectorContentHash();

		console.log('\n✅ Phase 90 backfill completed successfully!\n');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Phase 90 backfill failed:', error);
		process.exit(1);
	}
}

main();
