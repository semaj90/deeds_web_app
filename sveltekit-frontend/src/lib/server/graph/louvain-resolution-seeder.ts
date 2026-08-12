import { classifyGraphPacketPath, lookupPacketKey, resolveCodebaseFilePacketKeys } from './graph-packet-key-resolver.js';
import type { Pool } from 'pg';

export interface LouvainResolutionSeedSourceRow {
	graphNodeKey: string;
	rawPath: string;
	communityId: string;
}

export interface LouvainResolutionSeedInsertRow {
	graphNodeKey: string;
	rawPath: string;
	normalizedPath: string;
	communityId: string;
	graphRevision: string;
}

export interface LouvainResolutionSeedPlan {
	resolvedRows: number;
	excludedRows: number;
	unresolvedRows: number;
	assignmentRows: Array<{ packet_key: string; community_id: string }>;
	unresolvedSeeds: LouvainResolutionSeedInsertRow[];
}

export async function prepareLouvainResolutionSeeds(
	db: Pool,
	sourceRows: readonly LouvainResolutionSeedSourceRow[],
	graphRevision: string,
): Promise<LouvainResolutionSeedPlan> {
	let resolvedRows = 0;
	let excludedRows = 0;
	let unresolvedRows = 0;
	const candidateRows: LouvainResolutionSeedSourceRow[] = [];

	for (const row of sourceRows) {
		const classification = classifyGraphPacketPath(row.rawPath);
		if (classification.kind === 'excluded') {
			excludedRows++;
			continue;
		}
		candidateRows.push(row);
	}

	const resolvedPacketKeys = await resolveCodebaseFilePacketKeys(
		db,
		candidateRows.map((row) => row.rawPath),
	);

	const seenPacketKeys = new Set<string>();
	const assignmentRows: Array<{ packet_key: string; community_id: string }> = [];
	const unresolvedSeeds: LouvainResolutionSeedInsertRow[] = [];

	for (const row of candidateRows) {
		const classification = classifyGraphPacketPath(row.rawPath);
		const packetKey = lookupPacketKey(resolvedPacketKeys, row.rawPath);
		if (!packetKey) {
			unresolvedRows++;
			unresolvedSeeds.push({
				graphNodeKey: row.graphNodeKey,
				rawPath: row.rawPath,
				normalizedPath: classification.normalizedPath,
				communityId: row.communityId,
				graphRevision,
			});
			continue;
		}

		resolvedRows++;
		if (seenPacketKeys.has(packetKey)) continue;
		seenPacketKeys.add(packetKey);
		assignmentRows.push({ packet_key: packetKey, community_id: row.communityId });
	}

	return {
		resolvedRows,
		excludedRows,
		unresolvedRows,
		assignmentRows,
		unresolvedSeeds,
	};
}
