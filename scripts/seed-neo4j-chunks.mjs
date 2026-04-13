#!/usr/bin/env node

/**
 * Seed Neo4j with test chunk data
 *
 * Creates:
 * - 30 Chunk nodes (3 evidence items × 10 chunks each)
 * - 3 Evidence nodes (via MERGE)
 * - 30 CHUNK_OF relationships
 * - 27 FOLLOWS relationships (sequential chunks)
 */

const NEO4J_HTTP = 'http://localhost:7474/db/neo4j/query/v2';
const AUTH = `Basic ${Buffer.from('neo4j:neo4j123').toString('base64')}`;

async function runCypher(statement, description) {
	console.log(`\n🔧 ${description}...`);
	const response = await fetch(NEO4J_HTTP, {
		method: 'POST',
		headers: {
			'Authorization': AUTH,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ statement }),
		signal: AbortSignal.timeout(15000)
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${await response.text()}`);
	}

	const data = await response.json();
	console.log(`✅ ${description} complete`);
	return data;
}

const EVIDENCE_ITEMS = [
	{
		id: 'contract-001',
		title: 'Service Agreement with Structured Chunks',
		type: 'Contract',
		date: '2024-03-15'
	},
	{
		id: 'affidavit-001',
		title: 'Witness Affidavit - Jane Smith',
		type: 'Affidavit',
		date: '2024-04-20'
	},
	{
		id: 'email-001',
		title: 'Email Thread - Contract Negotiations',
		type: 'Email',
		date: '2024-05-10'
	}
];

const CHUNK_TEMPLATES = {
	'contract-001': [
		'This Agreement is entered into as of March 15, 2024, between Company A ("Client") and Company B ("Service Provider").',
		'Section 2.01: Scope of Services. The Service Provider shall provide professional consulting services as described in Exhibit A.',
		'Section 2.02: Service Delivery. All services shall be delivered in accordance with industry best practices and applicable regulations.',
		'Article IV: Payment Terms. Client agrees to pay Service Provider the fees specified in Schedule 1.',
		'Section 5.01: Payment Schedule. Payments shall be made within thirty (30) days of invoice receipt.',
		'Section 5.02: Late Payment. Any payment not received within the specified period shall accrue interest at 1.5% per month.',
		'Article VI: Term and Termination. This Agreement shall commence on the Effective Date and continue for one (1) year.',
		'Section 7.01: Termination for Cause. Either party may terminate upon thirty (30) days written notice if the other party materially breaches.',
		'Section 8.01: Confidentiality. Both parties agree to maintain strict confidentiality of all proprietary information.',
		'Article IX: General Provisions. This Agreement shall be governed by the laws of the State of California.'
	],
	'affidavit-001': [
		'I, Jane Smith, hereby declare under penalty of perjury that the following statements are true and correct to the best of my knowledge.',
		'On April 15, 2024, I witnessed a meeting between Mr. John Doe and Ms. Sarah Johnson at the downtown office building.',
		'The meeting commenced at approximately 2:30 PM and lasted for approximately 45 minutes.',
		'During the meeting, I observed Mr. Doe present several documents to Ms. Johnson, which appeared to be contracts or agreements.',
		'Ms. Johnson reviewed the documents carefully and asked several questions about specific terms and conditions.',
		'Mr. Doe explained each section in detail, particularly emphasizing the payment terms and delivery schedule.',
		'At approximately 3:00 PM, both parties signed what appeared to be a service agreement.',
		'I observed that both signatures were witnessed by a notary public who was present at the meeting.',
		'After the signing, both parties shook hands and expressed satisfaction with the agreed terms.',
		'I declare that the above statement is true and correct. Executed on April 20, 2024. Jane Smith, Witness.'
	],
	'email-001': [
		'From: john.doe@example.com To: legal@company.com Subject: Contract Terms Discussion Date: May 10, 2024',
		'Hi Legal Team, I wanted to follow up on our conversation regarding the proposed service agreement.',
		'We have reviewed the draft contract you sent last week and have a few questions about Section 5.',
		'Specifically, we would like clarification on the payment terms and whether they include taxes.',
		'Our understanding is that the $50,000 fee is exclusive of applicable sales tax. Can you confirm?',
		'Additionally, we noticed that the delivery timeline in Section 3 conflicts with Exhibit A.',
		'Section 3 states a 90-day delivery period, while Exhibit A mentions 120 days. Which takes precedence?',
		'We would also like to propose adding a force majeure clause to cover unforeseen circumstances.',
		'Please let us know if you are open to discussing these points in a call next week.',
		'Looking forward to your response. Best regards, John Doe, Senior Manager'
	]
};

async function main() {
	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       Neo4j Chunk Seeding Script                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

	// Step 1: Create Evidence nodes (idempotent with MERGE)
	console.log('\n📦 Step 1: Creating Evidence nodes...');
	for (const evidence of EVIDENCE_ITEMS) {
		await runCypher(
			`MERGE (e:Evidence {id: '${evidence.id}'})
			 ON CREATE SET e.title = '${evidence.title}',
			              e.type = '${evidence.type}',
			              e.date = '${evidence.date}',
			              e.createdAt = datetime()
			 RETURN e.id`,
			`Create Evidence: ${evidence.id}`
		);
	}

	// Step 2: Create Chunk nodes and CHUNK_OF relationships
	console.log('\n📝 Step 2: Creating Chunks and CHUNK_OF relationships...');
	let totalChunks = 0;
	for (const evidence of EVIDENCE_ITEMS) {
		const chunks = CHUNK_TEMPLATES[evidence.id];
		for (let i = 0; i < chunks.length; i++) {
			const chunkId = `${evidence.id}-chunk-${i}`;
			const text = chunks[i].replace(/'/g, "\\'"); // Escape single quotes

			await runCypher(
				`CREATE (c:Chunk {
					id: '${chunkId}',
					evidenceId: '${evidence.id}',
					chunkIndex: ${i},
					text: '${text}',
					type: '${evidence.type}',
					createdAt: datetime()
				})
				WITH c
				MATCH (e:Evidence {id: '${evidence.id}'})
				CREATE (c)-[:CHUNK_OF]->(e)
				RETURN c.id`,
				`Create Chunk ${i + 1}/10 for ${evidence.id}`
			);
			totalChunks++;
		}
	}
	console.log(`✅ Created ${totalChunks} chunks with CHUNK_OF relationships`);

	// Step 3: Create FOLLOWS relationships (sequential chunks)
	console.log('\n🔗 Step 3: Creating FOLLOWS relationships...');
	let followsCount = 0;
	for (const evidence of EVIDENCE_ITEMS) {
		const chunks = CHUNK_TEMPLATES[evidence.id];
		for (let i = 0; i < chunks.length - 1; i++) {
			const currentId = `${evidence.id}-chunk-${i}`;
			const nextId = `${evidence.id}-chunk-${i + 1}`;

			await runCypher(
				`MATCH (c1:Chunk {id: '${currentId}'}), (c2:Chunk {id: '${nextId}'})
				 CREATE (c1)-[:FOLLOWS]->(c2)
				 RETURN c1.id, c2.id`,
				`Create FOLLOWS: chunk ${i} → ${i + 1}`
			);
			followsCount++;
		}
	}
	console.log(`✅ Created ${followsCount} FOLLOWS relationships`);

	// Step 4: Verify seeding
	console.log('\n✅ Step 4: Verifying seed data...');

	const chunkCount = await runCypher(
		`MATCH (c:Chunk) RETURN count(c) AS total`,
		'Count chunks'
	);

	const followsCheck = await runCypher(
		`MATCH ()-[r:FOLLOWS]->() RETURN count(r) AS total`,
		'Count FOLLOWS relationships'
	);

	const evidenceCheck = await runCypher(
		`MATCH (e:Evidence)
		 RETURN e.id AS evidence_id, count{(e)<-[:CHUNK_OF]-()} AS chunk_count
		 ORDER BY evidence_id`,
		'Verify chunks per evidence'
	);

	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           Seeding Complete!                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Summary:
✅ 3 Evidence nodes created (idempotent)
✅ ${totalChunks} Chunk nodes created
✅ ${totalChunks} CHUNK_OF relationships created
✅ ${followsCount} FOLLOWS relationships created

Verification:
${JSON.stringify(chunkCount.data, null, 2)}
${JSON.stringify(followsCheck.data, null, 2)}
${JSON.stringify(evidenceCheck.data, null, 2)}

Next Step:
Run verification script to see all data:
node scripts/verify-neo4j-graph.mjs

View in Neo4j Browser:
http://localhost:7474/browser/
Query: MATCH (c:Chunk)-[:CHUNK_OF]->(e:Evidence) RETURN c, e LIMIT 25
`);
}

main().catch(console.error);