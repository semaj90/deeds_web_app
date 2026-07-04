/**
 * ACP Worker Envelope Validation
 *
 * Validates all packet handoffs against the canonical PacketTopologyEnvelope schema.
 * Every fetch from Postgres, every cache hit from Redis/Qdrant, every neighbor expansion
 * from Neo4j goes through this validator.
 *
 * Pattern: read from store → validate → use
 * Never use unvalidated packets downstream.
 */

import {
	validatePacketEnvelope,
	tryValidatePacketEnvelope,
	validatePacketBatch,
	type PacketTopologyEnvelope,
} from '$lib/server/hyperrag/packet-topology-envelope.js';

interface ValidatedHandoff {
	packets: PacketTopologyEnvelope[];
	source: 'postgres' | 'redis' | 'qdrant' | 'neo4j' | 'acp_rpc';
	validCount: number;
	invalidCount: number;
	latencyMs: number;
	errors?: string[];
}

/**
 * ACP Worker Packet Loop
 *
 * Canonical workflow:
 *
 * 1. resolve_semantic_key(envelope.title_id, envelope.feature_id)
 * 2. lookup_manifold_neighborhood(envelope.som_row, envelope.som_col)
 * 3. expand_candidate_tuples(envelope.neo4j_neighbors)
 * 4. rank_locally(envelope)
 * 5. send_bounded_packet_set(envelope.packet_key)
 */
export async function validateAcpWorkerLoop(
	envelope: unknown,
): Promise<PacketTopologyEnvelope | null> {
	return tryValidatePacketEnvelope(envelope);
}

/**
 * Validate packets from Postgres (canonical source).
 * These MUST validate — if they don't, it's a data corruption issue.
 */
export function validatePostgresPackets(
	packets: unknown[],
): ValidatedHandoff {
	const startTime = Date.now();
	const result = validatePacketBatch(packets);

	if (result.invalid.length > 0) {
		console.error(
			`[packet-envelope-validator] Postgres data validation failed: ${result.invalid.length}/${packets.length} packets`,
		);
		result.errors?.push('Postgres packets must be valid — data corruption possible');
	}

	return {
		packets: result.valid,
		source: 'postgres',
		validCount: result.valid.length,
		invalidCount: result.invalid.length,
		latencyMs: Date.now() - startTime,
		errors: result.errors,
	};
}

/**
 * Validate packets from Redis (hot cache).
 * These MAY be stale or partially corrupted — log but don't hard-fail.
 */
export function validateRedisPackets(
	packets: unknown[],
): ValidatedHandoff {
	const startTime = Date.now();
	const result = validatePacketBatch(packets);

	if (result.invalid.length > 0) {
		console.warn(
			`[packet-envelope-validator] Redis cache validation warning: ${result.invalid.length}/${packets.length} packets`,
		);
	}

	return {
		packets: result.valid,
		source: 'redis',
		validCount: result.valid.length,
		invalidCount: result.invalid.length,
		latencyMs: Date.now() - startTime,
		errors: result.errors,
	};
}

/**
 * Validate packets from Qdrant (vector mirror).
 * These MAY have missing optional fields — that's OK if core fields are present.
 */
export function validateQdrantPackets(
	packets: unknown[],
): ValidatedHandoff {
	const startTime = Date.now();
	const result = validatePacketBatch(packets);

	if (result.invalid.length > 0) {
		console.debug(
			`[packet-envelope-validator] Qdrant payload validation warning: ${result.invalid.length}/${packets.length} packets`,
		);
	}

	return {
		packets: result.valid,
		source: 'qdrant',
		validCount: result.valid.length,
		invalidCount: result.invalid.length,
		latencyMs: Date.now() - startTime,
		errors: result.errors,
	};
}

/**
 * Validate packets from Neo4j (topology mirror).
 * These MAY have minimal fields — we only care about packet_key + neighbors.
 */
export function validateNeo4jPackets(
	packets: unknown[],
): ValidatedHandoff {
	const startTime = Date.now();
	const result = validatePacketBatch(packets);

	if (result.invalid.length > 0) {
		console.debug(
			`[packet-envelope-validator] Neo4j topology validation debug: ${result.invalid.length}/${packets.length} nodes`,
		);
	}

	return {
		packets: result.valid,
		source: 'neo4j',
		validCount: result.valid.length,
		invalidCount: result.invalid.length,
		latencyMs: Date.now() - startTime,
		errors: result.errors,
	};
}

/**
 * Validate packets for ACP/gRPC transport.
 * These MUST be valid — they cross process/network boundaries.
 * Any invalid packet is a contract violation.
 */
export function validateAcpRpcPackets(
	packets: unknown[],
): ValidatedHandoff {
	const startTime = Date.now();
	const result = validatePacketBatch(packets);

	if (result.invalid.length > 0) {
		console.error(
			`[packet-envelope-validator] ACP/gRPC contract violation: ${result.invalid.length}/${packets.length} packets`,
		);
		throw new Error(
			`ACP RPC packet validation failed: ${result.invalid.length} invalid packets. Contract requires all packets to validate.`,
		);
	}

	return {
		packets: result.valid,
		source: 'acp_rpc',
		validCount: result.valid.length,
		invalidCount: result.invalid.length,
		latencyMs: Date.now() - startTime,
		errors: result.errors,
	};
}

/**
 * Validate a single packet for use in ACP worker loop.
 * Hard-fail if invalid (envelope is required for routing).
 */
export function validateEnvelopeForWorkerLoop(
	envelope: unknown,
): PacketTopologyEnvelope {
	try {
		return validatePacketEnvelope(envelope);
	} catch (err) {
		throw new Error(
			`ACP worker loop requires valid envelope. Parse failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Storage decision tree (from canonical contract):
 *
 * | Store | Role | Validation |
 * |-------|------|------------|
 * | Postgres | Canonical truth | Hard-fail if invalid |
 * | Qdrant | Vector mirror | Warn if invalid (may be stale) |
 * | Redis/Bifrost | Hot cache | Warn if invalid (rebuild from Postgres) |
 * | Neo4j | Topology mirror | Debug-log if invalid (optional fields) |
 * | ACP/gRPC | Transport boundary | Hard-fail if invalid (contract violation) |
 *
 * Workflow:
 * Postgres (canonical) → validate (hard-fail)
 *   → Qdrant (mirror) → validate (warn)
 *   → Redis (cache) → validate (warn)
 *   → Neo4j (topology) → validate (debug)
 *   → ACP RPC (transport) → validate (hard-fail)
 */
export function validateStoragePipeline(
	postgresResult: unknown[],
	qdrantResult?: unknown[],
	redisResult?: unknown[],
	neo4jResult?: unknown[],
	acpRpcPayload?: unknown[],
): {
	postgres: ValidatedHandoff;
	qdrant?: ValidatedHandoff;
	redis?: ValidatedHandoff;
	neo4j?: ValidatedHandoff;
	acp_rpc?: ValidatedHandoff;
} {
	const results: ReturnType<typeof validateStoragePipeline> = {
		postgres: validatePostgresPackets(postgresResult),
	};

	if (qdrantResult) {
		results.qdrant = validateQdrantPackets(qdrantResult);
	}

	if (redisResult) {
		results.redis = validateRedisPackets(redisResult);
	}

	if (neo4jResult) {
		results.neo4j = validateNeo4jPackets(neo4jResult);
	}

	if (acpRpcPayload) {
		results.acp_rpc = validateAcpRpcPackets(acpRpcPayload);
	}

	return results;
}
