const { Pool } = require('pg');

const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const TEST_CHUNKS = [
	{
		type: 'ARTICLE',
		identifier: 'Article I',
		content:
			'ARTICLE I - GENERAL PROVISIONS\n\nSection 1.01 Purpose and Scope\nThis Agreement sets forth the terms and conditions governing the relationship between the parties with respect to the subject matter herein.\n\nSection 1.02 Definitions\nFor purposes of this Agreement, the following terms shall have the meanings set forth below:\n(a) "Effective Date" means the date first written above;\n(b) "Party" or "Parties" means the entities identified in the preamble;\n(c) "Agreement" means this document and all exhibits attached hereto.',
		page: 1,
		confidence: 0.95
	},
	{
		type: 'SECTION',
		identifier: 'Section 2.01',
		content:
			'Section 2.01 Obligations of First Party\n\nThe First Party shall:\n(a) Provide all necessary documentation within 30 days of the Effective Date;\n(b) Maintain confidentiality of all proprietary information;\n(c) Comply with all applicable laws and regulations;\n(d) Notify Second Party of any material changes within 5 business days.',
		page: 2,
		confidence: 0.92
	},
	{
		type: 'SECTION',
		identifier: 'Section 2.02',
		content:
			'Section 2.02 Obligations of Second Party\n\nThe Second Party shall:\n(a) Review all submissions within 15 business days;\n(b) Provide written notice of any deficiencies;\n(c) Maintain accurate records of all transactions;\n(d) Ensure compliance with data protection requirements.',
		page: 2,
		confidence: 0.94
	},
	{
		type: 'SUBSECTION',
		identifier: 'Section 3.01(a)',
		content:
			'Section 3.01(a) Payment Terms\n\nAll payments shall be made within thirty (30) days of invoice date. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.',
		page: 3,
		confidence: 0.89
	},
	{
		type: 'ARTICLE',
		identifier: 'Article IV',
		content:
			'ARTICLE IV - CONFIDENTIALITY\n\nSection 4.01 Confidential Information\nEach Party acknowledges that in the course of performance under this Agreement, it may have access to confidential and proprietary information of the other Party.\n\nSection 4.02 Non-Disclosure\nNeither Party shall disclose, reproduce, or use any confidential information except as necessary to perform its obligations hereunder.',
		page: 4,
		confidence: 0.96
	},
	{
		type: 'SUBSECTION',
		identifier: 'Section 4.03(b)',
		content:
			'Section 4.03(b) Exceptions to Confidentiality\n\nConfidential information shall not include information that:\n(i) is or becomes publicly available through no breach of this Agreement;\n(ii) is rightfully received from a third party without restriction;\n(iii) is independently developed without use of confidential information.',
		page: 5,
		confidence: 0.91
	},
	{
		type: 'SECTION',
		identifier: 'Section 5.01',
		content:
			'Section 5.01 Term and Termination\n\nThis Agreement shall commence on the Effective Date and continue for a period of two (2) years unless earlier terminated pursuant to this Section. Either Party may terminate this Agreement upon thirty (30) days written notice.',
		page: 6,
		confidence: 0.93
	},
	{
		type: 'ARTICLE',
		identifier: 'Article VI',
		content:
			'ARTICLE VI - DISPUTE RESOLUTION\n\nSection 6.01 Negotiation\nThe Parties shall attempt in good faith to resolve any dispute arising out of or relating to this Agreement through negotiation.\n\nSection 6.02 Arbitration\nIf the Parties are unable to resolve the dispute through negotiation within thirty (30) days, the dispute shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association.',
		page: 7,
		confidence: 0.97
	}
];

async function main() {
	try {
		console.log('🌱 Seeding evidence with chunks...\n');

		// Get or create case
		const caseResult = await pool.query(
			`SELECT id FROM cases WHERE title LIKE '%Test%' OR title LIKE '%PW-%' LIMIT 1`
		);

		let caseId;
		if (caseResult.rows.length > 0) {
			caseId = caseResult.rows[0].id;
			console.log(`✅ Using existing case: ${caseId}`);
		} else {
			const newCase = await pool.query(
				`INSERT INTO cases (title, description, status, priority)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
				[
					'[TEST] Contract Dispute Case',
					'Test case for evidence chunk demonstration',
					'active',
					'medium'
				]
			);
			caseId = newCase.rows[0].id;
			console.log(`✅ Created new case: ${caseId}`);
		}

		// Create evidence with chunks
		const evidenceResult = await pool.query(
			`INSERT INTO evidence (
        case_id,
        title,
        file_name,
        type,
        file_path,
        file_size,
        mime_type,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id, title`,
			[
				caseId,
				'Service Agreement with Structured Chunks',
				'service_agreement.pdf',
				'document',
				'/test/service_agreement.pdf',
				245678,
				'application/pdf',
				JSON.stringify({
					chunks: TEST_CHUNKS,
					totalPages: 7,
					processingComplete: true,
					ocrProvider: 'TESSERACT',
					extractedAt: new Date().toISOString()
				})
			]
		);

		const evidenceId = evidenceResult.rows[0].id;
		const evidenceTitle = evidenceResult.rows[0].title;

		console.log(`\n✅ Created evidence: ${evidenceTitle}`);
		console.log(`   ID: ${evidenceId}`);
		console.log(`   Chunks: ${TEST_CHUNKS.length}`);
		console.log(
			`   Types: ARTICLE (${TEST_CHUNKS.filter((c) => c.type === 'ARTICLE').length}), SECTION (${TEST_CHUNKS.filter((c) => c.type === 'SECTION').length}), SUBSECTION (${TEST_CHUNKS.filter((c) => c.type === 'SUBSECTION').length})`
		);

		// Note: evidence_vectors table has different schema than expected
		// Chunks are stored in evidence.metadata.chunks which is sufficient for UI testing
		console.log('\n📦 Chunks stored in evidence metadata (vectors skipped)\n');

		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('✅ SEEDING COMPLETE!');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

		console.log(`🆔 Evidence ID: ${evidenceId}`);
		console.log(`📁 Evidence Title: ${evidenceTitle}`);
		console.log(`🔗 View Evidence:`);
		console.log(`   http://localhost:5173/evidence/${evidenceId}\n`);

		console.log(`📊 Chunk Breakdown:`);
		console.log(`   - ARTICLE chunks: 3 (cyan background)`);
		console.log(`   - SECTION chunks: 3 (orange background)`);
		console.log(`   - SUBSECTION chunks: 2 (purple background)`);
		console.log(`   - Total chunks: 8\n`);

		console.log(`🎯 Expected UI:`);
		console.log(`   - Click-to-expand chunks`);
		console.log(`   - Color-coded chunk type badges`);
		console.log(`   - Chevron icons for expand/collapse`);
		console.log(`   - Preview text (truncated to 150 chars)`);
		console.log(`   - Full text when expanded\n`);

		await pool.end();
		process.exit(0);
	} catch (error) {
		console.error('❌ Error:', error.message);
		console.error(error.stack);
		await pool.end();
		process.exit(1);
	}
}

main();
