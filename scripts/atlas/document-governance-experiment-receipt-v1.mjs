const isUnitInterval = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Read-only adapter for the one explicitly named Tang-inspired shortlist receipt. */
export function parseTangInspiredShortlistReceiptV1(text) {
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    throw new Error('EXPERIMENT_RECEIPT_INVALID_JSON');
  }

  const metrics = receipt?.quality;
  const exactMetrics = receipt?.exactSemantic?.metrics;
  const requiredMetrics = ['recallAt10', 'recallAt24', 'top24Overlap', 'oracleNdcgAt24'];
  if (receipt?.schema !== 'atlas.candidate-shortlist-receipt.v1'
    || receipt.status !== 'EXECUTED_UNPROVEN'
    || receipt.readOnly !== true
    || receipt.databaseWrites !== false
    || receipt.canonicalAuthority !== false
    || receipt.lowRank?.policy !== 'TANG_INSPIRED_LOW_RANK_SHORTLIST'
    || receipt.lowRank?.canonical_authority !== false
    || !Number.isFinite(Date.parse(receipt.generatedAt))
    || typeof receipt.featureRevision !== 'string'
    || receipt.featureRevision.length === 0
    || !Number.isSafeInteger(receipt.inputCount)
    || receipt.inputCount < 1
    || !Number.isSafeInteger(receipt.targetCount)
    || receipt.targetCount < 1
    || receipt.targetCount > receipt.inputCount
    || !Number.isSafeInteger(receipt.rank)
    || receipt.rank < 1
    || !requiredMetrics.every((key) => isUnitInterval(metrics?.[key]) && metrics[key] === exactMetrics?.[key])) {
    throw new Error('EXPERIMENT_RECEIPT_CONTRACT_MISMATCH');
  }
  if (metrics.ndcgAt24 !== null && !isUnitInterval(metrics.ndcgAt24)) {
    throw new Error('EXPERIMENT_RECEIPT_METRIC_INVALID:ndcgAt24');
  }

  return {
    sourceChange: 'parent-atlas-neural-prefill-encoder',
    receiptStatus: 'EXECUTED_UNPROVEN',
    policy: 'TANG_INSPIRED_LOW_RANK_SHORTLIST',
    observedAt: new Date(receipt.generatedAt).toISOString(),
    featureRevision: receipt.featureRevision,
    inputCount: receipt.inputCount,
    targetCount: receipt.targetCount,
    rank: receipt.rank,
    quality: {
      recallAt10: metrics.recallAt10,
      recallAt24: metrics.recallAt24,
      top24Overlap: metrics.top24Overlap,
      oracleNdcgAt24: metrics.oracleNdcgAt24,
      ndcgAt24: metrics.ndcgAt24,
    },
    canonicalAuthority: false,
  };
}
