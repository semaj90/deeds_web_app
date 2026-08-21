// @ts-expect-error TODO(TS-101): NATS package types are missing StringCodec export
import { connect, StringCodec } from 'nats';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildLatentRepresentationManifest, buildLowRankFeatureBlock } from '../tensors/latent-lod-contract.js';
import type { FabricLaneManifest } from '../contracts/fabric-lanes.js';
import { ENV } from '../../env.server.js';
import type { DailyGraphifyBoardData } from './daily-graphify-board.js';
import type { Phase89WorkflowPlan } from './phase89-workflow.js';
import { ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID } from '../retrieval/qdrant-semantic-projection.js';

const BenchmarkRowSchema = z
	.object({
		taskId: z.string().min(1),
		packetKey: z.string().min(1).nullable(),
		sourceRef: z.string().min(1).nullable(),
		titleId: z.string().min(1).nullable(),
		recommendationId: z.string().min(1).nullable(),
		priority: z.string().min(1),
		rank: z.number().int().nonnegative(),
		semanticSignal: z.number().finite().min(0).max(1),
		graphSignal: z.number().finite().min(0).max(1),
		workloadSignal: z.number().finite().min(0).max(1),
		lowRankSignal: z.number().finite().min(0).max(1),
		evidenceCount: z.number().int().nonnegative(),
		reasonCount: z.number().int().nonnegative(),
		blockedCount: z.number().int().nonnegative(),
	})
	.strict();

export type BoardGpuBenchmarkRow = z.infer<typeof BenchmarkRowSchema>;

export const BoardGpuBenchmarkReceiptSchema = z
	.object({
		schemaVersion: z.literal('atlas.board-fabric-gpu-benchmark.v1'),
		workflowId: z.string().min(1),
		collection: z.string().min(1),
		fabricLaneManifest: z.custom<FabricLaneManifest>(),
		latentManifest: z.object({
			representationId: z.string().min(1),
			representationRevision: z.string().min(1),
		}),
		jsonRows: z.array(BenchmarkRowSchema).min(1),
		jsonl: z.string().min(1),
		matrix: z.array(z.array(z.number().finite())).min(1),
		cuvsRequest: z
			.object({
				k: z.number().int().positive(),
				metric: z.enum(['cosine']),
				packetKeys: z.array(z.string().min(1)),
				representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
				representationRevision: z.string().min(1),
			})
			.strict(),
		lowRankFeatureBlock: z.object({
			blockId: z.string().min(1),
			packetKey: z.string().min(1),
			featureRevision: z.string().min(1),
		}),
	})
	.strict();

export type BoardGpuBenchmarkReceipt = z.infer<typeof BoardGpuBenchmarkReceiptSchema>;

const sc = StringCodec();
let natsConnection: any;

async function getNatsConnection() {
	if (!natsConnection) {
		const servers = ENV.NATS_URL ?? null;
		if (!servers) return null;
		natsConnection = await connect({ servers }).catch(() => null);
	}
	return natsConnection;
}

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
	return JSON.stringify(value, (_key, item) => {
		if (Array.isArray(item)) return item;
		if (item && typeof item === 'object') {
			return Object.keys(item as Record<string, unknown>)
				.sort()
				.reduce<Record<string, unknown>>((acc, key) => {
					acc[key] = (item as Record<string, unknown>)[key];
					return acc;
				}, {});
		}
		return item;
	});
}

function priorityWeight(priority: string): number {
	switch (priority.toUpperCase()) {
		case 'P0':
		case 'HIGH':
		case 'CRITICAL':
			return 0;
		case 'P1':
		case 'MEDIUM':
			return 1;
		case 'P2':
		case 'LOW':
			return 2;
		default:
			return 3;
	}
}

function normalizedSignal(value: number, scale: number): number {
	return Math.max(0, Math.min(1, value / scale));
}

function buildBenchmarkRows(board: DailyGraphifyBoardData, plan: Phase89WorkflowPlan): BoardGpuBenchmarkRow[] {
	const tasks = board.columns.flatMap((column) => column.tasks);
	const selected = tasks.filter((task) => task.status !== 'done');
	const rows = selected.map((task, index) => {
		const evidenceCount = task.evidence_refs?.length ?? 0;
		const reasonCount = task.reason_codes?.length ?? 0;
		const blockedCount = task.blockedBy?.length ?? 0;
		const rank = index + 1;
		const semanticSignal = normalizedSignal((evidenceCount + (task.recommendation_id ? 1 : 0)), 4);
		const graphSignal = normalizedSignal((task.source_ref ? 1 : 0) + (task.tree_node_id ? 1 : 0), 2);
		const workloadSignal = normalizedSignal(3 - priorityWeight(task.priority), 3);
		const lowRankSignal = Math.max(0, Math.min(1, (semanticSignal * 0.45) + (graphSignal * 0.35) + (workloadSignal * 0.2) - (blockedCount * 0.05)));

		return BenchmarkRowSchema.parse({
			taskId: task.id,
			packetKey: task.packet_key ?? plan.packetKey ?? null,
			sourceRef: task.source_ref ?? null,
			titleId: task.title_id ?? null,
			recommendationId: task.recommendation_id ?? null,
			priority: task.priority,
			rank,
			semanticSignal,
			graphSignal,
			workloadSignal,
			lowRankSignal,
			evidenceCount,
			reasonCount,
			blockedCount,
		});
	});

	return rows.sort((a, b) => a.rank - b.rank || a.taskId.localeCompare(b.taskId));
}

