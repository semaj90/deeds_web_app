import type { TopicIdentityV1 } from './topic-identity-v1.js';

export const TOPIC_IDENTITY_READ_MODEL_SCHEMA = 'atlas.topic-identity-read-model.v1' as const;

export interface TopicIdentityReadModelRowV1 {
	schema: typeof TOPIC_IDENTITY_READ_MODEL_SCHEMA;
	topicId: string;
	topicKey: string;
	normalizedLabel: string;
	displayLabel: string;
	taxonomyRevision: string;
	sourceRef: string | null;
	sourceRevision: string | null;
	evidenceChecksum: string | null;
	producerRevision: string;
	titleId: string;
	canonicalAuthority: false;
	promotionAuthorized: false;
	writesPerformed: false;
}

export function toTopicIdentityReadModelV1(
	identity: TopicIdentityV1,
	input: { producerRevision: string; evidenceChecksum?: string | null }
): TopicIdentityReadModelRowV1 {
	const producerRevision = input.producerRevision.trim();
	if (!producerRevision) throw new Error('TOPIC_READ_MODEL_INPUT_UNQUALIFIED:producerRevision');
	if (identity.canonicalAuthority || identity.writesPerformed) {
		throw new Error('TOPIC_READ_MODEL_CANONICAL_WRITE_FORBIDDEN');
	}

	return {
		schema: TOPIC_IDENTITY_READ_MODEL_SCHEMA,
		topicId: identity.topicId,
		topicKey: identity.topicKey,
		normalizedLabel: identity.normalizedLabel,
		displayLabel: identity.label,
		taxonomyRevision: identity.taxonomyRevision,
		sourceRef: identity.sourceRef,
		sourceRevision: identity.sourceRevision,
		evidenceChecksum: input.evidenceChecksum?.trim() || null,
		producerRevision,
		titleId: identity.titleId,
		canonicalAuthority: false,
		promotionAuthorized: false,
		writesPerformed: false,
	};
}
