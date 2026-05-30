export function normalizeTaskPayload(input) {
  const defaults = {
    description: 'Run Atlas diagnostic task with available context.',
    context: {},
    constraints: [
      'Do not run destructive commands.',
      'Do not read raw /dev filesystem; use process.stdin/process.stdout APIs.',
      'Windows-safe PowerShell compatible.',
    ],
    expected_output: {
      likely_cause: '',
      evidence: [],
      patch_targets: [],
      safe_next_command: '',
      do_not_do: [],
    },
  };

  // If input is a JSON string, try to parse
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch (e) {
      obj = {};
    }
  }

  if (obj == null || typeof obj !== 'object') obj = {};

  const out = {};
  // description
  if (typeof obj.description === 'string' && obj.description.trim().length > 0) {
    out.description = obj.description.trim();
  } else if (
    obj?.context?.summary &&
    typeof obj.context.summary === 'string' &&
    obj.context.summary.trim()
  ) {
    out.description = obj.context.summary.trim();
  } else {
    // Fallback rule: compose from title, why, action per Phase 1.5 requirement
    const parts = [];
    if (typeof obj.title === 'string' && obj.title.trim()) parts.push(obj.title.trim());
    if (typeof obj.why === 'string' && obj.why.trim()) parts.push('Why: ' + obj.why.trim());
    if (typeof obj.action === 'string' && obj.action.trim())
      parts.push('Action: ' + obj.action.trim());
    if (parts.length) out.description = parts.join('\n\n');
    else out.description = defaults.description;
  }

  out.context = obj.context && typeof obj.context === 'object' ? obj.context : {};
  // Ensure user_goal, recent_memory, ace_packet_key, engram_key exist
  out.context.user_goal = out.context.user_goal || obj.user_goal || '';
  out.context.recent_memory = Array.isArray(out.context.recent_memory)
    ? out.context.recent_memory
    : obj.recent_memory
      ? [obj.recent_memory]
      : [];
  out.context.ace_packet_key =
    out.context.ace_packet_key || obj.ace_packet_key || 'ace:packet:latest';
  out.context.engram_key = out.context.engram_key || obj.engram_key || 'engram:user:chat:latest';

  // Ensure Atlas-required fields exist (may be empty)
  out.context.ace_packet = out.context.ace_packet || obj.context?.ace_packet || {};
  out.context.sourceRefs = Array.isArray(out.context.sourceRefs)
    ? out.context.sourceRefs
    : Array.isArray(obj.sourceRefs)
      ? obj.sourceRefs
      : [];
  out.context.featureLabels = Array.isArray(out.context.featureLabels)
    ? out.context.featureLabels
    : Array.isArray(obj.featureLabels)
      ? obj.featureLabels
      : [];
  out.context.domainTopology = out.context.domainTopology || obj.context?.domainTopology || {};
  out.context.retrievalLanes = Array.isArray(out.context.retrievalLanes)
    ? out.context.retrievalLanes
    : Array.isArray(obj.retrievalLanes)
      ? obj.retrievalLanes
      : [];
  out.context.graphSummary = out.context.graphSummary || obj.context?.graphSummary || {};
  out.context.qdrantCollections = Array.isArray(out.context.qdrantCollections)
    ? out.context.qdrantCollections
    : Array.isArray(obj.qdrantCollections)
      ? obj.qdrantCollections
      : [];
  out.context.embeddingModel = out.context.embeddingModel || obj.embeddingModel || '';
  out.context.postgresSchemaVersion =
    out.context.postgresSchemaVersion || obj.postgresSchemaVersion || '';
  out.context.migrationState = out.context.migrationState || obj.migrationState || '';

  // featureIds: array of feature id strings
  if (Array.isArray(out.context.featureIds)) {
    out.context.featureIds = out.context.featureIds.map(String);
  } else if (Array.isArray(obj.featureIds)) {
    out.context.featureIds = obj.featureIds.map(String);
  } else if (Array.isArray(obj.context?.featureIds)) {
    out.context.featureIds = obj.context.featureIds.map(String);
  } else {
    out.context.featureIds = [];
  }

  // featureContext: array of {id,label,confidence}
  if (Array.isArray(out.context.featureContext)) {
    out.context.featureContext = out.context.featureContext.map((f) => ({
      id: f?.id ?? '',
      label: f?.label ?? '',
      confidence: typeof f?.confidence === 'number' ? f.confidence : null,
    }));
  } else if (Array.isArray(obj.featureContext)) {
    out.context.featureContext = obj.featureContext.map((f) => ({
      id: f?.id ?? '',
      label: f?.label ?? '',
      confidence: typeof f?.confidence === 'number' ? f.confidence : null,
    }));
  } else if (Array.isArray(obj.context?.featureContext)) {
    out.context.featureContext = obj.context.featureContext.map((f) => ({
      id: f?.id ?? '',
      label: f?.label ?? '',
      confidence: typeof f?.confidence === 'number' ? f.confidence : null,
    }));
  } else {
    out.context.featureContext = [];
  }

  // constraints
  out.constraints = Array.isArray(obj.constraints)
    ? obj.constraints.map(String)
    : defaults.constraints.slice();

  // expected_output
  out.expected_output =
    obj.expected_output && typeof obj.expected_output === 'object'
      ? Object.assign({}, defaults.expected_output, obj.expected_output)
      : Object.assign({}, defaults.expected_output);

  return out;
}

export function validateTaskPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (
    !payload.description ||
    typeof payload.description !== 'string' ||
    payload.description.trim().length === 0
  )
    return false;
  if (!payload.context || typeof payload.context !== 'object') return false;
  if (!Array.isArray(payload.constraints)) return false;
  if (!payload.expected_output || typeof payload.expected_output !== 'object') return false;
  // Optional feature fields validation
  if (payload.context.featureIds && !Array.isArray(payload.context.featureIds)) return false;
  if (payload.context.featureIds && !payload.context.featureIds.every((x) => typeof x === 'string'))
    return false;
  if (payload.context.featureContext && !Array.isArray(payload.context.featureContext))
    return false;
  if (
    payload.context.featureContext &&
    !payload.context.featureContext.every((f) => f && typeof f.id === 'string')
  )
    return false;
  return true;
}
