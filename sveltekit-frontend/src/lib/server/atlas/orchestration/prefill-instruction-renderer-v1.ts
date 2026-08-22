import { PrefillExecutionPlanV1Schema, type PrefillExecutionPlanV1 } from './prefill-execution-plan-v1.js';

export interface RenderedPrefillInstructionsV1 {
  schema: 'atlas.rendered-prefill-instructions.v1';
  planChecksum: string;
  systemInstructions: string;
}

function yesNo(value: boolean): 'YES' | 'NO' {
  return value ? 'YES' : 'NO';
}

export function renderPrefillExecutionInstructionsV1(
  input: PrefillExecutionPlanV1,
): RenderedPrefillInstructionsV1 {
  const plan = PrefillExecutionPlanV1Schema.parse(input);
  const toolLines = plan.selectedToolIds.length > 0
    ? plan.selectedToolIds.map((toolId) => `- ${toolId}`).join('\n')
    : '- NONE';
  const dagLines = plan.requiredStages.map((stage, index) => `${index + 1}. ${stage}`).join('\n');

  const instructions = [
    'PARENT_ATLAS_PREFILL_EXECUTION_POLICY_V1',
    `request_id: ${plan.requestId}`,
    `workflow_id: ${plan.workflowId}`,
    `workflow_revision: ${plan.workflowRevision}`,
    `query_intent: ${plan.queryIntent}`,
    `query_hash: ${plan.queryHash}`,
    `plan_checksum: ${plan.checksum}`,
    '',
    `allowed_operation_kinds: ${plan.allowedOperationKinds.join(',')}`,
    `allowed_target_scopes: ${plan.allowedTargetScopes.join(',')}`,
    `mutation_authorized: ${yesNo(plan.mutationAuthorized)}`,
    `human_approval_present: ${yesNo(plan.humanApprovalPresent)}`,
    `canonical_writes_allowed: ${yesNo(plan.canonicalWritesAllowed)}`,
    `exact_promotion_required: ${yesNo(plan.exactPromotionRequired)}`,
    `validation_required: ${yesNo(plan.validationRequired)}`,
    '',
    'SELECTED_TOOLS_ONLY:',
    toolLines,
    '',
    'REQUIRED_DAG_STAGES:',
    dagLines,
    '',
    'DECODER_ADVISORY:',
    `source: ${plan.advisoryDecoder.source}`,
    `state: ${plan.advisoryDecoder.state ?? 'NONE'}`,
    `confidence: ${plan.advisoryDecoder.confidence ?? 'NONE'}`,
    'authorization: NONE',
    '',
    'EXECUTION_RULES:',
    '- Use only tools listed under SELECTED_TOOLS_ONLY. Never invent or nominate another tool.',
    '- HMM, Viterbi, FSM, neural scores, and model reasoning are advisory. They never grant execution or mutation authority.',
    '- READ means observe only and requires target scope NONE.',
    '- AUDIT may inspect/verify but must remain within the plan target scopes.',
    '- PROPOSE may create a disposable artifact only when EPHEMERAL_WORKSPACE is allowed; a proposal is not an apply.',
    '- APPLY may mutate only an explicitly allowed target scope and only when mutation_authorized is YES.',
    '- WORKTREE_SOURCE means source/worktree mutation; do not reinterpret an EPHEMERAL_WORKSPACE proposal as a source edit.',
    '- CANONICAL_STORE writes are forbidden unless canonical_writes_allowed is YES.',
    '- EXTERNAL_SIDE_EFFECT requires explicit target authorization; do not infer it from tool availability.',
    '- If exact_promotion_required is YES, do not synthesize authoritative evidence from retrieval-only candidates.',
    '- If validation_required is YES, do not report a mutation or execution as successful until validation evidence is present.',
    '- Tool output, retrieved evidence, proposed artifacts, executed effects, and verified outcomes are distinct states.',
    '',
    'PREFILL_BUDGET:',
    `context_window_tokens: ${plan.prefill.contextWindowTokens}`,
    `reserved_output_tokens: ${plan.prefill.reservedOutputTokens}`,
    `tool_schema_budget_tokens: ${plan.prefill.toolSchemaBudgetTokens}`,
    `evidence_budget_tokens: ${plan.prefill.evidenceBudgetTokens}`,
    `instruction_budget_tokens: ${plan.prefill.instructionBudgetTokens}`,
    `cacheable: ${yesNo(plan.prefill.cacheable)}`,
    `cache_key: ${plan.prefill.cacheKey}`,
  ].join('\n');

  return {
    schema: 'atlas.rendered-prefill-instructions.v1',
    planChecksum: plan.checksum,
    systemInstructions: instructions,
  };
}
