import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import { eq, ne, desc, sql } from 'drizzle-orm';
import { generateEmbedding } from '$lib/server/ai/embeddings-simple.js';
import type { RequestHandler } from './$types';

/**
 * GET /api/persons-of-interest/[id]/similar
 * Find similar POIs via vector embeddings with text-based fallback.
 */
export const GET: RequestHandler = async ({ params }) => {
	const poiId = params.id;
	try {
		const [target] = await db
			.select()
			.from(personsOfInterest)
			.where(eq(personsOfInterest.id, poiId))
			.limit(1);

		if (!target) {
			return json({ similar: [], method: 'none', error: 'POI not found' });
		}

		const targetProfile = buildProfile(target);

		const candidates = await db
			.select({
				id: personsOfInterest.id,
				name: personsOfInterest.name,
				status: personsOfInterest.status,
				threatLevel: personsOfInterest.threatLevel,
				description: personsOfInterest.description,
				aliases: personsOfInterest.aliases,
				caseIds: personsOfInterest.caseIds,
				photoUrl: sql<string | null>`(
					SELECT ${poiPhotos.thumbnailUrl} FROM ${poiPhotos}
					WHERE ${poiPhotos.poiId} = ${personsOfInterest.id}
					ORDER BY ${poiPhotos.uploadedAt} DESC LIMIT 1
				)`.as('photo_url'),
			})
			.from(personsOfInterest)
			.where(ne(personsOfInterest.id, poiId))
			.orderBy(desc(personsOfInterest.updatedAt))
			.limit(50);

		if (candidates.length === 0) {
			return json({ similar: [], method: 'none' });
		}

		const vectorResults = await tryVectorSimilarity(targetProfile, candidates);
		if (vectorResults) {
			return json({ similar: vectorResults.slice(0, 5), method: 'vector' });
		}

		const textResults = textSimilarity(target, candidates);
		return json({ similar: textResults.slice(0, 5), method: 'text' });
	} catch (err) {
		console.error('Similar POI search error:', err);
		return json({ similar: [], method: 'error', error: 'Search failed' });
	}
};

function buildProfile(poi: {
	name: string;
	description?: string | null;
	aliases?: string[] | null;
	status: string;
	threatLevel: string;
}): string {
	const parts: string[] = ['Name: ' + poi.name];
	if (poi.description) parts.push('Description: ' + poi.description);
	const aliases = Array.isArray(poi.aliases) ? poi.aliases : [];
	if (aliases.length > 0) parts.push('Aliases: ' + aliases.join(', '));
	parts.push('Status: ' + poi.status, 'Threat: ' + poi.threatLevel);
	return parts.join('. ');
}

function cosineSim(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let nA = 0;
	let nB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		nA += a[i] * a[i];
		nB += b[i] * b[i];
	}
	const d = Math.sqrt(nA) * Math.sqrt(nB);
	return d === 0 ? 0 : dot / d;
}

type Candidate = {
	id: string;
	name: string;
	status: string;
	threatLevel: string;
	description: string | null;
	aliases: string[] | null;
	caseIds: string[] | null;
	photoUrl: string | null;
};

type SimilarPOI = {
	poiId: string;
	name: string;
	status: string;
	threatLevel: string;
	description: string;
	lastLocation: string | null;
	photoUrl: string | null;
	similarity: number;
};

function toSimilarPOI(c: Candidate, similarity: number): SimilarPOI {
	return {
		poiId: c.id,
		name: c.name,
		status: c.status,
		threatLevel: c.threatLevel,
		description: c.description ?? "",
		lastLocation: null,
		photoUrl: c.photoUrl ?? null,
		similarity,
	};
}

