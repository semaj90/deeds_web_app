/**
 * Read-only topic → feature → packet → concept join. Pure: takes already-fetched records, performs no I/O.
 *
 * Owners reused, not duplicated:
 *   - topic identity: topic-identity-v1.ts (deriveTopicIdentityV1)
 *   - read-model rows: topic-identity-read-model-v1.ts (toTopicIdentityReadModelV1)
 * This module only joins them. It never joins on feature_label, never resolves a packet without a packet key
 * and source revision, and never promotes anything. Every rejected or unresolved record stays in the output
 * with an explicit status and a diagnostic.
 */
import { createHash } from 'node:crypto';
import type { TopicIdentityReadModelRowV1 } from './topic-identity-read-model-v1.js';

export const TOPIC_CONCEPT_JOIN_SCHEMA = 'atlas.topic-concept-join.v1' as const;

export interface FeatureRecordV1 {
	featureId: string;
	featureLabel: string;
}

export interface FeatureTopicLinkV1 {
	topicId: string;
	featureId: string;
}

export interface PacketRecordV1 {
	packetKey: string;
	sourceRef: string;
	sourceRevision: string | null;
	featureId: string;
	admitted: boolean;
	embeddingRecipe: string | null;
}

export interface ConceptNodeV1 {
	/** Durable concept identifier. Must not be a Neo4j element ID. */
	conceptId: string;
	label: string;
}

export interface ConceptEdgeV1 {
	fromConceptId: string;
	toConceptId: string;
	relation: string;
}

export interface TopicConceptJoinInputV1 {
	topics: TopicIdentityReadModelRowV1[];
	features: FeatureRecordV1[];
	featureLinks: FeatureTopicLinkV1[];
	packets: PacketRecordV1[];
	concepts: ConceptNodeV1[];
	edges: ConceptEdgeV1[];
	graphRevision: string;
	currentGraphRevision: string;
	expectedEmbeddingRecipe: string;
}

export type PacketStatus = 'RESOLVED' | 'UNRESOLVED_PACKET' | 'UNADMITTED' | 'UNQUALIFIED_SOURCE' | 'RECIPE_MISMATCH';

export interface TopicConceptDiagnosticV1 {
	code:
		| 'DUPLICATE_TOPIC_LABEL'
		| 'ORPHANED_FEATURE_LINK'
		| 'UNRESOLVED_PACKET'
		| 'UNADMITTED_PACKET'
		| 'UNQUALIFIED_SOURCE'
		| 'RECIPE_MISMATCH'
		| 'STALE_GRAPH_REVISION'
		| 'DEGRADED_CONCEPT_ID'
		| 'DANGLING_CONCEPT_EDGE';
	subject: string;
	detail: string;
}

export interface TopicConceptJoinReceiptV1 {
	schema: typeof TOPIC_CONCEPT_JOIN_SCHEMA;
	graphRevision: string;
	currentGraphRevision: string;
	graphFresh: boolean;
	topics: Array<{
		topicId: string;
		displayLabel: string;
		taxonomyRevision: string;
		freshness: 'FRESH' | 'STALE_GRAPH' | 'UNRESOLVED';
		features: Array<{ featureId: string; featureLabel: string }>;
		packets: Array<{ packetKey: string; sourceRef: string; sourceRevision: string | null; status: PacketStatus }>;
	}>;
	concepts: Array<{ conceptId: string; label: string; durable: boolean }>;
	edges: ConceptEdgeV1[];
	diagnostics: TopicConceptDiagnosticV1[];
	counts: {
		topics: number;
		resolvedPackets: number;
		unresolvedPackets: number;
		orphanedFeatureLinks: number;
		duplicateLabels: number;
		degradedConcepts: number;
	};
	canonicalAuthority: false;
	writesPerformed: false;
	checksum: string;
}

/** Neo4j element IDs look like "4:<uuid>:<n>". They change between sessions, so they are never durable. */
const NEO4J_ELEMENT_ID = /^\d+:[0-9a-f-]{8,}:\d+$/i;

export function isDegradedConceptId(conceptId: string): boolean {
	return NEO4J_ELEMENT_ID.test(conceptId.trim());
}

