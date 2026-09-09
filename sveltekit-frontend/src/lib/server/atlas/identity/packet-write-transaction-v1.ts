/**
 * PACKET_WRITE_TRANSACTION_CONTRACT_01
 *
 * Wraps decidePacketWrite() (packet-write-decision-v1.ts) in the operator's
 * frozen transaction shape:
 *
 *   BEGIN
 *     validate existing canonical row      (read, same transaction)
 *     guarded atlas_packets mutation       (WHERE-guarded, optimistic concurrency)
 *     INSERT ProjectionChangeV1            (atlas_projection_outbox, mutations only)
 *     INSERT ExecutionReceiptV1            (atlas_packet_write_receipts, every decision)
 *   COMMIT
 *
 * The canonical Postgres transaction is strictly separated from Qdrant/
 * Neo4j/Valkey/cuVS projection work -- this module never touches any of
 * those. A separate, later projector consumes atlas_projection_outbox rows
 * asynchronously, after commit. That boundary is absolute and this module
 * enforces it by construction (it has no Qdrant/Neo4j/Redis client at all).
 *
 * Handles INSERT_NEW (minimal identity-bearing INSERT, narrower than
 * semantic-packet-writer.ts's real INSERT -- no embedding/topology/vectors
 * columns yet) and ADVANCE_SOURCE_REVISION (guarded UPDATE). Extracting the
 * full canonical INSERT column set into one shared repository so
 * semantic-packet-writer.ts routes through this same path is separate,
 * larger work (CanonicalPacketRepository), not done in this pass.
 *
 * SCAFFOLDING ONLY. Not called from semantic-packet-writer.ts or any other
 * writer. Exercised directly by scripts/atlas/prove-packet-write-transaction-v1.mts
 * against real Postgres, using disposable packet_key values under the
 * `packet:test:transaction-contract:` prefix -- never a real production
 * packet_key, and every test row is deleted in its own cleanup.
 */
import { createHash, randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import type { PoolClient } from 'pg';
import {
	decidePacketWrite,
	type CanonicalPacketStateV1,
	type PacketWriteDecisionV1,
	type PacketWriteRequestV1,
} from './packet-write-decision-v1.js';
import { PACKET_AGGREGATE_NAMESPACE_V1 } from './atlas-uuid-namespaces-v1.js';

export interface PacketWriteTransactionResultV1 {
	decision: PacketWriteDecisionV1;
	mutationApplied: boolean;
	outboxEventId: string | null;
	receiptId: string;
}

/**
 * OUTBOX-IDENTITY-CONTRACT-01 / UUIDV5-IDENTITY-CONTRACT-01 (2026-09-09,
 * third and final revision after two review rounds):
 *   Round 1: a SHA-256-with-version-bits-forced UUID -- rejected: not a
 *     real UUIDv5, just something shaped like one.
 *   Round 2: aggregate_id set equal to event_id (honestly redundant) with
 *     a new plain-text aggregate_key carrying the real identity -- correct
 *     in spirit (never hide identity inside a hash), but the operator then
 *     asked for a REAL UUIDv5 deterministic projection after all, this
 *     time using the standard algorithm (RFC 4122, via the `uuid` npm
 *     package's v5(), matching PostgreSQL's own uuid-ossp
 *     uuid_generate_v5() -- proven byte-identical between the two in
 *     scripts/atlas/prove-uuidv5-parity-v1.mjs).
 *   Round 3 (final): `aggregate_id` = real UUIDv5(PACKET_AGGREGATE_NAMESPACE_V1,
 *     packetKey) -- deterministic, standards-compliant, verifiable via
 *     Postgres's own uuid_extract_version() = 5. `aggregate_key` (plain
 *     text = packet_key) is KEPT alongside it, not removed -- it remains
 *     the unambiguous, hash-free ground truth queryable directly, while
 *     aggregate_id is a verifiably-standard UUID projection of the same
 *     packet_key, never an independent identity.
 */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, item) => {
		if (item && typeof item === 'object' && !Array.isArray(item)) {
			return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
		}
		return item;
	});
}

async function readCanonicalPacketState(
	client: PoolClient,
	packetKey: string,
): Promise<CanonicalPacketStateV1> {
	const result = await client.query(
		`SELECT source_ref, source_revision, workspace_revision, embedding_digest
		 FROM atlas_packets WHERE packet_key = $1 LIMIT 1`,
		[packetKey],
	);
	if (result.rows.length === 0) {
		return {
			exists: false,
			packetKey,
			sourceRef: null,
			sourceRevision: null,
			workspaceRevision: null,
			contentDigest: null,
		};
	}
	const row = result.rows[0];
	return {
		exists: true,
		packetKey,
		sourceRef: row.source_ref,
		sourceRevision: row.source_revision,
		workspaceRevision: row.workspace_revision !== null ? String(row.workspace_revision) : null,
		contentDigest: row.embedding_digest,
	};
}

/**
 * Executes one packet write inside a single Postgres transaction on the
 * given client. The caller owns BEGIN/COMMIT/ROLLBACK around this call (so
 * tests can wrap it in a transaction they roll back) -- this function itself
 * only issues the guarded mutation + the two outbox/receipt inserts.
 *
 * This does NOT create the atlas_packets row for INSERT_NEW -- that remains
 * the concern of whichever writer owns the actual identity-creating INSERT
 * (semantic-packet-writer.ts). This function's guarded mutation only covers
 * ADVANCE_SOURCE_REVISION (an UPDATE with an optimistic-concurrency WHERE
 * guard). This keeps the scaffold's blast radius small: it can prove the
 * outbox/receipt mechanics end-to-end without needing to also own or
 * duplicate the identity-creation INSERT logic that already exists and is
 * proven live elsewhere.
 */
