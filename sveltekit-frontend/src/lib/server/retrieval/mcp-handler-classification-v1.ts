import {
  MCPHandlerClassificationV1Schema,
  type MCPHandlerClassificationV1,
} from './mcp-tool-registry-types-v1.js';

/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase D: reconciles the existing AST-derived classification
 * (docs/reports/mcp-tool-registry-drift-classification-v1.json, PRIVATE/LEGACY/DELEGATED_CANONICAL/
 * ALIAS) against live tools/list discovery, into the operator's six-value taxonomy
 * (LISTING_OMISSION|INTERNAL_HANDLER|DEPRECATED_ALIAS|PERMISSION_HIDDEN|DEAD_ORPHAN|UNKNOWN).
 *
 * Real constraint found during Phase B, not assumed: sveltekit-frontend/src/mcp/server.ts
 * ('deeds-legal-server', the file the AST audit is actually scoped to) has no confirmed live
 * launcher anywhere in scripts/ -- it is not one of the two servers this gate's live discovery
 * can reach (see discover-mcp-tools-live-v1.mts's own header comment). This means: for every
 * entry below, only the TRACE side of a claimed duplicate/delegation can be live-cross-checked;
 * the mcp-server.ts side rests on AST evidence only. Per the operator's explicit instruction
 * ("Do not generate the revision from AST handlers. Generate it from actual admitted MCP
 * discovery"), an entry whose classification would require trusting the unconfirmed mcp-server.ts
 * side is classified UNKNOWN here, not silently promoted to a confident category -- AST-only
 * hypotheses are preserved as `astHypothesis` for a human/future gate to act on, never as the
 * classification itself.
 */

export type MCPHandlerReconciliationEntryV1 = {
  name: string;
  previousClassification: string;
  classification: MCPHandlerClassificationV1;
  liveOnTrace: boolean;
  astHypothesis: string;
  reason: string;
};

const PREVIOUS_UNLISTED: ReadonlyArray<{ name: string; previousClassification: string; astHypothesis: string }> = [
  { name: 'identity:quarantine', previousClassification: 'PRIVATE', astHypothesis: 'INTERNAL_HANDLER' },
  { name: 'identity:recover', previousClassification: 'PRIVATE', astHypothesis: 'INTERNAL_HANDLER' },
  { name: 'envelope:validate', previousClassification: 'PRIVATE', astHypothesis: 'INTERNAL_HANDLER' },
  { name: 'mirror:sync_qdrant', previousClassification: 'LEGACY', astHypothesis: 'DEAD_ORPHAN' },
  { name: 'mirror:sync_neo4j', previousClassification: 'LEGACY', astHypothesis: 'DEAD_ORPHAN' },
  { name: 'graph:expand', previousClassification: 'LEGACY', astHypothesis: 'DEAD_ORPHAN' },
  { name: 'retrieval:rerank', previousClassification: 'LEGACY', astHypothesis: 'DEAD_ORPHAN' },
  { name: 'answer:synthesize', previousClassification: 'LEGACY', astHypothesis: 'DEAD_ORPHAN' },
  { name: 'escalation:route', previousClassification: 'PRIVATE', astHypothesis: 'INTERNAL_HANDLER' },
  { name: 'atlas.discover', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.retrieve', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.build_context', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.inspect_runtime', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.apply_change', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.validate_change', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'atlas.delegate', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'LISTING_OMISSION (scanner does not resolve spread array; likely already listed)' },
  { name: 'phase109a_archive_signal', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
  { name: 'phase109a_supersede_signal', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
  { name: 'phase109a_promote_recommendation', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
  { name: 'phase109a_query_signal_history', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
  { name: 'phase109a_validate_state_transition', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
  { name: 'ldr_research', previousClassification: 'DELEGATED_CANONICAL', astHypothesis: 'DEPRECATED_ALIAS candidate' },
];

const PREVIOUS_DUPLICATES: ReadonlyArray<{ name: string; previousClassification: string }> = [
  { name: 'atlas.packet_search', previousClassification: 'ALIAS' },
  { name: 'atlas.coverage', previousClassification: 'ALIAS' },
  { name: 'clusters.get_summary_lenses', previousClassification: 'ALIAS' },
  { name: 'wiki.status', previousClassification: 'ALIAS' },
  { name: 'wiki.search', previousClassification: 'ALIAS' },
  { name: 'wiki.explain_page', previousClassification: 'ALIAS' },
  { name: 'wiki.refresh_directory', previousClassification: 'ALIAS' },
];

/**
 * @param liveTraceToolNames the exact set of tool names discovered live on TRACE this run
 *   (from mcp-tool-surface-live-v1.json's `trace` entry) -- the only server this reconciliation
 *   can independently verify.
 */
export function reconcileMcpHandlerClassificationV1(
  liveTraceToolNames: ReadonlySet<string>,
): MCPHandlerReconciliationEntryV1[] {
  const results: MCPHandlerReconciliationEntryV1[] = [];

  for (const entry of PREVIOUS_UNLISTED) {
    const liveOnTrace = liveTraceToolNames.has(entry.name);
    // A name AST-classified as DELEGATED_CANONICAL that is ALSO confirmed live on TRACE under
    // the identical name is exactly the same shape as this repo's existing ALIAS duplicates --
    // reclassify it that way (DEPRECATED_ALIAS) with real live evidence, not the AST guess alone.
    // Everything else -- where the only evidence is AST, and the AST target server's live status
    // is itself unconfirmed -- stays UNKNOWN, fail-closed, per the operator's instruction.
    const classification: MCPHandlerClassificationV1 = liveOnTrace ? 'DEPRECATED_ALIAS' : 'UNKNOWN';
    results.push({
      name: entry.name,
      previousClassification: entry.previousClassification,
      classification,
      liveOnTrace,
      astHypothesis: entry.astHypothesis,
      reason: liveOnTrace
        ? 'Live tools/list against TRACE confirms this exact name is served there today; treated as a canonical-TRACE / deprecated-alias-elsewhere pair, matching this repo\'s existing ALIAS precedent.'
        : 'Not found in live TRACE discovery. mcp-server.ts (the AST audit\'s target) has no confirmed live launcher in this environment, so the AST-only classification cannot be independently verified -- fail-closed to UNKNOWN rather than trusting AST alone, per this gate\'s live-discovery-first rule.',
    });
  }

  for (const entry of PREVIOUS_DUPLICATES) {
    const liveOnTrace = liveTraceToolNames.has(entry.name);
    results.push({
      name: entry.name,
      previousClassification: entry.previousClassification,
      classification: liveOnTrace ? 'DEPRECATED_ALIAS' : 'UNKNOWN',
      liveOnTrace,
      astHypothesis: 'ALIAS (canonical=trace-mcp-server)',
      reason: liveOnTrace
        ? 'Live tools/list against TRACE confirms this exact name is served there today -- the prior ALIAS classification\'s canonical side is independently verified live.'
        : 'Prior ALIAS classification named TRACE as canonical, but live discovery no longer finds this name on TRACE -- re-flagged UNKNOWN rather than carrying forward a now-unverifiable claim.',
    });
  }

  for (const entry of results) {
    MCPHandlerClassificationV1Schema.parse(entry.classification);
  }
  return results;
}
