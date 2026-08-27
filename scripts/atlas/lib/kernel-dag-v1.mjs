import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

const CANDIDATE_SCHEMA = 'atlas.kernel-dag-candidate.v1';
const RECEIPT_SCHEMA = 'atlas.kernel-dag-validation-receipt.v1';

function candidatePayload(candidate) {
  const { checksum: _checksum, ...payload } = candidate;
  return payload;
}

export function candidateChecksum(candidate) {
  return sha256(candidatePayload(candidate));
}

export function buildKernelDagCandidate(input) {
  const candidate = {
    schema: CANDIDATE_SCHEMA,
    kernelRevision: input.kernelRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    semanticRevision: input.semanticRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    nodes: [...(input.nodes ?? [])].map((node) => ({
      nodeId: node.nodeId,
      functionId: node.functionId,
      arguments: node.arguments ?? {},
      candidateOrdinals: [...(node.candidateOrdinals ?? [])].sort((a, b) => a - b),
      graphNodeOrdinals: [...(node.graphNodeOrdinals ?? [])].sort((a, b) => a - b),
      relationIds: [...(node.relationIds ?? [])].sort(),
      evidenceRefs: [...(node.evidenceRefs ?? [])].sort(),
    })).sort((a, b) => String(a.nodeId).localeCompare(String(b.nodeId))),
    edges: [...(input.edges ?? [])].map((edge) => ({ from: edge.from, to: edge.to })).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
    decoderRevision: input.decoderRevision,
    canonicalAuthority: false,
    executable: false,
  };
  return { ...candidate, checksum: candidateChecksum(candidate) };
}

function addTypeFailure(failures, path, expected, actual) {
  failures.push(`${path}:expected_${expected}:actual_${actual}`);
}

function validateSchema(value, schema, path, failures) {
  if (!schema) return;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      addTypeFailure(failures, path, 'object', Array.isArray(value) ? 'array' : typeof value);
      return;
    }
    for (const key of schema.required ?? []) if (!(key in value)) failures.push(`${path}.${key}:required`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (key in value) validateSchema(value[key], child, `${path}.${key}`, failures);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) addTypeFailure(failures, path, 'array', typeof value);
    else for (let i = 0; i < value.length; i += 1) validateSchema(value[i], schema.items, `${path}[${i}]`, failures);
    return;
  }
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type === 'integer' && (!Number.isInteger(value))) addTypeFailure(failures, path, 'integer', actual);
  else if (schema.type && schema.type !== 'integer' && actual !== schema.type) addTypeFailure(failures, path, schema.type, actual);
}

function detectCycle(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.nodeId));
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const outgoing = new Map([...ids].map((id) => [id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge.to);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    for (const target of outgoing.get(id).sort()) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
    queue.sort();
  }
  return visited !== ids.size;
}

function unique(values) { return [...new Set(values)]; }

