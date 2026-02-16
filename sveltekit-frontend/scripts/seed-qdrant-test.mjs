/**
 * Seed Qdrant with a known legal text chunk for RAG proof-of-concept.
 * Generates embedding via Ollama embeddinggemma, upserts into evidence_vectors,
 * then self-tests with the same text to verify the pipeline.
 *
 * Usage: node scripts/seed-qdrant-test.mjs
 */

const OLLAMA = 'http://localhost:11434';
const QDRANT = 'http://localhost:6333';

const SEED_CHUNKS = [
	{
		id: 'a0000001-0001-0001-0001-000000000001',
		text: 'Under California Penal Code Section 836, a peace officer may arrest a person without a warrant when the officer has probable cause to believe that the person has committed a public offense in the officer\'s presence. Probable cause requires specific articulable facts that would lead a reasonable person to believe a crime has been committed. The Fourth Amendment of the United States Constitution protects individuals from unreasonable searches and seizures, and this standard applies to all warrantless arrests.',
		title: 'CA Penal Code 836 - Warrantless Arrest & Probable Cause',
		collection: 'evidence_vectors',
		document_type: 'statute'
	},
	{
		id: 'a0000001-0001-0001-0001-000000000002',
		text: 'The hearsay rule, codified in Federal Rules of Evidence Rule 802, provides that hearsay is not admissible unless an exception applies. Hearsay is defined as an out-of-court statement offered to prove the truth of the matter asserted. Key exceptions include excited utterances (Rule 803(2)), present sense impressions (Rule 803(1)), statements for medical diagnosis (Rule 803(4)), and business records (Rule 803(6)). The confrontation clause of the Sixth Amendment further restricts hearsay in criminal cases.',
		title: 'FRE 802 - Hearsay Rule & Exceptions',
		collection: 'case_chunks',
		document_type: 'case_law'
	},
	{
		id: 'a0000001-0001-0001-0001-000000000003',
		text: 'Miranda v. Arizona (1966) established that law enforcement must inform suspects of their Fifth Amendment rights before custodial interrogation. The required warnings include: the right to remain silent, that anything said can be used against them in court, the right to an attorney, and that an attorney will be appointed if they cannot afford one. Failure to provide Miranda warnings renders any subsequent statements inadmissible. The Miranda doctrine applies when a suspect is in custody and subject to interrogation by law enforcement.',
		title: 'Miranda v. Arizona - Custodial Interrogation Rights',
		collection: 'law_sections',
		document_type: 'case_law'
	}
];

async function generateEmbedding(text) {
	const res = await fetch(`${OLLAMA}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
	});

	if (!res.ok) {
		throw new Error(`Embedding failed: HTTP ${res.status} — ${await res.text()}`);
	}

	const data = await res.json();
	return { vector: data.embedding, model: data.model || 'embeddinggemma:latest' };
}

async function upsertPoint(collection, id, vector, payload) {
	const res = await fetch(`${QDRANT}/collections/${collection}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: [{
				id,
				vector,
				payload
			}]
		})
	});

	if (!res.ok) {
		throw new Error(`Upsert failed: HTTP ${res.status} — ${await res.text()}`);
	}

	return await res.json();
}

async function searchCollection(collection, vector, limit = 3) {
	const res = await fetch(`${QDRANT}/collections/${collection}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector,
			limit,
			with_payload: true,
			score_threshold: 0.30
		})
	});

	if (!res.ok) {
		throw new Error(`Search failed: HTTP ${res.status}`);
	}

	const data = await res.json();
	return data.result || [];
}

async function main() {
	console.log('=== Qdrant RAG Seed Script ===\n');

	// Seed all chunks
	for (const chunk of SEED_CHUNKS) {
		console.log(`[${chunk.collection}] Embedding "${chunk.title}"...`);
		const { vector, model } = await generateEmbedding(chunk.text);
		console.log(`  → dims=${vector.length}, model=${model}`);

		await upsertPoint(chunk.collection, chunk.id, vector, {
			text: chunk.text,
			title: chunk.title,
			document_type: chunk.document_type,
			source: 'seed-test',
			embedding_model: model,
			embedding_dims: vector.length
		});
		console.log(`  → Upserted into ${chunk.collection}`);
	}

	// Verify counts
	console.log('\n--- Collection Counts ---');
	for (const col of ['evidence_vectors', 'case_chunks', 'law_sections']) {
		const res = await fetch(`${QDRANT}/collections/${col}`);
		const data = await res.json();
		console.log(`  ${col}: ${data.result.points_count} points`);
	}

	// Self-test: search with a paraphrase of the probable cause text
	console.log('\n--- Paraphrase Self-Test ---');
	const paraphrase = 'What are the requirements for a warrantless arrest and probable cause under California law?';
	console.log(`Query: "${paraphrase}"`);

	const { vector: queryVec } = await generateEmbedding(paraphrase);

	for (const col of ['evidence_vectors', 'case_chunks', 'law_sections']) {
		const hits = await searchCollection(col, queryVec);
		if (hits.length > 0) {
			console.log(`  ${col}: ${hits.length} hits, topScore=${hits[0].score.toFixed(4)}, id=${hits[0].id}`);
		} else {
			console.log(`  ${col}: 0 hits`);
		}
	}

	// Cross-topic test: Miranda paraphrase
	console.log('\n--- Miranda Paraphrase Test ---');
	const mirandaQ = 'Do police have to read you your rights before questioning?';
	console.log(`Query: "${mirandaQ}"`);
	const { vector: mVec } = await generateEmbedding(mirandaQ);

	for (const col of ['evidence_vectors', 'case_chunks', 'law_sections']) {
		const hits = await searchCollection(col, mVec);
		if (hits.length > 0) {
			console.log(`  ${col}: ${hits.length} hits, topScore=${hits[0].score.toFixed(4)}, id=${hits[0].id}`);
		} else {
			console.log(`  ${col}: 0 hits`);
		}
	}

	console.log('\n=== Seed Complete ===');
}

main().catch(e => {
	console.error('FATAL:', e.message);
	process.exit(1);
});
