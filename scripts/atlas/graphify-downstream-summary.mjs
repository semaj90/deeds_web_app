const NON_SUCCESS_STAGES = new Set(['timeout', 'fail', 'error', 'blocked']);

export function summarizePipelineStages(stages) {
  const failedStages = Object.entries(stages)
    .filter(([, stage]) => NON_SUCCESS_STAGES.has(stage?.status))
    .map(([name]) => name);

  return {
    success: failedStages.length === 0,
    failedStages
  };
}