function sha256(text: string): string {
	return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function buildTopicConceptJoinV1(input: TopicConceptJoinInputV1): TopicConceptJoinReceiptV1 {
	const diagnostics: TopicConceptDiagnosticV1[] = [];
	const graphFresh = input.graphRevision === input.currentGraphRevision;
	if (!graphFresh) {
		diagnostics.push({
			code: 'STALE_GRAPH_REVISION',
			subject: input.graphRevision,
			detail: `graph ${input.graphRevision} != current ${input.currentGraphRevision}`
		});
	}

	// Duplicate labels: group by taxonomy revision + normalized label. Both topics are kept; nothing is merged.
	const labelGroups = new Map<string, string[]>();
	for (const t of input.topics) {
		const key = `${t.taxonomyRevision}::${t.normalizedLabel}`;
		labelGroups.set(key, [...(labelGroups.get(key) ?? []), t.topicId]);
	}
	let duplicateLabels = 0;
	for (const [key, ids] of labelGroups) {
		if (ids.length > 1) {
			duplicateLabels++;
			diagnostics.push({ code: 'DUPLICATE_TOPIC_LABEL', subject: key, detail: ids.sort().join(',') });
		}
	}

	const featureById = new Map(input.features.map((f) => [f.featureId, f]));
	const packetsByFeature = new Map<string, PacketRecordV1[]>();
	for (const p of input.packets) {
		packetsByFeature.set(p.featureId, [...(packetsByFeature.get(p.featureId) ?? []), p]);
	}

	let orphanedFeatureLinks = 0;
	let resolvedPackets = 0;
	let unresolvedPackets = 0;

	const topicsOut = input.topics
		.map((t) => {
			const links = input.featureLinks.filter((l) => l.topicId === t.topicId);
			const features: Array<{ featureId: string; featureLabel: string }> = [];
			const packets: TopicConceptJoinReceiptV1['topics'][number]['packets'] = [];

			for (const link of links) {
				const feature = featureById.get(link.featureId);
				if (!feature) {
					orphanedFeatureLinks++;
					diagnostics.push({
						code: 'ORPHANED_FEATURE_LINK',
						subject: `${t.topicId}->${link.featureId}`,
						detail: 'feature id has no feature record'
					});
					continue;
				}
				features.push({ featureId: feature.featureId, featureLabel: feature.featureLabel });

				// Packets are attached by feature_id AND keep packet_key + source_ref; never by label.
				for (const p of packetsByFeature.get(feature.featureId) ?? []) {
					let status: PacketStatus = 'RESOLVED';
					if (!p.packetKey || !p.sourceRef) status = 'UNRESOLVED_PACKET';
					else if (!p.admitted) status = 'UNADMITTED';
					else if (!p.sourceRevision) status = 'UNQUALIFIED_SOURCE';
					else if (p.embeddingRecipe !== input.expectedEmbeddingRecipe) status = 'RECIPE_MISMATCH';

					if (status === 'RESOLVED') resolvedPackets++;
					else {
						unresolvedPackets++;
						const code =
							status === 'UNADMITTED'
								? 'UNADMITTED_PACKET'
								: status === 'UNQUALIFIED_SOURCE'
									? 'UNQUALIFIED_SOURCE'
									: status === 'RECIPE_MISMATCH'
										? 'RECIPE_MISMATCH'
										: 'UNRESOLVED_PACKET';
						diagnostics.push({ code, subject: p.packetKey || '(missing)', detail: `${t.topicId} ${status}` });
					}
					packets.push({ packetKey: p.packetKey, sourceRef: p.sourceRef, sourceRevision: p.sourceRevision, status });
				}
			}

			packets.sort((a, b) => a.packetKey.localeCompare(b.packetKey));
			features.sort((a, b) => a.featureId.localeCompare(b.featureId));
			const freshness: 'FRESH' | 'STALE_GRAPH' | 'UNRESOLVED' = !graphFresh
				? 'STALE_GRAPH'
				: packets.some((p) => p.status !== 'RESOLVED')
					? 'UNRESOLVED'
					: 'FRESH';
			return {
				topicId: t.topicId,
				displayLabel: t.displayLabel,
				taxonomyRevision: t.taxonomyRevision,
				freshness,
				features,
				packets
			};
		})
		.sort((a, b) => a.topicId.localeCompare(b.topicId));

	let degradedConcepts = 0;
	const conceptsOut = input.concepts
		.map((c) => {
			const degraded = isDegradedConceptId(c.conceptId);
			if (degraded) {
				degradedConcepts++;
				diagnostics.push({
					code: 'DEGRADED_CONCEPT_ID',
					subject: c.conceptId,
					detail: 'Neo4j element ID is not a durable concept identity'
				});
			}
			return { conceptId: c.conceptId, label: c.label, durable: !degraded };
		})
		.sort((a, b) => a.conceptId.localeCompare(b.conceptId));

	const conceptIds = new Set(input.concepts.map((c) => c.conceptId));
	const edgesOut = input.edges
		.filter((e) => {
			const ok = conceptIds.has(e.fromConceptId) && conceptIds.has(e.toConceptId);
			if (!ok) {
				diagnostics.push({
					code: 'DANGLING_CONCEPT_EDGE',
					subject: `${e.fromConceptId}-${e.relation}->${e.toConceptId}`,
					detail: 'edge endpoint is not in the concept set'
				});
			}
			return ok;
		})
		.sort((a, b) =>
			`${a.fromConceptId}|${a.relation}|${a.toConceptId}`.localeCompare(`${b.fromConceptId}|${b.relation}|${b.toConceptId}`)
		);

	diagnostics.sort((a, b) => `${a.code}|${a.subject}`.localeCompare(`${b.code}|${b.subject}`));

	const body = {
		schema: TOPIC_CONCEPT_JOIN_SCHEMA,
		graphRevision: input.graphRevision,
		currentGraphRevision: input.currentGraphRevision,
		graphFresh,
		topics: topicsOut,
		concepts: conceptsOut,
		edges: edgesOut,
		diagnostics,
		counts: {
			topics: topicsOut.length,
			resolvedPackets,
			unresolvedPackets,
			orphanedFeatureLinks,
			duplicateLabels,
			degradedConcepts
		},
		canonicalAuthority: false as const,
		writesPerformed: false as const
	};
	return { ...body, checksum: sha256(JSON.stringify(body)) };
}
