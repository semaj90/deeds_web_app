/**
 * Parent Atlas Unified Retrieval Admission & RRF Assembler (atlas.retrieval-admission.v1)
 *
 * Normalizes hits from Postgres, pgvector, Neo4j, Qdrant, and TurboVec under one
 * canonical admission contract without creating a second database authority.
 *
 * Invariants:
 * - Never mixes uncalibrated raw scores across backends; fuses admitted ranks via RRF.
 * - Deduplicates by (stableKey, sourceRevision).
 * - Stale graph projections, missing packets, inconsistent revisions, unavailable
 *   vector backends, or failed validation receipts can NEVER silently become PROVEN.
 */

import { z } from 'zod';

export const RETRIEVAL_BACKENDS_V1 = ['postgres', 'pgvector', 'neo4j', 'qdrant', 'turbovec'] as const;
export type RetrievalBackendV1 = (typeof RETRIEVAL_BACKENDS_V1)[number];

export const AtlasRetrievalHitV1Schema = z
	.object({
		taskId: z.string().min(1),
		stableKey: z.string().min(1),
		packetKey: z.string().min(1).nullable(),
		sourceId: z.string().min(1),
		sourceRevision: z.string().min(1),
		repositoryRevision: z.string().min(1),
		indexRevision: z.string().min(1).nullable(),
		backend: z.enum(RETRIEVAL_BACKENDS_V1),
		rawScore: z.number().finite(),
		rank: z.number().int().positive(),
		admission: z.enum(['ADMITTED', 'UNRESOLVED', 'REJECTED']),
		receiptIds: z.array(z.string().min(1))
	})
	.strict();

export type AtlasRetrievalHitV1 = z.infer<typeof AtlasRetrievalHitV1Schema>;

export interface BackendHealthStatusV1 {
	readonly available: boolean;
	readonly stale?: boolean;
}

export interface ValidationReceiptStatusV1 {
	readonly receiptId: string;
	readonly passed: boolean;
}

export interface FusedRetrievalCandidateV1 {
	readonly stableKey: string;
	readonly sourceId: string;
	readonly sourceRevision: string;
	readonly packetKey: string;
	readonly backends: RetrievalBackendV1[];
	readonly rrfScore: number;
	readonly receiptIds: string[];
}

export type AdmissionBlockReasonV1 =
	| 'MISSING_PACKET'
	| 'REVISION_MISMATCH'
	| 'STALE_GRAPH_PROJECTION'
	| 'BACKEND_UNAVAILABLE'
	| 'FAILED_VALIDATION_RECEIPT'
	| 'NO_ADMITTED_HITS';

export interface AtlasRetrievalAdmissionResultV1 {
	readonly schema: 'atlas.retrieval-admission.v1';
	readonly taskId: string;
	readonly canonicalAuthority: false;
	readonly promotionStatus: 'PROVEN' | 'CREATED' | 'UNRESOLVED' | 'REJECTED';
	readonly blockReasons: AdmissionBlockReasonV1[];
	readonly admittedHits: AtlasRetrievalHitV1[];
	readonly rejectedOrUnresolvedHits: Array<{
		readonly hit: AtlasRetrievalHitV1;
		readonly reason: AdmissionBlockReasonV1;
	}>;
	readonly fusedCandidates: FusedRetrievalCandidateV1[];
	readonly top100Contribution: number;
}

