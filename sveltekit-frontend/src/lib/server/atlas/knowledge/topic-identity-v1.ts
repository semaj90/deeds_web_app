import { createHash } from 'node:crypto';

export const TOPIC_IDENTITY_SCHEMA = 'atlas.topic-identity.v1' as const;
export const TOPIC_TAXONOMY_REVISION = 'atlas-topic-taxonomy-v1' as const;

export interface TopicIdentityInputV1 {
	label: string;
	taxonomyRevision?: string;
	sourceRef?: string | null;
	sourceRevision?: string | null;
}

export interface TopicIdentityV1 {
	schema: typeof TOPIC_IDENTITY_SCHEMA;
	topicId: string;
	topicKey: string;
	label: string;
	normalizedLabel: string;
	taxonomyRevision: string;
	sourceRef: string | null;
	sourceRevision: string | null;
	/** Existing packet title grouping remains a distinct compatibility field. */
	titleId: string;
	canonicalAuthority: false;
	writesPerformed: false;
}

const TOPIC_NAMESPACE = Buffer.from('parent-atlas-topic-identity-v1', 'utf8');

function required(value: string, field: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`TOPIC_IDENTITY_INPUT_UNQUALIFIED:${field}`);
	return normalized;
}

export function normalizeTopicLabel(label: string): string {
	return required(label, 'label')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function slug(value: string): string {
	return value.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 64) || 'untitled';
}

function uuidV5(namespace: Buffer, name: string): string {
	const digest = createHash('sha1').update(namespace).update(name, 'utf8').digest();
	const bytes = Buffer.from(digest.subarray(0, 16));
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deriveTopicIdentityV1(input: TopicIdentityInputV1): TopicIdentityV1 {
	const normalizedLabel = normalizeTopicLabel(input.label);
	const taxonomyRevision = required(input.taxonomyRevision ?? TOPIC_TAXONOMY_REVISION, 'taxonomyRevision');
	const topicKey = `topic:${slug(normalizedLabel)}`;
	const topicId = uuidV5(TOPIC_NAMESPACE, `${taxonomyRevision}\0${normalizedLabel}`);
	const titleDigest = createHash('sha256').update(`${taxonomyRevision}\0${normalizedLabel}`, 'utf8').digest('hex').slice(0, 8);

	return {
		schema: TOPIC_IDENTITY_SCHEMA,
		topicId,
		topicKey,
		label: required(input.label, 'label'),
		normalizedLabel,
		taxonomyRevision,
		sourceRef: input.sourceRef?.trim() || null,
		sourceRevision: input.sourceRevision?.trim() || null,
		titleId: `title:${slug(normalizedLabel)}:${titleDigest}`,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
