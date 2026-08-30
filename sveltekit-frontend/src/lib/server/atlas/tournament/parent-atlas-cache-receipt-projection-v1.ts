import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	isCacheExecutionReceiptProvenV1,
	validateCacheExecutionReceiptV1,
	type CacheExecutionReceiptV1
} from '../../cache/cache-execution-receipt-v1.js';
import type { ParentAtlasTournamentSnapshotV1, TournamentReceiptSourceV1 } from './parent-atlas-tournament-receipt-aggregator-v1.js';
import { calculateTournamentProgressV1, type TournamentGateId, type TournamentGateV1 } from './parent-atlas-tournament-progress-v1.js';

const CACHE_REPORTS = [
	'docs/reports/valkey-cache-execution-receipt-v1.json',
	'docs/reports/bitfrost-cache-execution-receipt-v1.json',
	'docs/reports/ace-cache-execution-receipt-v1.json',
	'docs/reports/kv-prefix-cache-execution-receipt-v1.json'
] as const;

const TIER_GATE: Partial<Record<CacheExecutionReceiptV1['tier'], TournamentGateId>> = {
	valkey: 'valkey_cache',
	bitfrost: 'bitfrost_cache',
	ace: 'ace_prefill',
	kv_prefix: 'kv_cache_identity'
};

export type ParentAtlasCacheTelemetryV1 = {
	schema: 'atlas.parent-tournament-cache-telemetry.v1';
	provenTiers: CacheExecutionReceiptV1['tier'][];
	valkeyHitsObserved: number;
	valkeyMissesObserved: number;
	cacheHitPct: number | null;
	receiptPaths: string[];
};

export type ParentAtlasTournamentSnapshotWithCacheV1<T extends ParentAtlasTournamentSnapshotV1 = ParentAtlasTournamentSnapshotV1> = T & {
	cacheTelemetry: ParentAtlasCacheTelemetryV1;
};

type Accepted = { receipt: CacheExecutionReceiptV1; path: string; gateId: TournamentGateId };

async function readReceipt(repoRoot: string, path: string): Promise<{ receipt: CacheExecutionReceiptV1 | null; diagnostics: string[] }> {
	try {
		const text = await readFile(resolve(repoRoot, path), 'utf8');
		const receipt = JSON.parse(text) as CacheExecutionReceiptV1;
		const diagnostics = validateCacheExecutionReceiptV1(receipt);
		return { receipt, diagnostics };
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return { receipt: null, diagnostics: [] };
		}
		return { receipt: null, diagnostics: [`READ_FAILED:${error instanceof Error ? error.message : String(error)}`] };
	}
}

export async function applyParentAtlasCacheReceiptProjectionV1<T extends ParentAtlasTournamentSnapshotV1>(
	repoRoot: string,
	snapshot: T
): Promise<ParentAtlasTournamentSnapshotWithCacheV1<T>> {
	const accepted: Accepted[] = [];
	const sources: TournamentReceiptSourceV1[] = [];

	for (const path of CACHE_REPORTS) {
		const { receipt, diagnostics } = await readReceipt(repoRoot, path);
		if (!receipt && diagnostics.length === 0) continue;
		const gateId = receipt ? TIER_GATE[receipt.tier] : undefined;
		const proven = Boolean(receipt && gateId && isCacheExecutionReceiptProvenV1(receipt));
		if (receipt && gateId && proven) accepted.push({ receipt, path, gateId });
		sources.push({
			path,
			schema: receipt?.schema ?? 'atlas.cache-execution-receipt.v1',
			status: proven ? 'CACHE_EXECUTION_PROVEN' : 'CACHE_EXECUTION_UNPROVEN',
			accepted: proven,
			gateIds: proven && gateId ? [gateId] : [],
			diagnostics: [
				...diagnostics,
				...(receipt && !gateId ? [`UNMAPPED_CACHE_TIER:${receipt.tier}`] : []),
				...(receipt && receipt.status !== 'PROVEN' ? [`RECEIPT_STATUS:${receipt.status}`] : [])
			]
		});
	}

	const byGate = new Map<TournamentGateId, Accepted>();
	for (const item of accepted) byGate.set(item.gateId, item);
	const gates: TournamentGateV1[] = snapshot.gates.map((gate) => {
		const proof = byGate.get(gate.id);
		if (!proof) return gate;
		return {
			...gate,
			state: 'PROVEN',
			completion: undefined,
			receiptRef: proof.path
		};
	});

	const proofOnly = calculateTournamentProgressV1(gates);
	const progress = { ...proofOnly, efficiency: snapshot.progress.efficiency };
	const valkeyHitsObserved = accepted.reduce((sum, item) => sum + item.receipt.telemetry.valkeyHitsObserved, 0);
	const valkeyMissesObserved = accepted.reduce((sum, item) => sum + item.receipt.telemetry.valkeyMissesObserved, 0);
	const total = valkeyHitsObserved + valkeyMissesObserved;

	return {
		...snapshot,
		gates,
		progress,
		sources: [...snapshot.sources, ...sources],
		diagnostics: [
			...snapshot.diagnostics,
			...sources.flatMap((item) => item.diagnostics.map((diagnostic) => `${item.path}:${diagnostic}`))
		],
		cacheTelemetry: {
			schema: 'atlas.parent-tournament-cache-telemetry.v1',
			provenTiers: [...new Set(accepted.map((item) => item.receipt.tier))].sort(),
			valkeyHitsObserved,
			valkeyMissesObserved,
			cacheHitPct: total > 0 ? Number(((valkeyHitsObserved / total) * 100).toFixed(2)) : null,
			receiptPaths: accepted.map((item) => item.path).sort()
		}
	};
}

export const PARENT_ATLAS_CACHE_REPORT_PATHS_V1 = CACHE_REPORTS;