export function admitRetrievalForTaskV1(input: {
	taskId: string;
	expectedRepositoryRevision: string;
	expectedSourceRevisionByKey: Readonly<Record<string, string>>;
	hits: readonly AtlasRetrievalHitV1[];
	backendHealth: Readonly<Partial<Record<RetrievalBackendV1, BackendHealthStatusV1>>>;
	validationReceipts: readonly ValidationReceiptStatusV1[];
	rrfK?: number;
}): AtlasRetrievalAdmissionResultV1 {
	const rrfK = input.rrfK ?? 60;
	const receiptMap = new Map(input.validationReceipts.map((r) => [r.receiptId, r.passed]));
	const blockReasons = new Set<AdmissionBlockReasonV1>();
	const admittedHits: AtlasRetrievalHitV1[] = [];
	const rejectedOrUnresolvedHits: Array<{
		readonly hit: AtlasRetrievalHitV1;
		readonly reason: AdmissionBlockReasonV1;
	}> = [];

	for (const rawHit of input.hits) {
		const hit = AtlasRetrievalHitV1Schema.parse(rawHit);
		const health = input.backendHealth[hit.backend] ?? { available: true, stale: false };

		if (!health.available) {
			blockReasons.add('BACKEND_UNAVAILABLE');
			rejectedOrUnresolvedHits.push({
				hit: { ...hit, admission: 'UNRESOLVED' },
				reason: 'BACKEND_UNAVAILABLE'
			});
			continue;
		}
		if (health.stale) {
			blockReasons.add('STALE_GRAPH_PROJECTION');
			rejectedOrUnresolvedHits.push({
				hit: { ...hit, admission: 'UNRESOLVED' },
				reason: 'STALE_GRAPH_PROJECTION'
			});
			continue;
		}
		if (!hit.packetKey) {
			blockReasons.add('MISSING_PACKET');
			rejectedOrUnresolvedHits.push({
				hit: { ...hit, admission: 'UNRESOLVED' },
				reason: 'MISSING_PACKET'
			});
			continue;
		}

		const expectedSourceRev = input.expectedSourceRevisionByKey[hit.stableKey];
		if (
			hit.repositoryRevision !== input.expectedRepositoryRevision ||
			(expectedSourceRev !== undefined && hit.sourceRevision !== expectedSourceRev)
		) {
			blockReasons.add('REVISION_MISMATCH');
			rejectedOrUnresolvedHits.push({
				hit: { ...hit, admission: 'REJECTED' },
				reason: 'REVISION_MISMATCH'
			});
			continue;
		}

		const hasFailedReceipt =
			hit.receiptIds.length === 0 ||
			hit.receiptIds.some((rid) => receiptMap.get(rid) !== true);
		if (hasFailedReceipt) {
			blockReasons.add('FAILED_VALIDATION_RECEIPT');
			rejectedOrUnresolvedHits.push({
				hit: { ...hit, admission: 'REJECTED' },
				reason: 'FAILED_VALIDATION_RECEIPT'
			});
			continue;
		}

		admittedHits.push({ ...hit, admission: 'ADMITTED' });
	}

	// Deduplicate by (stableKey, sourceRevision) and fuse via Reciprocal Rank Fusion
	const fusedMap = new Map<
		string,
		{
			stableKey: string;
			sourceId: string;
			sourceRevision: string;
			packetKey: string;
			backends: Set<RetrievalBackendV1>;
			rrfScore: number;
			receiptIds: Set<string>;
		}
	>();

	for (const hit of admittedHits) {
		const dedupeKey = `${hit.stableKey}::${hit.sourceRevision}`;
		let entry = fusedMap.get(dedupeKey);
		if (!entry) {
			entry = {
				stableKey: hit.stableKey,
				sourceId: hit.sourceId,
				sourceRevision: hit.sourceRevision,
				packetKey: hit.packetKey!,
				backends: new Set<RetrievalBackendV1>(),
				rrfScore: 0,
				receiptIds: new Set<string>()
			};
			fusedMap.set(dedupeKey, entry);
		}
		if (!entry.backends.has(hit.backend)) {
			entry.backends.add(hit.backend);
			entry.rrfScore += 1 / (rrfK + hit.rank);
		}
		for (const rid of hit.receiptIds) entry.receiptIds.add(rid);
	}

	const fusedCandidates: FusedRetrievalCandidateV1[] = [...fusedMap.values()]
		.map((e) => ({
			stableKey: e.stableKey,
			sourceId: e.sourceId,
			sourceRevision: e.sourceRevision,
			packetKey: e.packetKey,
			backends: [...e.backends].sort(),
			rrfScore: Number(e.rrfScore.toFixed(6)),
			receiptIds: [...e.receiptIds].sort()
		}))
		.sort((a, b) => b.rrfScore - a.rrfScore || a.stableKey.localeCompare(b.stableKey));

	if (admittedHits.length === 0) {
		blockReasons.add('NO_ADMITTED_HITS');
	}

	const reasons = [...blockReasons].sort();
	let promotionStatus: AtlasRetrievalAdmissionResultV1['promotionStatus'] = 'PROVEN';
	if (reasons.includes('REVISION_MISMATCH') || reasons.includes('FAILED_VALIDATION_RECEIPT')) {
		promotionStatus = admittedHits.length > 0 ? 'UNRESOLVED' : 'REJECTED';
	} else if (reasons.length > 0) {
		promotionStatus = 'UNRESOLVED';
	}

	const top100Contribution =
		promotionStatus === 'PROVEN' && fusedCandidates.length > 0
			? Number(Math.min(25, fusedCandidates[0]!.rrfScore * 500).toFixed(2))
			: 0;

	return {
		schema: 'atlas.retrieval-admission.v1',
		taskId: input.taskId,
		canonicalAuthority: false,
		promotionStatus,
		blockReasons: reasons,
		admittedHits,
		rejectedOrUnresolvedHits,
		fusedCandidates,
		top100Contribution
	};
}

export interface OntologyProposalEntryV1 {
	readonly conceptId: string;
	readonly label: string;
	readonly clusterId: number;
	readonly cosineSim: number;
	readonly pageRank: number;
	readonly score: number;
}

export interface OntologyEnrichedCandidateV1 extends FusedRetrievalCandidateV1 {
	readonly ontologyProposals: ReadonlyArray<OntologyProposalEntryV1>;
	readonly ontologyAuthorityLabel: 'RETRIEVAL_PROPOSAL';
}

/**
 * Attaches non-canonical NetworkX PageRank + K-Means ontology proposals
 * (`conceptId -> clusterId / pageRank / score`) to admitted RRF candidates
 * without altering RRF rank, promotionStatus, or sourceRevision identity.
 */
export function attachOntologyProposalsToAdmittedCandidatesV1(
	candidates: readonly FusedRetrievalCandidateV1[],
	ontologyMap: Readonly<Record<string, OntologyProposalEntryV1>>,
	conceptIdsByStableKey: Readonly<Record<string, readonly string[]>>
): OntologyEnrichedCandidateV1[] {
	return candidates.map((cand) => {
		const linkedIds = conceptIdsByStableKey[cand.stableKey] ?? [];
		const proposals: OntologyProposalEntryV1[] = [];
		for (const cid of linkedIds) {
			const entry = ontologyMap[cid];
			if (entry) proposals.push(entry);
		}
		proposals.sort((a, b) => b.score - a.score || a.conceptId.localeCompare(b.conceptId));
		return {
			...cand,
			ontologyProposals: proposals,
			ontologyAuthorityLabel: 'RETRIEVAL_PROPOSAL'
		};
	});
}
