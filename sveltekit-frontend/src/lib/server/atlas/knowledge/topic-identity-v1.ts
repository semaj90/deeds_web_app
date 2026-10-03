import { createHash } from 'node:crypto';
import { deriveUUID, UUID_DERIVATION_REVISION } from '../../../utils/uuid.js';

export const TOPIC_IDENTITY_SCHEMA = 'atlas.topic-identity.v1' as const;
export const TOPIC_TAXONOMY_REVISION = 'atlas-topic-taxonomy-v1' as const;
export const DEFAULT_TOPIC_NAMESPACE = 'parent-atlas' as const;

export interface TopicIdentityInputV1 {
	/** Display label only; it is not the identity key when namespace/name are supplied. */
	label?: string;
	namespace?: string;
	name?: string;
	version?: string | null;
	taxonomyRevision?: string;
	sourceRef?: string | null;
	sourceRevision?: string | null;
}

export interface TopicIdentityV1 {
	schema: typeof TOPIC_IDENTITY_SCHEMA;
	topicId: string;
	topicKey: string;
	identityDerivationRevision: typeof UUID_DERIVATION_REVISION;
	namespace: string;
	name: string;
	version: string | null;
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

function normalizeKeyPart(value: string, field: string): string {
	const normalized = required(value, field)
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^a-z0-9._/-]+/g, '-')
		.replace(/-+/g, '-');
	const segments = normalized.split('/').map((segment) => segment.replace(/^-+|-+$/g, ''));
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		throw new Error(`TOPIC_IDENTITY_INPUT_INVALID:${field}`);
	}
	return segments.join('/');
}

export async function deriveTopicIdentityV1(input: TopicIdentityInputV1): Promise<TopicIdentityV1> {
	const displayLabel = required(input.label ?? input.name ?? '', 'label');
	const normalizedLabel = normalizeTopicLabel(displayLabel);
	const namespace = normalizeKeyPart(input.namespace ?? DEFAULT_TOPIC_NAMESPACE, 'namespace');
	const name = normalizeKeyPart(input.name ?? displayLabel, 'name');
	const version = input.version == null || input.version.trim() === ''
		? null
		: normalizeKeyPart(input.version, 'version');
	const taxonomyRevision = required(input.taxonomyRevision ?? TOPIC_TAXONOMY_REVISION, 'taxonomyRevision');
	const topicKey = `${namespace}/${name}${version ? `/${version}` : ''}`;
	const topicId = await deriveUUID('atlas.topic-identity.v1', { taxonomyRevision, topicKey });
	const titleDigest = createHash('sha256').update(`${taxonomyRevision}\0${topicKey}`, 'utf8').digest('hex').slice(0, 8);

	return {
		schema: TOPIC_IDENTITY_SCHEMA,
		topicId,
		topicKey,
		identityDerivationRevision: UUID_DERIVATION_REVISION,
		namespace,
		name,
		version,
		label: displayLabel,
		normalizedLabel,
		taxonomyRevision,
		sourceRef: input.sourceRef?.trim() || null,
		sourceRevision: input.sourceRevision?.trim() || null,
		titleId: `title:${name.replaceAll('/', '-')}${version ? `:${version.replaceAll('/', '-')}` : ''}:${titleDigest}`,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