async function tryVectorSimilarity(
	targetProfile: string,
	candidates: Candidate[]
): Promise<SimilarPOI[] | null> {
	try {
		const targetEmbedding = await Promise.race([
			generateEmbedding(targetProfile),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('timeout')), 5000)
			) as Promise<null>,
		]);

		if (!targetEmbedding || !Array.isArray(targetEmbedding) || targetEmbedding.length === 0) {
			return null;
		}

		const scored: SimilarPOI[] = [];
		const batchSize = 5;

		for (let i = 0; i < candidates.length; i += batchSize) {
			const batch = candidates.slice(i, i + batchSize);
			const embedResults = await Promise.allSettled(
				batch.map((c) => {
					const profile = buildProfile(c);
					return Promise.race([
						generateEmbedding(profile),
						new Promise((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), 3000)
					) as Promise<null>,
					]);
				})
			);

			for (let j = 0; j < batch.length; j++) {
				const result = embedResults[j];
				if (
					result.status === 'fulfilled' &&
					result.value &&
					Array.isArray(result.value) &&
					result.value.length > 0
				) {
					const sim = cosineSim(targetEmbedding as number[], result.value as number[]);
					if (sim > 0.1) {
						scored.push(toSimilarPOI(batch[j], sim));
					}
				}
			}
		}

		if (scored.length === 0) return null;

		scored.sort((a, b) => b.similarity - a.similarity);
		return scored;
	} catch {
		return null;
	}
}

function textSimilarity(
	target: {
		name: string;
		description?: string | null;
		aliases?: string[] | null;
		status: string;
		threatLevel: string;
		caseIds?: string[] | null;
	},
	candidates: Candidate[]
): SimilarPOI[] {
	const targetCaseIds = Array.isArray(target.caseIds) ? target.caseIds : [];
	const targetAliases = Array.isArray(target.aliases) ? target.aliases : [];
	const targetNameWords = new Set(target.name.toLowerCase().split(/\s+/));
	const targetKeywords = extractKeywords(target.description ?? '');

	const scored: SimilarPOI[] = [];

	for (const c of candidates) {
		let score = 0;

		const cCaseIds = Array.isArray(c.caseIds) ? c.caseIds : [];
		let sharedCases = 0;
		for (const tc of targetCaseIds) {
			if (cCaseIds.includes(tc)) sharedCases++;
		}
		if (sharedCases > 0) score += 0.4;
		score += Math.min(sharedCases * 0.15, 0.3);

		if (target.threatLevel === c.threatLevel) {
			score += 0.1;
		}

		if (target.status === c.status) {
			score += 0.05;
		}

		const cNameWords = new Set(c.name.toLowerCase().split(/\s+/));
		const intersection = [...targetNameWords].filter((w) => cNameWords.has(w));
		const union = new Set([...targetNameWords, ...cNameWords]);
		if (union.size > 0) {
			score += (intersection.length / union.size) * 0.3;
		}

		const cAliases = Array.isArray(c.aliases) ? c.aliases : [];
		const aliasLower = new Set(targetAliases.map((a) => String(a).toLowerCase()));
		for (const ca of cAliases) {
			if (aliasLower.has(String(ca).toLowerCase())) {
				score += 0.25;
				break;
			}
		}

		if (c.description) {
			const cKeywords = extractKeywords(c.description);
			let kwOverlap = 0;
			for (const kw of targetKeywords) {
				if (cKeywords.has(kw)) kwOverlap++;
			}
			score += Math.min(kwOverlap * 0.05, 0.2);
		}

		if (score > 0.05) {
			scored.push(toSimilarPOI(c, Math.min(score, 1)));
		}
	}

	scored.sort((a, b) => b.similarity - a.similarity);
	return scored;
}

function extractKeywords(text: string): Set<string> {
	const stopwords = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
		'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
		'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
		'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
		'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
		'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
		'his', 'her', 'their', 'them', 'who', 'which', 'what', 'where', 'when',
	]);
	const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
	const keywords = new Set<string>();
	for (const w of words) {
		if (w.length > 2 && !stopwords.has(w)) {
			keywords.add(w);
		}
	}
	return keywords;
}