export function validateKernelDagCandidate({ candidate, kernel, runtime, policy, ordinalMap, graphOrdinalMap, validatorRevision = 'atlas.kernel-dag-validator.v1' }) {
  const unknownFunctions = [];
  const rejectedRelations = [];
  const argumentSchemaFailures = [];
  const argumentIdentityFailures = [];
  const missingEvidence = [];
  const revisionMismatches = [];
  const unauthorizedMutations = [];
  const missingValidators = [];
  const runtimeCapabilitiesMissing = [];
  const resourceBudgetExceeded = [];
  const nodes = Array.isArray(candidate?.nodes) ? candidate.nodes : [];
  const edges = Array.isArray(candidate?.edges) ? candidate.edges : [];
  const functions = new Map((kernel?.functions ?? []).map((fn) => [fn.functionId, fn]));
  const relations = new Map((kernel?.relations ?? []).map((relation) => [relation.relationId, relation]));
  const available = new Set(runtime?.availableFunctionIds ?? []);
  const permissions = new Set(policy?.permissions ?? []);
  const allowedMutations = new Set(policy?.allowedMutationClasses ?? ['READ']);
  const expected = {
    kernelRevision: kernel?.kernelRevision,
    workspaceRevision: kernel?.workspaceRevision ?? candidate?.workspaceRevision,
    graphRevision: kernel?.graphRevision ?? candidate?.graphRevision,
    semanticRevision: kernel?.semanticRevision ?? candidate?.semanticRevision,
    candidateSnapshotRevision: ordinalMap?.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap?.ordinalMapChecksum,
  };
  for (const field of ['kernelRevision', 'workspaceRevision', 'graphRevision', 'semanticRevision', 'candidateSnapshotRevision', 'ordinalMapChecksum']) {
    if (expected[field] != null && candidate?.[field] !== expected[field]) revisionMismatches.push(field);
  }
  if (!candidate || candidate.schema !== CANDIDATE_SCHEMA) revisionMismatches.push('schema');
  if (candidate?.canonicalAuthority !== false) revisionMismatches.push('canonicalAuthority');
  if (candidate?.executable !== false) revisionMismatches.push('executable');
  if (candidate?.checksum !== candidateChecksum(candidate)) revisionMismatches.push('candidateChecksum');

  const nodeIds = new Set();
  let totalCost = 0;
  for (const node of nodes) {
    if (nodeIds.has(node.nodeId)) revisionMismatches.push(`duplicateNode:${node.nodeId}`);
    nodeIds.add(node.nodeId);
    const fn = functions.get(node.functionId);
    if (!fn) unknownFunctions.push(node.functionId);
    else {
      validateSchema(node.arguments, fn.argumentSchema, `nodes.${node.nodeId}.arguments`, argumentSchemaFailures);
      if (fn.requiredPermission && !permissions.has(fn.requiredPermission)) unauthorizedMutations.push(`${node.nodeId}:${fn.requiredPermission}`);
      if (!allowedMutations.has(fn.mutationClass ?? 'READ')) unauthorizedMutations.push(`${node.nodeId}:${fn.mutationClass ?? 'READ'}`);
      for (const validator of fn.requiredValidators ?? []) if (!(kernel.validators ?? []).includes(validator)) missingValidators.push(`${node.nodeId}:${validator}`);
      if (!available.has(node.functionId)) runtimeCapabilitiesMissing.push(node.functionId);
      totalCost += Number(fn.cost ?? 1);
    }
    if (!Array.isArray(node.evidenceRefs) || node.evidenceRefs.length === 0) missingEvidence.push(node.nodeId);
    for (const ordinal of node.candidateOrdinals ?? []) {
      if (!Number.isInteger(ordinal) || !ordinalMap?.ordinals?.includes(ordinal)) argumentIdentityFailures.push(`${node.nodeId}:candidate:${ordinal}`);
    }
    for (const ordinal of node.graphNodeOrdinals ?? []) {
      if (!Number.isInteger(ordinal) || !graphOrdinalMap?.ordinals?.includes(ordinal)) argumentIdentityFailures.push(`${node.nodeId}:graph:${ordinal}`);
    }
    for (const relationId of node.relationIds ?? []) if (!relations.has(relationId)) rejectedRelations.push(relationId);
  }
  const cycleDetected = detectCycle(nodes, edges);
  const maxNodes = policy?.resourceBudget?.maxNodes ?? Infinity;
  const maxCost = policy?.resourceBudget?.maxCost ?? Infinity;
  if (nodes.length > maxNodes) resourceBudgetExceeded.push(`nodes:${nodes.length}>${maxNodes}`);
  if (totalCost > maxCost) resourceBudgetExceeded.push(`cost:${totalCost}>${maxCost}`);
  const status = [unknownFunctions, rejectedRelations, argumentSchemaFailures, argumentIdentityFailures, missingEvidence, revisionMismatches, unauthorizedMutations, missingValidators, runtimeCapabilitiesMissing, resourceBudgetExceeded].some((items) => items.length) || cycleDetected ? 'REJECTED' : 'ACCEPTED';
  const receiptBase = {
    schema: RECEIPT_SCHEMA,
    candidateChecksum: candidate?.checksum ?? null,
    kernelRevision: kernel?.kernelRevision ?? null,
    kernelChecksum: kernel?.kernelChecksum ?? null,
    validatorRevision,
    workspaceRevision: candidate?.workspaceRevision ?? null,
    graphRevision: candidate?.graphRevision ?? null,
    semanticRevision: candidate?.semanticRevision ?? null,
    candidateSnapshotRevision: candidate?.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: candidate?.ordinalMapChecksum ?? null,
    runtimeCapabilityRevision: runtime?.runtimeCapabilityRevision ?? null,
    permissionPolicyRevision: policy?.permissionPolicyRevision ?? null,
    resourceBudgetRevision: policy?.resourceBudgetRevision ?? null,
    status,
    unknownFunctions: unique(unknownFunctions),
    rejectedRelations: unique(rejectedRelations),
    cycleDetected,
    argumentSchemaFailures,
    argumentIdentityFailures,
    missingEvidence,
    revisionMismatches: unique(revisionMismatches),
    unauthorizedMutations: unique(unauthorizedMutations),
    missingValidators: unique(missingValidators),
    runtimeCapabilitiesMissing: unique(runtimeCapabilitiesMissing),
    resourceBudgetExceeded,
    validatedDagChecksum: status === 'ACCEPTED' ? sha256({ candidateChecksum: candidate.checksum, kernelChecksum: kernel.kernelChecksum, validatorRevision }) : null,
  };
  return receiptBase;
}

export function toTypedRepairDag(candidate, receipt) {
  if (receipt?.schema !== RECEIPT_SCHEMA || receipt.status !== 'ACCEPTED' || !receipt.validatedDagChecksum) throw new Error('TYPED_REPAIR_DAG_REQUIRES_ACCEPTED_VALIDATION');
  return { ...candidate, schema: 'atlas.typed-repair-dag.v1', executable: true, canonicalAuthority: false, validationReceiptChecksum: sha256(receipt) };
}
