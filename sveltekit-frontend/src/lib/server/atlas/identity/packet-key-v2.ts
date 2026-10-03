/**
 * PacketKeyV2 — the single canonical logical packet key (code-only; nothing here reads or writes a datastore).
 *
 *   same repository + same canonical source + same packet role  => same packet_key
 *   different repository + same source_ref                      => different packet_key
 *
 * Inputs are exactly { repositoryScope, sourceRef, packetKind }. source_revision, workspace_revision, Qdrant IDs,
 * GraphNodeKey, ordinals and "latest"/"current" are NOT inputs: revision qualifies the key, it never changes it.
 *
 *   canonicalName = "packet:v2" NUL repositoryScope NUL canonicalSourceRef NUL packetKind
 *   packet_key    = "packet:" + UUIDv5(PACKET_AGGREGATE_NAMESPACE_V1, canonicalName)
 *
 * The `packet:` text prefix is the existing packet-key surface (packet-key validators accept it); the UUID body keeps
 * it distinguishable from legacy `packet:<12hex>`. Legacy keys are COMPATIBILITY ALIASES that resolve to this key —
 * never a second canonical scheme; they live in packet-key-legacy-alias-v1.ts so this owner cannot emit one.
 *
 * source_ref canonicalization is owned UPSTREAM (workspace-source-binding-v1.ts / membership store the value verbatim).
 * This module never transforms it: a non-canonical spelling is rejected, so one file cannot yield two keys.
 *
 * repositoryScope MUST come from graphify_execution_file_membership_v2.repository_id (revision-qualified membership),
 * not atlas_packets.repository_id (a per-row UUID) or atlas_packets.workspace_id (directory names).
 */
import { v5 as uuidv5 } from 'uuid';
import { PACKET_AGGREGATE_NAMESPACE_V1 } from './atlas-uuid-namespaces-v1';
import { workspaceSourceRefV1Schema } from './workspace-source-binding-v1';

/** Only the file packet is defined by this contract. A SYMBOL/NODE packet needs its own kind + identity contract. */
export const PACKET_KIND_V2 = ['SOURCE_FILE'] as const;
export type PacketKindV2 = (typeof PACKET_KIND_V2)[number];

export interface PacketKeyV2Input {
	repositoryScope: string;
	sourceRef: string;
	packetKind: PacketKindV2;
}

export class PacketKeyV2InputError extends Error {
	constructor(public readonly code: string, detail: string) {
		super(`PACKET_KEY_V2_INPUT_INVALID:${code}: ${detail}`);
		this.name = 'PacketKeyV2InputError';
	}
}

const FORBIDDEN_INPUT_FIELDS = [
	'sourceRevision', 'source_revision', 'workspaceRevision', 'workspace_revision',
	'qdrantPointId', 'qdrant_point_id', 'graphNodeKey', 'graph_node_key', 'ordinal', 'candidateOrdinal',
	'latest', 'current',
];
const NUL = '\u0000';
export const PACKET_KEY_V2_PATTERN = /^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Fail-closed check, NOT a transformation. The value must already satisfy the upstream source_ref contract and be
 * POSIX-canonical as stored (case is significant and preserved). Returns the input verbatim.
 */
export function assertCanonicalSourceRefV2(sourceRef: string): string {
	if (typeof sourceRef !== 'string' || sourceRef.trim() === '') throw new PacketKeyV2InputError('SOURCE_REF_EMPTY', 'sourceRef is required');
	if (sourceRef.includes(NUL)) throw new PacketKeyV2InputError('SOURCE_REF_NUL', 'sourceRef must not contain NUL');
	if (!workspaceSourceRefV1Schema.safeParse(sourceRef).success) throw new PacketKeyV2InputError('SOURCE_REF_VIOLATES_UPSTREAM_CONTRACT', sourceRef);
	if (sourceRef !== sourceRef.trim() || sourceRef.includes('\\') || sourceRef.startsWith('./') || sourceRef.split('/').some((segment) => segment === '' || segment === '.')) {
		throw new PacketKeyV2InputError('SOURCE_REF_NOT_ALREADY_CANONICAL', sourceRef);
	}
	return sourceRef;
}

export function canonicalNameV2(input: PacketKeyV2Input): string {
	const extras = Object.keys(input as unknown as Record<string, unknown>).filter((key) => !['repositoryScope', 'sourceRef', 'packetKind'].includes(key));
	const forbidden = extras.filter((key) => FORBIDDEN_INPUT_FIELDS.includes(key));
	if (forbidden.length) throw new PacketKeyV2InputError('FORBIDDEN_INPUT', `${forbidden.join(', ')} must not influence packet_key`);
	if (extras.length) throw new PacketKeyV2InputError('UNKNOWN_INPUT', extras.join(', '));
	const repositoryScope = input.repositoryScope;
	if (typeof repositoryScope !== 'string' || !/^repo:[^\u0000]+$/.test(repositoryScope)) {
		throw new PacketKeyV2InputError('REPOSITORY_SCOPE_INVALID', 'repositoryScope must be a membership repository_id such as "repo:root"');
	}
	if (!(PACKET_KIND_V2 as readonly string[]).includes(input.packetKind)) {
		throw new PacketKeyV2InputError('PACKET_KIND_UNSUPPORTED', String(input.packetKind));
	}
	return ['packet:v2', repositoryScope, assertCanonicalSourceRefV2(input.sourceRef), input.packetKind].join(NUL);
}

export function computePacketKeyV2(input: PacketKeyV2Input): string {
	return `packet:${uuidv5(canonicalNameV2(input), PACKET_AGGREGATE_NAMESPACE_V1)}`;
}

/** Revision qualifies a packet; it is never part of its key. */
export interface RevisionQualifiedPacketIdentityV2 {
	packetKey: string;
	sourceRevision: string;
}

export function qualifyPacketKeyV2(packetKey: string, sourceRevision: string): RevisionQualifiedPacketIdentityV2 {
	if (!PACKET_KEY_V2_PATTERN.test(packetKey)) throw new PacketKeyV2InputError('PACKET_KEY_NOT_V2', packetKey);
	if (!/^sha256:[0-9a-f]{64}$/.test(sourceRevision)) throw new PacketKeyV2InputError('SOURCE_REVISION_INVALID', sourceRevision);
	return { packetKey, sourceRevision };
}
