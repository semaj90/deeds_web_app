import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { buildGraphDispatcherRegistrySnapshot } from './graph-dispatcher-registry.js';
import { buildLatestLouvainResolutionReceipt, type LouvainResolutionReceipt } from './louvain-resolution-receipt.js';

export interface LouvainPersistenceReceipt {
	receiptId: string;
	algorithm: 'louvain';
	runId: string;
	projectionName: string;
	graphRevision: string;
	communityCount: number;
	assignmentCount: number;
	memberCount: number;
	duplicateAssignments: number;
	membershipReconciled: boolean;
	latestRunAssignments: number | null;
	latestRunUnresolvedPacketKeys: number | null;
	latestRunExcludedPacketKeys: number | null;
	atlasPacketsMutated: false;
	replaySafe: boolean;
	createdAt: string;
}

export interface GraphDispatcherProofSnapshot {
	generatedAt: string;
	registry: ReturnType<typeof buildGraphDispatcherRegistrySnapshot>;
	louvainReceipt: LouvainPersistenceReceipt | null;
	louvainResolutionReceipt: LouvainResolutionReceipt | null;
	openGaps: string[];
}

const LouvainPersistenceReceiptSchema = z
	.object({
		receiptId: z.string().min(1),
		algorithm: z.literal('louvain'),
		runId: z.string().min(1),
		projectionName: z.string().min(1),
		graphRevision: z.string().min(1),
		communityCount: z.number().int().nonnegative(),
		assignmentCount: z.number().int().nonnegative(),
		memberCount: z.number().int().nonnegative(),
		duplicateAssignments: z.number().int().nonnegative(),
		membershipReconciled: z.boolean(),
		latestRunAssignments: z.number().int().nonnegative().nullable(),
		latestRunUnresolvedPacketKeys: z.number().int().nonnegative().nullable(),
		latestRunExcludedPacketKeys: z.number().int().nonnegative().nullable(),
		atlasPacketsMutated: z.literal(false),
		replaySafe: z.boolean(),
		createdAt: z.string().datetime(),
	})
	.strict();

export async function buildLouvainPersistenceReceipt(db: Pool): Promise<LouvainPersistenceReceipt | null> {
	const { rows: runRows } = await db.query<{
		run_id: string;
		projection_name: string;
		graph_revision: string;
		metrics: { assignments?: number; unresolvedPacketKeys?: number; excludedPacketKeys?: number } | null;
	}>(`
		SELECT run_id, projection_name, graph_revision, metrics
		FROM graph_analysis_runs
		WHERE algorithm = 'louvain' AND status = 'succeeded'
		ORDER BY started_at DESC
		LIMIT 1
	`);

	const run = runRows[0];
	if (!run) return null;

	const [{ rows: communityRows }, { rows: assignmentRows }] = await Promise.all([
		db.query<{ community_count: number; member_count: number }>(
			`
			SELECT COUNT(*)::int AS community_count,
			       COALESCE(SUM(member_count), 0)::int AS member_count
			FROM graph_communities
			WHERE run_id = $1 AND algorithm = 'louvain'
			`,
			[run.run_id],
		),
		db.query<{ assignment_count: number; distinct_packets: number }>(
			`
			SELECT COUNT(*)::int AS assignment_count,
			       COUNT(DISTINCT packet_key)::int AS distinct_packets
			FROM graph_community_assignments
			WHERE run_id = $1 AND algorithm = 'louvain'
			`,
			[run.run_id],
		),
	]);

	const communityCount = Number(communityRows[0]?.community_count ?? 0);
	const memberCount = Number(communityRows[0]?.member_count ?? 0);
	const assignmentCount = Number(assignmentRows[0]?.assignment_count ?? 0);
	const distinctPackets = Number(assignmentRows[0]?.distinct_packets ?? 0);
	const duplicateAssignments = Math.max(0, assignmentCount - distinctPackets);
	const latestRunAssignments = Number(run.metrics?.assignments ?? null);
	const latestRunUnresolvedPacketKeys = Number(run.metrics?.unresolvedPacketKeys ?? null);
	const latestRunExcludedPacketKeys = Number(run.metrics?.excludedPacketKeys ?? null);
	const membershipReconciled = communityCount > 0 && assignmentCount === memberCount && duplicateAssignments === 0;
	const replaySafe = membershipReconciled && latestRunUnresolvedPacketKeys === 0;
	const receiptSeed = {
		runId: run.run_id,
		projectionName: run.projection_name,
		graphRevision: run.graph_revision,
		communityCount,
		assignmentCount,
		memberCount,
		duplicateAssignments,
		membershipReconciled,
		latestRunAssignments,
		latestRunUnresolvedPacketKeys,
		latestRunExcludedPacketKeys,
		atlasPacketsMutated: false as const,
		replaySafe,
	};

  return LouvainPersistenceReceiptSchema.parse({
		...receiptSeed,
		algorithm: 'louvain' as const,
		receiptId: `louvain-persistence-${createHash('sha256').update(JSON.stringify(receiptSeed)).digest('hex').slice(0, 16)}`,
		createdAt: new Date(0).toISOString(),
  }) as LouvainPersistenceReceipt;
}

export async function buildGraphDispatcherProofSnapshot(db: Pool): Promise<GraphDispatcherProofSnapshot> {
	const registry = buildGraphDispatcherRegistrySnapshot();
	const louvainReceipt = await buildLouvainPersistenceReceipt(db);
	const louvainResolutionReceipt = await buildLatestLouvainResolutionReceipt(db);
	const openGaps: string[] = [];
	if (!registry.completeness.exactMatch) openGaps.push('dispatcher registry incompleteness');
	if (!louvainReceipt) openGaps.push('no succeeded Louvain run found');
	else if (!(louvainReceipt.replaySafe || louvainResolutionReceipt?.replaySafe)) openGaps.push('Louvain persistence receipt not replay-safe');
	if (!louvainResolutionReceipt) openGaps.push('no Louvain resolution receipt found');
	else if (!louvainResolutionReceipt.replaySafe) openGaps.push('Louvain resolution receipt not replay-safe');

	return {
		generatedAt: new Date(0).toISOString(),
		registry,
		louvainReceipt,
		louvainResolutionReceipt,
		openGaps,
	};
}
