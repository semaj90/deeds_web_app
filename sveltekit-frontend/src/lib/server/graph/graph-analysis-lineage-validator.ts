import { z } from 'zod';
import { GraphAnalysisRunSchema } from './graph-analysis-types.js';
import { GraphProjectionManifestV3Schema } from './graph-projection-manifest.js';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutionReceiptV1Schema,
} from './pagerank-execution-contract.js';
import { PageRankAuthorityV2Schema } from './pagerank-authority-v2.js';
import { GraphFanoutPlanV1Schema, GraphFanoutReceiptV1Schema } from './graph-fanout-contract.js';

export const GraphLineageKeyV1Schema = z
	.object({
		runId: z.string().min(1),
		algorithm: z.string().min(1),
		algorithmRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
	})
	.strict();
export type GraphLineageKeyV1 = z.infer<typeof GraphLineageKeyV1Schema>;

export const GraphAnalysisRunV2Schema = GraphAnalysisRunSchema.extend({
	projectionHash: z.string().min(1),
}).strict();
export type GraphAnalysisRunV2 = z.infer<typeof GraphAnalysisRunV2Schema>;

function assertEqual(label: string, expected: string, actual: string): void {
	if (expected !== actual) throw new Error(`${label} mismatch: expected '${expected}', got '${actual}'`);
}

export function assertPageRankAnalysisLineage(input: {
	projection: unknown;
	plan: unknown;
	run: unknown;
	receipt: unknown;
	authorityRecords?: readonly unknown[];
}): GraphLineageKeyV1 {
	const projection = GraphProjectionManifestV3Schema.parse(input.projection);
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const run = GraphAnalysisRunV2Schema.parse(input.run);
	const receipt = PageRankExecutionReceiptV1Schema.parse(input.receipt);
	const authorityRecords = (input.authorityRecords ?? []).map((record) => PageRankAuthorityV2Schema.parse(record));

	assertEqual('plan.graphRevision', projection.graphRevision, plan.projection.graphRevision);
	assertEqual('plan.projectionRevision', projection.projectionRevision, plan.projection.projectionRevision);
	assertEqual('plan.projectionHash', projection.projectionHash, plan.projection.projectionHash);
	assertEqual('plan.projectionName', projection.projectionName, plan.projection.projectionName);

	assertEqual('run.runId', plan.runId, run.runId);
	assertEqual('run.algorithm', plan.algorithm, run.algorithm);
	assertEqual('run.algorithmRevision', plan.algorithmRevision, run.algorithmRevision);
	assertEqual('run.graphRevision', projection.graphRevision, run.graphRevision);
	assertEqual('run.projectionRevision', projection.projectionRevision, run.projectionRevision);
	assertEqual('run.projectionHash', projection.projectionHash, run.projectionHash);
	assertEqual('run.projectionName', projection.projectionName, run.projectionName);

	assertEqual('receipt.runId', plan.runId, receipt.runId);
	assertEqual('receipt.algorithm', plan.algorithm, receipt.algorithm);
	assertEqual('receipt.algorithmRevision', plan.algorithmRevision, receipt.algorithmRevision);
	assertEqual('receipt.graphRevision', projection.graphRevision, receipt.graphRevision);
	assertEqual('receipt.projectionRevision', projection.projectionRevision, receipt.projectionRevision);
	assertEqual('receipt.projectionHash', projection.projectionHash, receipt.projectionHash);
	assertEqual('receipt.projectionName', projection.projectionName, receipt.projectionName);
	assertEqual('receipt.executorId', plan.executor.executorId, receipt.telemetry.executorId);

	for (const [index, authority] of authorityRecords.entries()) {
		assertEqual(`authority[${index}].runId`, plan.runId, authority.runId);
		assertEqual(`authority[${index}].algorithm`, plan.algorithm, authority.algorithm);
		assertEqual(`authority[${index}].executorId`, plan.executor.executorId, authority.executorId);
		assertEqual(`authority[${index}].graphRevision`, projection.graphRevision, authority.graphRevision);
		assertEqual(`authority[${index}].projectionRevision`, projection.projectionRevision, authority.projectionRevision);
		assertEqual(`authority[${index}].projectionHash`, projection.projectionHash, authority.projectionHash);
		assertEqual(`authority[${index}].projectionName`, projection.projectionName, authority.projectionName);
	}

	return GraphLineageKeyV1Schema.parse({
		runId: plan.runId,
		algorithm: plan.algorithm,
		algorithmRevision: plan.algorithmRevision,
		graphRevision: projection.graphRevision,
		projectionRevision: projection.projectionRevision,
		projectionHash: projection.projectionHash,
		projectionName: projection.projectionName,
	});
}

export function assertFanoutLineage(input: {
	projection: unknown;
	plan: unknown;
	receipt: unknown;
}): void {
	const projection = GraphProjectionManifestV3Schema.parse(input.projection);
	const plan = GraphFanoutPlanV1Schema.parse(input.plan);
	const receipt = GraphFanoutReceiptV1Schema.parse(input.receipt);

	assertEqual('fanout.plan.graphRevision', projection.graphRevision, plan.projection.graphRevision);
	assertEqual('fanout.plan.projectionRevision', projection.projectionRevision, plan.projection.projectionRevision);
	assertEqual('fanout.plan.projectionHash', projection.projectionHash, plan.projection.projectionHash);
	assertEqual('fanout.plan.projectionName', projection.projectionName, plan.projection.projectionName);
	assertEqual('fanout.receipt.requestId', plan.requestId, receipt.requestId);
	assertEqual('fanout.receipt.graphRevision', projection.graphRevision, receipt.graphRevision);
	assertEqual('fanout.receipt.projectionRevision', projection.projectionRevision, receipt.projectionRevision);
	assertEqual('fanout.receipt.projectionHash', projection.projectionHash, receipt.projectionHash);
	assertEqual('fanout.receipt.projectionName', projection.projectionName, receipt.projectionName);
}
