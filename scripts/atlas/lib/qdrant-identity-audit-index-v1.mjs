export function addPacketKeyRowV1(index, row) {
	const existing = index.get(row.packet_key);
	index.set(row.packet_key, existing
		? { row: existing.row, count: existing.count + 1 }
		: { row, count: 1 });
}

export function lookupPacketKeyV1(index, packetKey) {
	const entry = index.get(packetKey);
	if (!entry) return { kind: 'missing' };
	if (entry.count !== 1) return { kind: 'ambiguous', count: entry.count };
	return { kind: 'unique', row: entry.row };
}

export function addPointIdRowV1(index, pointId, row) {
	const existing = index.get(pointId);
	index.set(pointId, existing
		? { row: existing.row, count: existing.count + 1, matched: existing.matched }
		: { row, count: 1, matched: false });
}

export function summarizePointIdCoverageV1(index) {
	let uniqueIds = 0;
	let duplicateIds = 0;
	let matchedIds = 0;
	for (const entry of index.values()) {
		if (entry.count === 1) {
			uniqueIds++;
			if (entry.matched) matchedIds++;
		} else {
			duplicateIds++;
		}
	}
	return { distinctIds: index.size, uniqueIds, duplicateIds, matchedIds, missingIds: uniqueIds - matchedIds };
}

export function markPointIdObservedV1(index, pointId) {
	const entry = index.get(pointId);
	if (entry?.count === 1) entry.matched = true;
}

export function hasUniquePointIdOwnerV1(pointId, ...indexes) {
	if (typeof pointId !== 'string') return false;
	return indexes.some((index) => index.get(pointId)?.count === 1);
}

export const QDRANT_PROJECTION_LINEAGE_FIELDS_V1 = Object.freeze([
	'canonical_id', 'packet_key', 'source_ref', 'chunk_id', 'content_hash',
	'source_revision', 'workspace_revision', 'embedding_model', 'embedding_version',
	'model_artifact_revision', 'representation_id', 'representation_revision', 'embedding_dimension',
]);

export function auditPointPayloadLineageV1(payload, fields = QDRANT_PROJECTION_LINEAGE_FIELDS_V1) {
	const missing = fields.filter((field) => {
		const value = payload?.[field];
		return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
	});
	return { complete: missing.length === 0, missing };
}

export function shouldIncludeAuditLedgerEntryV1({ onlyUnownedPointId = false, uniquePointIdOwner }) {
	return !onlyUnownedPointId || uniquePointIdOwner === false;
}

export function incrementPayloadCohortV1(cohorts, field, payload, maxValues = 100) {
	const value = payload?.[field];
	if (value === null || value === undefined || String(value).trim() === '') return;
	const key = String(value);
	const counts = cohorts[field] ??= new Map();
	if (!counts.has(key) && counts.size >= maxValues) {
		counts.set('__other_values__', (counts.get('__other_values__') ?? 0) + 1);
		return;
	}
	counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function classifyExactPointIdV1(pointId, atlasById, chunksById, chunksByPrimaryId = new Map()) {
	if (typeof pointId !== 'string') return null;
	const atlasEntry = atlasById.get(pointId);
	const chunkEntry = chunksById.get(pointId);
	const primaryEntry = chunksByPrimaryId.get(pointId);
	if (atlasEntry?.count > 1 || chunkEntry?.count > 1 || primaryEntry?.count > 1) {
		return { lane: 'AMBIGUOUS_POINT_ID', confidence: 0.3, match_type: 'duplicate_postgres_point_id', evidence: { qdrant_point_id: pointId } };
	}
	const atlasMatch = atlasEntry?.row ?? atlasEntry;
	const chunkMatch = chunkEntry?.row ?? chunkEntry;
	const primaryMatch = primaryEntry?.row ?? primaryEntry;
	if (atlasEntry) atlasEntry.matched = true;
	if (chunkEntry) chunkEntry.matched = true;
	if (primaryEntry) primaryEntry.matched = true;
	if (atlasMatch && chunkMatch) {
		return {
			lane: 'EXACT_BOTH_TABLES',
			confidence: 0.98,
			match_type: 'both_qdrant_id',
			evidence: { qdrant_point_id: pointId, in_atlas_packets: true, in_codebase_chunk_index: true },
		};
	}
	if (atlasMatch) {
		return {
			lane: 'EXACT_ATLAS_QDRANT_ID',
			confidence: 0.95,
			match_type: 'qdrant_id_backlink',
			evidence: { qdrant_point_id: pointId, postgres_table: 'atlas_packets', postgres_row: atlasMatch.packet_key },
		};
	}
	if (chunkMatch) {
		return {
			lane: 'EXACT_CHUNK_QDRANT_ID',
			confidence: 0.90,
			match_type: 'chunk_qdrant_id_backlink',
			evidence: { qdrant_point_id: pointId, postgres_table: 'codebase_chunk_index', postgres_row: chunkMatch.chunk_id },
		};
	}
	if (primaryMatch) {
		return {
			lane: 'EXACT_CHUNK_PRIMARY_ID',
			confidence: 0.9,
			match_type: 'postgres_primary_id_projection_match',
			evidence: { qdrant_point_id: pointId, postgres_table: 'codebase_chunk_index', postgres_row_id: primaryMatch.id },
		};
	}
	return null;
}

export function resolveQdrantScanLimitV1(pointsCount, auditLimit) {
	if (!Number.isSafeInteger(pointsCount) || pointsCount < 0) {
		throw new Error('QDRANT_POINTS_COUNT_REQUIRED');
	}
	if (auditLimit !== null && (!Number.isSafeInteger(auditLimit) || auditLimit <= 0)) {
		throw new Error('QDRANT_AUDIT_LIMIT_INVALID');
	}
	const safetyCeiling = pointsCount + Math.ceil(pointsCount / 10);
	return auditLimit === null ? safetyCeiling : Math.min(auditLimit, safetyCeiling);
}

export function resolveQdrantPageLimitV1(auditLimit, scannedPoints, pageSize = 100) {
	if (!Number.isSafeInteger(scannedPoints) || scannedPoints < 0) {
		throw new Error('QDRANT_SCANNED_COUNT_INVALID');
	}
	if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
		throw new Error('QDRANT_PAGE_SIZE_INVALID');
	}
	if (auditLimit === null) return pageSize;
	if (!Number.isSafeInteger(auditLimit) || auditLimit <= 0) {
		throw new Error('QDRANT_AUDIT_LIMIT_INVALID');
	}
	return Math.min(pageSize, Math.max(0, auditLimit - scannedPoints));
}

export function resolveQdrantAuditCollectionV1(value = 'codebase_chunks_768') {
	const allowed = new Set(['codebase_chunks_768', 'codebase_chunks_768_v2']);
	if (typeof value !== 'string' || !allowed.has(value)) {
		throw new Error('QDRANT_AUDIT_COLLECTION_UNSUPPORTED');
	}
	return value;
}
