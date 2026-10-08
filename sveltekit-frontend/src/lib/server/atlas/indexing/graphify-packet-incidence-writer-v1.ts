import { pool } from '$lib/server/db/client.js';
import { verifyPacketIncidenceLineagesAgainstPostgresV1 } from '../lineage/packet-incidence-postgres-readback-v1.js';
import {
	PacketIncidenceLineageV1Schema,
	type PacketIncidenceLineageV1,
} from '../lineage/packet-incidence-lineage-v1.js';
import type { KagTraversalSnapshotV1 } from '../integration/kag-hypergraph-reader-v1.js';

export const MIN_PACKET_INCIDENCE_CANARY_ROWS_V1 = 20;
export const MAX_PACKET_INCIDENCE_CANARY_ROWS_V1 = 100;

export interface GraphifyPacketIncidenceCanaryResultV1 {
	status: 'READY_FOR_CANARY' | 'READBACK_PROVEN';
	lineageChecksums: string[];
	insertedCount: number;
	readbackCount: number;
	writesPerformed: boolean;
	authorizationRef: string | null;
	canonicalAuthority: false;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export async function persistGraphifyPacketIncidenceCanaryV1(
	values: readonly unknown[],
	snapshot: KagTraversalSnapshotV1,
	options: { apply?: boolean; authorizationRef?: string } = {},
): Promise<GraphifyPacketIncidenceCanaryResultV1> {
	if (!snapshot.workspaceRevision.trim() || !snapshot.graphRevision.trim()) {
		throw new Error('PACKET_INCIDENCE_SNAPSHOT_REQUIRED');
	}
	if (values.length < MIN_PACKET_INCIDENCE_CANARY_ROWS_V1 || values.length > MAX_PACKET_INCIDENCE_CANARY_ROWS_V1) {
		throw new Error('PACKET_INCIDENCE_CANARY_SIZE_OUT_OF_RANGE');
	}
	const lineages = values.map((value) => PacketIncidenceLineageV1Schema.parse(value));
	if (new Set(lineages.map((lineage) => lineage.lineageChecksum)).size !== lineages.length) {
		throw new Error('PACKET_INCIDENCE_CANARY_DUPLICATE_LINEAGE');
	}
	if (lineages.some((lineage) => lineage.workspaceRevision !== snapshot.workspaceRevision || lineage.graphRevision !== snapshot.graphRevision)) {
		throw new Error('PACKET_INCIDENCE_CANARY_SNAPSHOT_MISMATCH');
	}
	if (lineages.some((lineage) => lineage.producerId !== 'graphify-packet-incidence-projection-v1')) {
		throw new Error('PACKET_INCIDENCE_CANARY_PRODUCER_INVALID');
	}
	await verifyPacketIncidenceLineagesAgainstPostgresV1(lineages, snapshot);
	const authorizationRef = options.authorizationRef?.trim() || null;
	if (options.apply !== true) {
		return {
			status: 'READY_FOR_CANARY', lineageChecksums: lineages.map((lineage) => lineage.lineageChecksum).sort(),
			insertedCount: 0, readbackCount: 0, writesPerformed: false, authorizationRef: null, canonicalAuthority: false,
		};
	}
	if (!authorizationRef) throw new Error('PACKET_INCIDENCE_CANARY_AUTHORIZATION_REQUIRED');

	const client = await pool.connect();
	let insertedCount = 0;
	try {
		await client.query('BEGIN');
		for (const lineage of lineages) {
			const result = await client.query(
				`INSERT INTO atlas_packet_incidence
				  (lineage_checksum, input_checksum, packet_key, canonical_id, source_revision,
				   neighbor_packet_key, neighbor_canonical_id, neighbor_source_revision, edge_type,
				   workspace_revision, graph_revision, producer_id, producer_revision, evidence_refs, lineage)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
				 ON CONFLICT (lineage_checksum) DO NOTHING`,
				[
					lineage.lineageChecksum, lineage.inputChecksum, lineage.packetKey, lineage.canonicalId, lineage.sourceRevision,
					lineage.neighborPacketKey, lineage.neighborCanonicalId, lineage.neighborSourceRevision, lineage.edgeType,
					lineage.workspaceRevision, lineage.graphRevision, lineage.producerId, lineage.producerRevision,
					lineage.evidenceRefs, JSON.stringify(lineage),
				],
			);
			insertedCount += result.rowCount ?? 0;
		}
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}

	try {
		const checksums = lineages.map((lineage) => lineage.lineageChecksum);
		const readback = await pool.query<{ lineage_checksum: string; lineage: unknown }>(
			'SELECT lineage_checksum, lineage FROM atlas_packet_incidence WHERE lineage_checksum = ANY($1::text[]) ORDER BY lineage_checksum',
			[checksums],
		);
		if (readback.rows.length !== lineages.length) throw new Error('PACKET_INCIDENCE_READBACK_COUNT_MISMATCH');
		const byChecksum = new Map(readback.rows.map((row) => [row.lineage_checksum, row.lineage]));
		for (const lineage of lineages) {
			const value = byChecksum.get(lineage.lineageChecksum);
			const parsed = PacketIncidenceLineageV1Schema.parse(typeof value === 'string' ? JSON.parse(value) : value);
			if (stableJson(parsed) !== stableJson(lineage)) throw new Error(`PACKET_INCIDENCE_READBACK_MISMATCH:${lineage.lineageChecksum}`);
		}
		await verifyPacketIncidenceLineagesAgainstPostgresV1(lineages, snapshot);
		return {
			status: 'READBACK_PROVEN', lineageChecksums: checksums.sort(), insertedCount,
			readbackCount: readback.rows.length, writesPerformed: insertedCount > 0, authorizationRef, canonicalAuthority: false,
		};
	} catch (error) {
		throw new Error(`PACKET_INCIDENCE_READBACK_FAILED_AFTER_COMMIT:${(error as Error).message}`);
	}
}