export function buildBoardGpuBenchmarkReceipt(input: {
	board: DailyGraphifyBoardData;
	plan: Phase89WorkflowPlan;
	fabricLaneManifest: FabricLaneManifest;
}): BoardGpuBenchmarkReceipt {
	const jsonRows = buildBenchmarkRows(input.board, input.plan);
	const jsonl = jsonRows.map((row) => JSON.stringify(row)).join('\n');
	const matrix = jsonRows.map((row) => [
		row.semanticSignal,
		row.graphSignal,
		row.workloadSignal,
		row.lowRankSignal,
		row.evidenceCount / 10,
		row.blockedCount / 10,
	]);
	const latentManifest = buildLatentRepresentationManifest({
		representationId: 'latent_128',
		representationRevision: `latent_128:${input.board.generated}`,
		latentDimension: 128,
		kind: 'LOW_RANK',
		fidelity: 'INT8_WARM',
		deterministic: true,
		checkpointHash: `ckpt:${sha256Hex(stableJson({
			workflowId: input.plan.workflowId,
			collection: input.board.collection,
			rows: jsonRows.map((row) => row.taskId),
		})).slice(0, 24)}`,
	});

	const lowRankFeatureBlock = buildLowRankFeatureBlock({
		packetKey: input.plan.packetKey ?? input.fabricLaneManifest.packetKey,
		sourceRef: input.plan.sourceRef ?? input.fabricLaneManifest.sourceRef,
		sourceRevision: input.board.generated,
		sourceRepresentationRevision: input.fabricLaneManifest.representationRevision,
		latentManifest,
		approximationMethod: 'EWIN_TANG',
		rank: Math.max(1, jsonRows.length),
		seed: 17,
		producerId: 'atlas-phase89-gpu-benchmark',
		producerRevision: input.board.generated,
		featureRevision: 'atlas.board-fabric-gpu-benchmark.v1',
		inputDigest: `input:${sha256Hex(stableJson({ board: input.board.collection, rows: jsonRows }))}`,
		outputDigest: `output:${sha256Hex(jsonl)}`,
		generatedAt: input.board.generated,
		components: {
			semantic: jsonRows.reduce((sum, row) => sum + row.semanticSignal, 0) / Math.max(1, jsonRows.length),
			graph: jsonRows.reduce((sum, row) => sum + row.graphSignal, 0) / Math.max(1, jsonRows.length),
			workflow: jsonRows.reduce((sum, row) => sum + row.workloadSignal, 0) / Math.max(1, jsonRows.length),
			cache: jsonRows.reduce((sum, row) => sum + row.lowRankSignal, 0) / Math.max(1, jsonRows.length),
			execution: jsonRows.reduce((sum, row) => sum + (1 - row.blockedCount / 10), 0) / Math.max(1, jsonRows.length),
		},
	});

	return BoardGpuBenchmarkReceiptSchema.parse({
		schemaVersion: 'atlas.board-fabric-gpu-benchmark.v1',
		workflowId: input.plan.workflowId,
		collection: input.board.collection,
		fabricLaneManifest: input.fabricLaneManifest,
		latentManifest: {
			representationId: latentManifest.representationId,
			representationRevision: latentManifest.representationRevision,
		},
		jsonRows,
		jsonl,
		matrix,
		cuvsRequest: {
			k: Math.min(10, jsonRows.length),
			metric: 'cosine',
			packetKeys: Array.from(new Set(jsonRows.map((row) => row.packetKey).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort(),
			representationId: SEMANTIC_REPRESENTATION_ID,
			representationRevision: input.fabricLaneManifest.representationRevision,
		},
		lowRankFeatureBlock: {
			blockId: lowRankFeatureBlock.blockId,
			packetKey: lowRankFeatureBlock.packetKey,
			featureRevision: lowRankFeatureBlock.featureRevision,
		},
	});
}

export async function publishBoardGpuBenchmarkReceipt(
	receipt: BoardGpuBenchmarkReceipt,
	input?: {
		subject?: string;
		publisher?: {
			publish(subject: string, payload: Uint8Array): void | Promise<void>;
		};
	},
): Promise<{ published: boolean; subject: string; transport: 'nats' | 'stub' | 'offline' }> {
	const subject = input?.subject ?? 'atlas.board.fabric.gpu-benchmark';
	const payload = BoardGpuBenchmarkReceiptSchema.parse(receipt);

	if (input?.publisher) {
		await input.publisher.publish(subject, sc.encode(JSON.stringify(payload)));
		return { published: true, subject, transport: 'stub' };
	}

	try {
		const nc = await getNatsConnection();
		if (!nc) {
			return { published: false, subject, transport: 'offline' };
		}
		nc.publish(subject, sc.encode(JSON.stringify(payload)));
		return { published: true, subject, transport: 'nats' };
	} catch {
		return { published: false, subject, transport: 'offline' };
	}
}
