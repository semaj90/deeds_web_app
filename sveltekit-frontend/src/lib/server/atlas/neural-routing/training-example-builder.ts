import {
  ToolTrainingExampleV1Schema,
  type ExecutionOutcomeV1,
  type QueryRoutingSnapshotV1,
  type ToolRoutingReceiptV1,
  type ToolTrainingExampleV1,
  stableRoutingChecksum,
} from './contracts.js';

function computeUtility(outcome: ExecutionOutcomeV1, selected: boolean): number {
  const success = outcome.success ? 1 : 0;
  const verification = outcome.verificationPassed ? 1 : 0;
  const human = outcome.humanOutcome === 'ACCEPTED' ? 1 : outcome.humanOutcome === 'REJECTED' ? -1 : 0;
  const latencyPenalty = Math.min(1, outcome.latencyMs / 10_000);
  const tokenPenalty = Math.min(1, outcome.tokenCost / 32_000);
  return (
    0.35 * success +
    0.30 * verification +
    0.20 * outcome.evidenceGain +
    0.10 * human -
    0.03 * latencyPenalty -
    0.02 * tokenPenalty +
    (selected ? 0 : 0)
  );
}

/**
 * Produce one pairwise-style training example per eligible tool candidate.
 * Labels are only positive when the executed tool succeeded and verification
 * passed. Unverified outcomes remain available for analysis but label=0.
 */
export function buildToolTrainingExamples(input: {
  snapshot: QueryRoutingSnapshotV1;
  routingReceipt: ToolRoutingReceiptV1;
  outcome: ExecutionOutcomeV1;
}): ToolTrainingExampleV1[] {
  if (input.routingReceipt.snapshotChecksum !== input.snapshot.checksum) {
    throw new Error('routing receipt does not belong to supplied query snapshot');
  }
  if (input.outcome.selectedToolId !== input.routingReceipt.selectedToolIds[0] &&
      !input.routingReceipt.selectedToolIds.includes(input.outcome.selectedToolId)) {
    throw new Error('executed tool was not in the routed top-k set');
  }

  const verifiedPositive = input.outcome.success && input.outcome.verificationPassed;
  return input.snapshot.candidateFeatureMatrix.rows
    .filter((row) => row.eligible)
    .map((row) => {
      const selected = row.toolId === input.outcome.selectedToolId;
      const label = selected && verifiedPositive ? 1 : 0;
      const utility = selected ? computeUtility(input.outcome, true) : 0;
      const evidenceRefs = [...new Set([
        ...row.evidenceRefs,
        ...(selected ? input.outcome.evidenceRefs : []),
      ])].sort();
      const base = {
        schemaVersion: 'atlas.tool-training-example.v1' as const,
        exampleId: `${input.snapshot.requestId}:${row.toolId}`,
        requestId: input.snapshot.requestId,
        snapshotChecksum: input.snapshot.checksum,
        routingReceiptChecksum: input.routingReceipt.checksum,
        queryText: input.snapshot.queryText,
        toolId: row.toolId,
        featureValues: row.values,
        selected,
        label,
        utility,
        verified: selected ? input.outcome.verificationPassed : false,
        evidenceRefs,
      };
      return ToolTrainingExampleV1Schema.parse({ ...base, checksum: stableRoutingChecksum(base) });
    });
}
