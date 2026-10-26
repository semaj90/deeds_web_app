/**
 * REPAIR_LUT_01 Diagnostic to Tool to Rule Look-Up Table (v1)
 *
 * Deterministic router for compiler diagnostics (TypeScript errors, test failures,
 * historical chunk mismatches) to repair rules and required read-only tools.
 *
 * Three core outcomes:
 * - PROPOSE_PATCH (when deterministic rule and source qualification succeed)
 * - NEEDS_EVIDENCE (when required read-only tools or source bindings are incomplete)
 * - BLOCKED / ABSTAIN (when authority is missing, chunk is historical, or fix is unsafe)
 * - MODEL_PROPOSAL (opt-in escalation only when deterministic rule cannot resolve)
 *
 * Invariants:
 * - admissionAuthorized: false
 * - writesPerformed: false
 * - mutationAllowed: false
 */

export const REPAIR_LUT_RULES = {
  TS2307: {
    code: 'TS2307',
    description: 'Cannot find module or its corresponding type declarations',
    initialTools: ['rg', 'lsp_definitions', 'tsconfig_check'],
    strategy: 'RESOLVE_MODULE_PATH_AND_MODE',
    requiresSourceQualification: true,
  },
  TS2304: {
    code: 'TS2304',
    description: 'Cannot find name',
    initialTools: ['ast_scope', 'lsp_symbols'],
    strategy: 'IDENTIFY_MISSING_IMPORT_OR_DECLARATION',
    requiresSourceQualification: true,
  },
  TS2345: {
    code: 'TS2345',
    description: 'Argument type mismatch',
    initialTools: ['typescript_checker', 'ts_morph_signature'],
    strategy: 'FIND_COMPATIBLE_TYPE_SIGNATURE',
    requiresSourceQualification: true,
  },
  TS6133: {
    code: 'TS6133',
    description: 'Unused declaration',
    initialTools: ['ts_morph_references'],
    strategy: 'PROPOSE_SAFE_REMOVAL',
    requiresSourceQualification: true,
  },
  MISSING_STUB: {
    code: 'MISSING_STUB',
    description: 'Function body is an unapproved stub or placeholder',
    initialTools: ['ast_grep', 'ts_morph'],
    strategy: 'GENERATE_TYPED_STUB_PROPOSAL',
    requiresSourceQualification: true,
  },
  HISTORICAL_CHUNK_MISMATCH: {
    code: 'HISTORICAL_CHUNK_MISMATCH',
    description: 'Stored chunk body matches older revision instead of current source',
    initialTools: ['historical_chunk_resolver_v2'],
    strategy: 'BLOCK_CURRENT_SOURCE_EDITS',
    requiresSourceQualification: false,
  },
  MISSING_SOURCE_BINDING: {
    code: 'MISSING_SOURCE_BINDING',
    description: 'Canonical source resolver cannot bind sourceRef to workspace',
    initialTools: ['canonical_source_resolver'],
    strategy: 'ABSTAIN_CANNOT_SYNTHESIZE_AUTHORITY',
    requiresSourceQualification: false,
  },
};

/**
 * Pure LUT Dispatcher.
 *
 * @param {Object} input
 * @param {string} input.diagnosticCode - e.g. "TS2307", "HISTORICAL_CHUNK_MISMATCH"
 * @param {boolean} input.sourceQualified - whether exact UTF-8 bytes & revision are proven current
 * @param {boolean} input.isHistoricalChunk - true if chunk body is from older revision
 * @param {string|null} [input.ruleId] - explicitly registered rule ID if known
 * @param {string|null} [input.targetFile] - target file path
 * @returns {Object} RepairDecision
 */
export function dispatchDiagnosticToRepair(input) {
  const { diagnosticCode, sourceQualified, isHistoricalChunk, ruleId, targetFile } = input;

  // 1. Guard against stale / historical chunks
  if (isHistoricalChunk || diagnosticCode === 'HISTORICAL_CHUNK_MISMATCH') {
    return {
      kind: 'BLOCKED',
      reason: 'HISTORICAL_CHUNK_MISMATCH: Stale revision bytes cannot be used for current code repair',
      toolsSuggested: ['historical_chunk_resolver_v2'],
    };
  }

  // 2. Guard against missing authority / missing source binding
  if (diagnosticCode === 'MISSING_SOURCE_BINDING') {
    return {
      kind: 'BLOCKED',
      reason: 'ABSTAIN: Cannot synthesize canonical authority for unbound sourceRef',
      toolsSuggested: ['canonical_source_resolver'],
    };
  }

  const registered = REPAIR_LUT_RULES[diagnosticCode];
  if (!registered) {
    return {
      kind: 'BLOCKED',
      reason: `NO_SUPPORTED_REPAIR_RULE: Unrecognized diagnostic code ${diagnosticCode}`,
      toolsSuggested: [],
    };
  }

  // 3. Require source qualification before proposing any deterministic patch
  if (registered.requiresSourceQualification && !sourceQualified) {
    return {
      kind: 'NEEDS_EVIDENCE',
      missing: 'CURRENT_SOURCE_QUALIFICATION: Exact UTF-8 bytes and current source revision unverified',
      requiredTools: registered.initialTools,
    };
  }

  // 4. If rule ID is verified and source is qualified: Propose Deterministic Patch
  if (ruleId) {
    return {
      kind: 'DETERMINISTIC_PATCH',
      ruleId,
      targetFile: targetFile ?? 'UNKNOWN_TARGET',
      strategy: registered.strategy,
      explanation: `Deterministic repair rule ${ruleId} matched for ${diagnosticCode} with verified source qualification.`,
      mutationAllowed: false,
    };
  }

  // 5. If TS diagnostic is recognized but no deterministic rule exists: Model proposal escalation
  if (diagnosticCode.startsWith('TS')) {
    return {
      kind: 'MODEL_PROPOSAL',
      capability: 'typescript_diagnostic_repair',
      diagnosticCode,
      strategy: registered.strategy,
      note: 'Deterministic rule unavailable; proposal requires source preimage check and test runner validation.',
    };
  }

  return {
    kind: 'BLOCKED',
    reason: `ABSTAIN: Rule resolution inconclusive for ${diagnosticCode}`,
    toolsSuggested: registered.initialTools,
  };
}
