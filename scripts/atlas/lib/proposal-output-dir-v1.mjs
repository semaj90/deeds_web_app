import path from 'node:path';

export function resolveProposalOutputDirV1(projectRoot, requestedOutputDir) {
  const defaultDir = path.resolve(projectRoot, 'scripts/atlas/out');
  if (requestedOutputDir === undefined) return defaultDir;
  if (typeof requestedOutputDir !== 'string' || !requestedOutputDir.trim()) throw new Error('PROPOSAL_OUTPUT_DIR_INVALID');
  const outputDir = path.resolve(projectRoot, requestedOutputDir);
  const allowedRoot = path.resolve(projectRoot, '.tmp/atlas') + path.sep;
  if (!outputDir.startsWith(allowedRoot)) throw new Error('PROPOSAL_OUTPUT_DIR_OUTSIDE_TMP_ATLAS');
  return outputDir;
}