export async function executePacketWriteTransaction(
	client: PoolClient,
	request: PacketWriteRequestV1,
): Promise<PacketWriteTransactionResultV1> {
	const current = await readCanonicalPacketState(client, request.packetKey);
	const decision = decidePacketWrite(current, request);

	let mutationApplied = false;
	if (decision.decision === 'ADVANCE_SOURCE_REVISION') {
		const updateResult = await client.query(
			`UPDATE atlas_packets
			 SET source_revision = $1, updated_at = now()
			 WHERE packet_key = $2
			   AND source_revision IS NOT DISTINCT FROM $3
			 RETURNING packet_key`,
			[request.sourceRevision, request.packetKey, request.expectedCurrentSourceRevision ?? null],
		);
		mutationApplied = updateResult.rows.length === 1;
		if (!mutationApplied) {
			// Someone else's write landed between our read and our guarded
			// UPDATE -- fail closed rather than silently no-op.
			throw new Error(
				`PACKET_WRITE_TRANSACTION_RACE: guarded UPDATE affected 0 rows for packetKey=${request.packetKey}; expectedCurrentSourceRevision no longer matches live state.`,
			);
		}
	} else if (decision.decision === 'INSERT_NEW') {
		// Minimal identity-bearing INSERT. This is deliberately narrower than
		// semantic-packet-writer.ts's real INSERT (no embedding/topology/vectors/
		// representation columns) -- extracting that full column set into a
		// single shared canonical-write path is separate, larger work
		// (CanonicalPacketRepository), not done in this pass. This proves the
		// transaction/outbox/receipt mechanics for INSERT_NEW; it does not yet
		// replace semantic-packet-writer.ts's own INSERT.
		const insertResult = await client.query(
			`INSERT INTO atlas_packets (packet_key, packet_id, source_ref, source_revision, workspace_revision)
			 VALUES ($1, $1, $2, $3, 0)
			 ON CONFLICT (packet_key) DO NOTHING
			 RETURNING packet_key`,
			[request.packetKey, request.sourceRef, request.sourceRevision],
		);
		mutationApplied = insertResult.rows.length === 1;
		if (!mutationApplied) {
			throw new Error(
				`PACKET_WRITE_TRANSACTION_RACE: INSERT_NEW found packetKey=${request.packetKey} already exists; a concurrent writer created it between our read and this INSERT.`,
			);
		}
	}
	// IDEMPOTENT_REPLAY / *_CONFLICT / REVISION_UNPROVEN mutate nothing.

	let outboxEventId: string | null = null;
	if (mutationApplied) {
		outboxEventId = randomUUID();
		// OUTBOX-IDENTITY-CONTRACT-01 (2026-09-09 review): resolved to option A
		// (aggregate_id = event identity, honestly redundant with event_id for
		// this single-packet-per-event scaffold) rather than continuing to hash
		// packet_key into a UUID shape. atlas_packets has no real UUID identity
		// column, so aggregate_key (plain text = packet_key) is the unambiguous,
		// hash-free ground truth, kept alongside aggregate_id. aggregate_id is a
		// REAL, standards-compliant UUIDv5 projection of packet_key (RFC 4122,
		// verifiable via Postgres uuid_extract_version() = 5) -- never an
		// independent identity, always reproducible from packet_key alone.
		const projectionBase = {
			aggregateType: 'atlas_packets',
			aggregateId: uuidv5(request.packetKey, PACKET_AGGREGATE_NAMESPACE_V1),
			aggregateKey: request.packetKey,
			workspaceRevision: request.workspaceRevision ?? 'unknown',
			sourceRevision: request.sourceRevision ?? 'unknown',
			graphRevision: 'unknown',
			representationRevision: 'unknown',
			featureRevision: 'unknown',
			changedPacketKeys: [request.packetKey],
			projections: ['SEMANTIC'],
		};
		const stageReceiptChecksum = createHash('sha256').update(canonicalJson(projectionBase)).digest('hex');
		const eventChecksum = createHash('sha256')
			.update(canonicalJson({ ...projectionBase, eventId: outboxEventId, stageReceiptChecksum }))
			.digest('hex');
		await client.query(
			`INSERT INTO atlas_projection_outbox (
				event_id, aggregate_type, aggregate_id, aggregate_key, workspace_revision, source_revision,
				graph_revision, representation_revision, feature_revision,
				stage_receipt_checksum, changed_packet_keys, candidate_ordinals, projections, event_checksum
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			[
				outboxEventId,
				projectionBase.aggregateType,
				projectionBase.aggregateId,
				projectionBase.aggregateKey,
				projectionBase.workspaceRevision,
				projectionBase.sourceRevision,
				projectionBase.graphRevision,
				projectionBase.representationRevision,
				projectionBase.featureRevision,
				stageReceiptChecksum,
				projectionBase.changedPacketKeys,
				[],
				projectionBase.projections,
				eventChecksum,
			],
		);
	}

	const receiptId = randomUUID();
	const receiptChecksum = createHash('sha256')
		.update(canonicalJson({ receiptId, decision: decision.decision, packetKey: request.packetKey, mutationApplied }))
		.digest('hex');
	await client.query(
		`INSERT INTO atlas_packet_write_receipts (
			receipt_id, packet_key, decision, reason, current_source_revision,
			requested_source_revision, mutation_applied, outbox_event_id, receipt_checksum
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[
			receiptId,
			request.packetKey,
			decision.decision,
			decision.reason,
			decision.currentSourceRevision,
			decision.requestedSourceRevision,
			mutationApplied,
			outboxEventId,
			receiptChecksum,
		],
	);

	return { decision, mutationApplied, outboxEventId, receiptId };
}
