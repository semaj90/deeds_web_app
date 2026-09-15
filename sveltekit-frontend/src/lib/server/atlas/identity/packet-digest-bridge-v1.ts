import { createHash } from 'node:crypto';
import { deriveCodeSourceRevisionV1 } from './code-source-revision-v1.js';
import type { PacketWriteRequestV1 } from './packet-write-decision-v1.js';

export const PACKET_DIGEST_BRIDGE_SCHEMA_V1 = 'atlas.packet-digest-bridge.v1' as const;
export const WORKSPACE_REVISION_ADMITTED_STATUS_V1 = 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' as const;

/**
 * Narrow evidence view of the workspace-revision admission receipt.
 *
 * The bridge deliberately does not read receipt files itself. Callers must
 * first resolve the current admission owner and pass its evidence here. This
 * keeps this module pure and prevents a second "current revision" selector.
 */
export interface AdmittedWorkspaceRevisionEvidenceV1 {
	status: typeof WORKSPACE_REVISION_ADMITTED_STATUS_V1;
	authority: true;
	workspaceRevision: string;
	snapshotRevision?: string | null;
	sourceInventoryChecksum?: string | null;
	sourceSelectionChecksum?: string | null;
	admissionReceiptChecksum?: string | null;
}

export interface PacketDigestBridgeInputV1 {
	/** Already-resolved canonical packet key. This module never derives packet identity grain. */
	packetKey: string;
	/** Already-canonical source reference. The bridge never silently rewrites path identity. */
	sourceRef: string;
	/** Exact UTF-8 source content used to derive sourceRevision/contentDigest. */
	sourceContent: string;
	/** Explicit authority evidence for the workspace frame containing these bytes. */
	admission: AdmittedWorkspaceRevisionEvidenceV1;
}

export interface PacketDigestObservationIdentityV1 {
	packetKey: string;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision: string;
	contentDigest: string;
}

export interface PacketDigestBridgeV1 extends PacketDigestObservationIdentityV1 {
	schema: typeof PACKET_DIGEST_BRIDGE_SCHEMA_V1;
	byteLength: number;
	snapshotRevision: string | null;
	sourceInventoryChecksum: string | null;
	sourceSelectionChecksum: string | null;
	admissionReceiptChecksum: string | null;
	/** Base request for decidePacketWrite(); concurrency evidence is added only after reading current state. */
	packetWriteRequest: PacketWriteRequestV1;
	/** Exact identity fields shared with FileObservationPacketV1. */
	observationIdentity: PacketDigestObservationIdentityV1;
	bridgeChecksum: string;
	canonicalAuthority: false;
	writesPerformed: false;
}

function requireNonEmpty(value: string, code: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(code);
	return trimmed;
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => [key, canonicalize(item)]));
	}
	return value;
}

function checksum(value: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(canonicalize(value)), 'utf8')
		.digest('hex');
}

function optionalEvidence(value: string | null | undefined): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed || null;
}

/**
 * Builds the source-byte -> canonical packet bridge identity without I/O.
 *
 * Ownership boundaries:
 *   - packetKey is supplied by the canonical packet identity resolver; this
 *     module must not choose file-vs-node packet grain.
 *   - workspaceRevision is supplied only through an explicit admitted receipt;
 *     this module must not infer "current" from snapshots/timestamps/MAX().
 *   - sourceRevision/contentDigest are derived from the exact source bytes via
 *     deriveCodeSourceRevisionV1().
 *   - canonical packet mutation remains owned by decidePacketWrite() and the
 *     transaction writer; this bridge never authorizes or performs writes.
 */
export function buildPacketDigestBridgeV1(input: PacketDigestBridgeInputV1): PacketDigestBridgeV1 {
	const packetKey = requireNonEmpty(input.packetKey, 'PACKET_DIGEST_BRIDGE_PACKET_KEY_REQUIRED');
	const sourceRef = requireNonEmpty(input.sourceRef, 'PACKET_DIGEST_BRIDGE_SOURCE_REF_REQUIRED');
	if (sourceRef.includes('\\')) {
		throw new Error('PACKET_DIGEST_BRIDGE_SOURCE_REF_NOT_CANONICAL');
	}
	if (input.admission.status !== WORKSPACE_REVISION_ADMITTED_STATUS_V1 || input.admission.authority !== true) {
		throw new Error('PACKET_DIGEST_BRIDGE_WORKSPACE_NOT_ADMITTED');
	}
	const workspaceRevision = requireNonEmpty(
		input.admission.workspaceRevision,
		'PACKET_DIGEST_BRIDGE_WORKSPACE_REVISION_REQUIRED',
	);

	const revision = deriveCodeSourceRevisionV1(input.sourceContent);
	const observationIdentity: PacketDigestObservationIdentityV1 = {
		packetKey,
		sourceRef,
		sourceRevision: revision.sourceRevision,
		workspaceRevision,
		contentDigest: revision.contentDigest,
	};
	const packetWriteRequest: PacketWriteRequestV1 = {
		packetKey,
		sourceRef,
		sourceRevision: revision.sourceRevision,
		workspaceRevision,
		contentDigest: revision.contentDigest,
	};
	const bridgeIdentity = {
		...observationIdentity,
		byteLength: revision.byteLength,
		snapshotRevision: optionalEvidence(input.admission.snapshotRevision),
		sourceInventoryChecksum: optionalEvidence(input.admission.sourceInventoryChecksum),
		sourceSelectionChecksum: optionalEvidence(input.admission.sourceSelectionChecksum),
		admissionReceiptChecksum: optionalEvidence(input.admission.admissionReceiptChecksum),
	};

	return {
		schema: PACKET_DIGEST_BRIDGE_SCHEMA_V1,
		...bridgeIdentity,
		packetWriteRequest,
		observationIdentity,
		bridgeChecksum: checksum({ schema: PACKET_DIGEST_BRIDGE_SCHEMA_V1, ...bridgeIdentity }),
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
