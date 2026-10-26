import { buildGraphEdgeProposalV1 } from './graph-edge-proposal-v1.mjs';
import { relationForToolObservationV1 } from './tool-edge-relation-v1.mjs';

export function buildToolEdgeProposalV1(observation, sourceLocator, { sourceEvidence = null } = {}) {
  if (!observation || typeof sourceLocator !== 'string' || !sourceLocator.trim()) {
    throw new Error('TOOL_EDGE_SOURCE_LOCATOR_REQUIRED');
  }
  const targetLabel = observation.tool || observation.endpoint || observation.service;
  if (typeof targetLabel !== 'string' || !targetLabel.trim()) {
    throw new Error('TOOL_EDGE_TARGET_LABEL_REQUIRED');
  }
  const lineNumber = observation.line_num;
  const hasLineNumber = Number.isInteger(lineNumber) && lineNumber > 0;
  const evidenceScope = observation.evidence_scope ?? (hasLineNumber ? 'LINE' : 'FILE');
  if (!['FILE', 'LINE'].includes(evidenceScope)) throw new Error('TOOL_EDGE_EVIDENCE_SCOPE_INVALID');
  if ((evidenceScope === 'LINE') !== hasLineNumber) throw new Error('TOOL_EDGE_EVIDENCE_SCOPE_LINE_MISMATCH');

  return buildGraphEdgeProposalV1({
    source_locator: sourceLocator,
    target_label: targetLabel,
    relation: relationForToolObservationV1(observation.type),
    source_revision: sourceEvidence?.sourceRevision ?? observation.source_revision ?? null,
    workspace_revision: sourceEvidence?.workspaceRevision ?? observation.workspace_revision ?? null,
    line: hasLineNumber ? lineNumber : null,
    caller: observation.caller,
    type: observation.type,
    metadata: {
      evidence_scope: evidenceScope,
    },
    source_evidence: sourceEvidence,
  });
}
