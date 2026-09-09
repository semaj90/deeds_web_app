/**
 * PACKET_WRITE_CONFLICT_SEMANTICS_01
 *
 * Pure decision layer for canonical atlas_packets mutations. The operator's
 * explicit rule this contract exists to enforce: "Do not let ON CONFLICT
 * itself decide which semantic operation occurred." A write path must call
 * decidePacketWrite() with the current canonical row state (read first,
 * inside the same transaction that will apply the write) and the incoming
 * request, then execute SQL that matches the returned decision -- never the
 * reverse (execute UPSERT, then try to infer what happened from rowcount).
 *
 * This module does no I/O. It has no database client, no fetch, no fs
 * access. Every field it needs must be supplied by the caller, who is
 * responsible for reading current canonical state first.
 *
 * Checked against, and does not duplicate:
 *   - code-source-revision-v1.ts (derives a sourceRevision from bytes --
 *     reused by callers of this module, not reimplemented here)
 *   - revision-authority-envelope-v1.ts (workspace-level authority sealing
 *     across many sources -- a different concern, one layer up)
 *   - packet-key-builder.ts / packet-identity-resolver.ts (packetKey
 *     derivation and alias resolution -- assumed already resolved by the
 *     time a request reaches this module; packetKey here is always final)
 */

export type PacketWriteDecisionKind =
	| 'INSERT_NEW'
	| 'IDEMPOTENT_REPLAY'
	| 'ADVANCE_SOURCE_REVISION'
	| 'SOURCE_REVISION_CONFLICT'
	| 'WORKSPACE_REVISION_CONFLICT'
	| 'CONTENT_CONFLICT'
	| 'IDENTITY_CONFLICT'
	| 'REVISION_UNPROVEN';

/** Current canonical row state, read fresh (same transaction) before deciding. */
export interface CanonicalPacketStateV1 {
	exists: boolean;
	packetKey: string;
	sourceRef: string | null;
	sourceRevision: string | null;
	workspaceRevision: string | null;
	/** Whatever the writer treats as content identity (e.g. embeddingDigest). Optional -- many writers don't have one yet. */
	contentDigest: string | null;
}

/** An incoming write request, fully resolved (packetKey/sourceRef already final, no aliasing left to do). */
export interface PacketWriteRequestV1 {
	packetKey: string;
	sourceRef: string;
	/** Null when the caller has no real revision evidence -- never fabricate a value to fill this. */
	sourceRevision: string | null;
	workspaceRevision: string | null;
	contentDigest: string | null;
	/**
	 * Optimistic-concurrency proof: the sourceRevision the caller believes is
	 * CURRENTLY stored, established by reading canonical state before
	 * proposing a new sourceRevision. Required to distinguish a legitimate
	 * forward advance from an unproven guess. `undefined` means the caller
	 * did not perform that read (or the packet is new); `null` explicitly
	 * means the caller read current state and found no sourceRevision there.
	 */
	expectedCurrentSourceRevision?: string | null;
}

export interface PacketWriteDecisionV1 {
	decision: PacketWriteDecisionKind;
	packetKey: string;
	reason: string;
	currentSourceRevision: string | null;
	requestedSourceRevision: string | null;
}

/**
 * Decides which semantic operation an incoming packet write represents.
 * Deterministic, total (always returns exactly one decision), and pure.
 *
 * Precedence, matching the operator's own ordering (identity checked before
 * revision, revision checked before content, content checked before
 * workspace -- each guard only evaluated once the ones before it pass):
 *   1. Row doesn't exist yet -> INSERT_NEW
 *   2. Row exists, sourceRef differs -> IDENTITY_CONFLICT (hard identity violation, never resolved automatically)
 *   3. Request has no sourceRevision -> REVISION_UNPROVEN (can't qualify the write at all)
 *   4. sourceRevision matches current exactly:
 *        a. contentDigest also matches (or either side lacks one to compare) -> check workspaceRevision
 *             - workspaceRevision differs -> WORKSPACE_REVISION_CONFLICT
 *             - otherwise -> IDEMPOTENT_REPLAY
 *        b. contentDigest differs -> CONTENT_CONFLICT (same claimed revision, different actual content)
 *   5. sourceRevision differs from current:
 *        a. no expectedCurrentSourceRevision supplied -> REVISION_UNPROVEN (didn't prove it read current state first)
 *        b. expectedCurrentSourceRevision doesn't match actual current -> SOURCE_REVISION_CONFLICT (stale read)
 *        c. expectedCurrentSourceRevision matches actual current -> ADVANCE_SOURCE_REVISION (legitimate forward move)
 */
export function decidePacketWrite(
	current: CanonicalPacketStateV1,
	request: PacketWriteRequestV1,
): PacketWriteDecisionV1 {
	const base = {
		packetKey: request.packetKey,
		currentSourceRevision: current.exists ? current.sourceRevision : null,
		requestedSourceRevision: request.sourceRevision,
	};

	if (!current.exists) {
		return {
			...base,
			decision: 'INSERT_NEW',
			reason: 'No existing canonical row for this packetKey.',
		};
	}

	if (current.sourceRef !== null && request.sourceRef !== current.sourceRef) {
		return {
			...base,
			decision: 'IDENTITY_CONFLICT',
			reason: `Existing sourceRef "${current.sourceRef}" does not match requested sourceRef "${request.sourceRef}" for the same packetKey.`,
		};
	}

	if (request.sourceRevision === null || request.sourceRevision === undefined) {
		return {
			...base,
			decision: 'REVISION_UNPROVEN',
			reason: 'Request supplied no sourceRevision; cannot qualify this write against current canonical state.',
		};
	}

	if (current.sourceRevision !== null && current.sourceRevision === request.sourceRevision) {
		if (current.contentDigest !== null && request.contentDigest !== null && current.contentDigest !== request.contentDigest) {
			return {
				...base,
				decision: 'CONTENT_CONFLICT',
				reason: 'sourceRevision matches current, but contentDigest differs -- the same claimed revision produced different content.',
			};
		}
		if (request.workspaceRevision !== null && current.workspaceRevision !== null && request.workspaceRevision !== current.workspaceRevision) {
			return {
				...base,
				decision: 'WORKSPACE_REVISION_CONFLICT',
				reason: `sourceRevision and content agree, but requested workspaceRevision "${request.workspaceRevision}" differs from current canonical workspaceRevision "${current.workspaceRevision}".`,
			};
		}
		return {
			...base,
			decision: 'IDEMPOTENT_REPLAY',
			reason: 'sourceRevision, content, and workspaceRevision all match current canonical state; no-op.',
		};
	}

	if (request.expectedCurrentSourceRevision === undefined) {
		return {
			...base,
			decision: 'REVISION_UNPROVEN',
			reason: 'Requested sourceRevision differs from current, but the request did not supply expectedCurrentSourceRevision to prove it read current state first.',
		};
	}

	if (request.expectedCurrentSourceRevision !== current.sourceRevision) {
		return {
			...base,
			decision: 'SOURCE_REVISION_CONFLICT',
			reason: `Request's expectedCurrentSourceRevision "${String(request.expectedCurrentSourceRevision)}" does not match actual current sourceRevision "${String(current.sourceRevision)}" -- stale read, a concurrent write likely occurred.`,
		};
	}

	return {
		...base,
		decision: 'ADVANCE_SOURCE_REVISION',
		reason: 'expectedCurrentSourceRevision matches actual current state; this write legitimately advances sourceRevision.',
	};
}
