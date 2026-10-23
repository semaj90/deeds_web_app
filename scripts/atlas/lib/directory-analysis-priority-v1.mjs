const RULES = Object.freeze({
  WORKTREE_PROFILE_CANDIDATE: 82,
  WORKTREE_AUDIT_ONLY: 54,
  WORKTREE_NOT_PARSER_INPUT: 38,
  REPOSITORY_METADATA: 48,
  DEPENDENCY_TREE: 34,
  GENERATED_OR_BUILD_ARTIFACT: 28,
  MODEL_OR_BINARY_ARTIFACT: 20,
  VIRTUAL_ENVIRONMENT: 12,
  CACHE_OR_TEMP: 8,
  OTHER: 18,
});

export function scoreDirectoryAnalysisPriorityV1(row) {
  if (!row || row.entryKind !== 'FILE' || typeof row.relativePath !== 'string'
    || typeof row.role !== 'string' || typeof row.parserEligibility !== 'string'
    || typeof row.editPolicy !== 'string' || typeof row.dotPath !== 'boolean') {
    throw new TypeError('ANALYSIS_PRIORITY_PATH_ROW_INVALID');
  }

  let score;
  let lane;
  let reasonCode;
  if (row.dotPath || row.editPolicy === 'AUDIT_ONLY_NEVER_EDIT') {
    score = RULES.WORKTREE_AUDIT_ONLY;
    lane = 'AUDIT_METADATA_ONLY';
    reasonCode = row.dotPath ? 'DOT_PATH_AUDIT_ONLY' : 'EDIT_POLICY_AUDIT_ONLY';
  } else if (row.role === 'WORKTREE_FILE' && row.parserEligibility === 'PROFILE_CANDIDATE') {
    score = RULES.WORKTREE_PROFILE_CANDIDATE;
    lane = 'STRUCTURAL_ANALYSIS_CANDIDATE';
    reasonCode = 'PROFILE_MATCH_NOT_PARSER_VALIDATION';
  } else if (row.role === 'WORKTREE_FILE' && row.parserEligibility === 'AUDIT_ONLY') {
    score = RULES.WORKTREE_AUDIT_ONLY;
    lane = 'AUDIT_METADATA_ONLY';
    reasonCode = 'PARSER_AUDIT_ONLY';
  } else if (row.role === 'WORKTREE_FILE' && row.parserEligibility === 'NOT_PARSER_INPUT') {
    score = RULES.WORKTREE_NOT_PARSER_INPUT;
    lane = 'METADATA_OR_DOCUMENT_ANALYSIS';
    reasonCode = 'WORKTREE_NON_PARSER_INPUT';
  } else if (Object.hasOwn(RULES, row.role)) {
    score = RULES[row.role];
    lane = row.role === 'DEPENDENCY_TREE' ? 'PACKAGE_METADATA_SELECTIVE' : 'ROLE_METADATA_ONLY';
    reasonCode = row.role;
  } else {
    score = RULES.OTHER;
    lane = 'REVIEW_ROLE_CLASSIFICATION';
    reasonCode = 'ROLE_NOT_IN_PRIORITY_RULES';
  }

  return Object.freeze({
    analysisPriorityScore: score,
    scoreSemantics: 'RULE_BASED_ANALYSIS_PRIORITY_NOT_PROBABILITY_OR_RELEVANCE_JUDGMENT',
    analysisLane: lane,
    reasonCode,
    sourceAuthority: 'UNQUALIFIED_PATH_METADATA',
    sourceQualified: false,
    editAllowed: false,
  });
}

export const DIRECTORY_ANALYSIS_PRIORITY_RULES_V1 = RULES;
