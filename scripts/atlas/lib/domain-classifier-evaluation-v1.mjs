const present = (value) => typeof value === 'string' && value.trim().length > 0;
const digest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value);
const checksum = (value) => typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);

function scoreModel(rows, labels, field) {
  let correct = 0;
  let brierTotal = 0;
  let logLossTotal = 0;
  const counts = new Map(labels.map((label) => [label, { tp: 0, fp: 0, fn: 0 }]));
  for (const row of rows) {
    const probabilities = row[field];
    const prediction = Object.entries(probabilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    if (prediction === row.expectedLabel) correct += 1;
    if (prediction === row.expectedLabel) counts.get(prediction).tp += 1;
    else {
      counts.get(prediction).fp += 1;
      counts.get(row.expectedLabel).fn += 1;
    }
    for (const label of labels) {
      const probability = probabilities[label];
      const expected = label === row.expectedLabel ? 1 : 0;
      brierTotal += (probability - expected) ** 2;
      if (expected) logLossTotal -= Math.log(Math.max(probability, Number.EPSILON));
    }
  }
  const macroF1 = labels.reduce((sum, label) => {
    const { tp, fp, fn } = counts.get(label);
    const denominator = 2 * tp + fp + fn;
    return sum + (denominator ? (2 * tp) / denominator : 0);
  }, 0) / labels.length;
  return {
    accuracy: correct / rows.length,
    macroF1,
    multiclassBrier: brierTotal / rows.length,
    logLoss: logLossTotal / rows.length,
  };
}

export function evaluateDomainClassifierHoldoutV1(input) {
  const failures = [];
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const labels = Array.isArray(input?.classLabels) ? [...new Set(input.classLabels.filter(present))].sort() : [];
  const trainingChecksums = new Set(input?.trainingMemberChecksums ?? []);

  if (input?.schema !== 'atlas.domain-classifier-holdout.v1') failures.push('HOLDOUT_SCHEMA_INVALID');
  if (!present(input?.cohortId) || !present(input?.cohortRevision)) failures.push('HOLDOUT_COHORT_UNFROZEN');
  if (!['HUMAN_REVIEWED', 'ADMITTED_LABEL'].includes(input?.labelSource)) failures.push('LABEL_SOURCE_NOT_INDEPENDENT');
  if (!present(input?.modelRevision) || !checksum(input?.checkpointChecksum)) failures.push('MODEL_PROVENANCE_MISSING');
  if (!Array.isArray(input?.trainingMemberChecksums) || trainingChecksums.size === 0) failures.push('TRAINING_MEMBERSHIP_UNPROVEN');
  else if (input.trainingMemberChecksums.some((value) => !digest(value))) failures.push('TRAINING_MEMBERSHIP_INVALID');
  if (rows.length < 2 || labels.length < 2) failures.push('HOLDOUT_TOO_SMALL_OR_CLASS_LABELS_MISSING');

  for (const row of rows) {
    if (!present(row?.sampleId) || !digest(row?.inputChecksum) || !present(row?.expectedLabel) || !Array.isArray(row?.evidenceRefs) || row.evidenceRefs.length === 0) {
      failures.push('HOLDOUT_ROW_LINEAGE_INCOMPLETE');
      continue;
    }
    if (!labels.includes(row.expectedLabel)) failures.push('EXPECTED_LABEL_OUTSIDE_MODEL_CLASSES');
    if (trainingChecksums.has(row.inputChecksum)) failures.push('TRAINING_HOLDOUT_OVERLAP');
    for (const key of ['naiveBayesProbabilities', 'logisticRegressionProbabilities']) {
      const probabilities = row[key];
      if (!probabilities || Object.keys(probabilities).sort().join('|') !== labels.join('|') || labels.some((label) => !Number.isFinite(probabilities[label]) || probabilities[label] < 0 || probabilities[label] > 1)) {
        failures.push(`${key.toUpperCase()}_INVALID`);
        continue;
      }
      const sum = labels.reduce((total, label) => total + probabilities[label], 0);
      if (Math.abs(sum - 1) > 1e-6) failures.push(`${key.toUpperCase()}_NOT_NORMALIZED`);
    }
  }

  const uniqueFailures = [...new Set(failures)].sort();
  const result = {
    schema: 'atlas.domain-classifier-evaluation.v1',
    status: uniqueFailures.length ? 'BLOCKED' : 'DIAGNOSTIC_EVALUATION_COMPLETE',
    canonicalAuthority: false,
    writesPerformed: false,
    cohortId: input?.cohortId ?? null,
    cohortRevision: input?.cohortRevision ?? null,
    modelRevision: input?.modelRevision ?? null,
    checkpointChecksum: input?.checkpointChecksum ?? null,
    labelSource: input?.labelSource ?? null,
    sampleCount: rows.length,
    labels,
    failures: uniqueFailures,
    models: null,
  };
  if (uniqueFailures.length === 0) {
    result.models = {
      naiveBayes: scoreModel(rows, labels, 'naiveBayesProbabilities'),
      logisticRegression: scoreModel(rows, labels, 'logisticRegressionProbabilities'),
      independentTruthProven: true,
    };
  }
  return result;
}
