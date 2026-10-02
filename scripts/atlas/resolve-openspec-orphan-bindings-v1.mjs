import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_ORPHAN_BINDINGS_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_ORPHAN_BINDINGS_OUTPUT)
  : path.join(REPORTS, 'openspec-orphan-binding-resolution-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function latestReport(name, envName) {
  if (envName && process.env[envName]) return path.resolve(ROOT, process.env[envName]);
  const filePath = path.join(REPORTS, name);
  if (!fs.existsSync(filePath)) throw new Error(`REPORT_NOT_FOUND:${name}`);
  return filePath;
}

function latestCensusPath() {
  if (!process.env.OPENSPEC_CENSUS_PATH) throw new Error('OPENSPEC_CENSUS_PATH_REQUIRED');
  return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
}

function normalize(value) {
  return String(value ?? '').replace(/[`*_()[\]{}:,;]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function claimHash(value) {
  return `sha256:${crypto.createHash('sha256').update(normalize(value), 'utf8').digest('hex')}`;
}

function unique(rows) {
  return [...new Map(rows.map((row) => [row.sourceRef ?? row.taskRef ?? row.canonicalTaskRef, row])).values()];
}

function add(map, key, row) {
  if (!key) return;
  map.set(key, [...(map.get(key) ?? []), row]);
}

function collectFields(value, depth = 0, output = Object.fromEntries([
  ['taskRefs', []], ['canonicalTaskKeys', []], ['taskIds', []], ['claimIds', []], ['migrationKeys', []],
  ['changeIds', []], ['sourceRefs', []], ['evidenceRefs', []], ['gateIds', []], ['claims', []], ['workspaceRevisions', []],
  ['sourceRevisions', []], ['verdicts', []], ['commands', []], ['checksums', []],
])) {
  if (depth > 7 || value === null || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 500)) collectFields(item, depth + 1, output);
    return output;
  }
  const aliases = {
    taskRefs: new Set(['taskref', 'taskrefs', 'openspectaskref', 'taskpath', 'taskreference', 'taskreferences']),
    canonicalTaskKeys: new Set(['canonicaltaskkey', 'canonicaltaskref', 'canonicaltaskkeys']),
    taskIds: new Set(['task', 'taskid', 'taskids', 'taskkey', 'taskkeys', 'selectedtaskkey']),
    claimIds: new Set(['claimid', 'claimids', 'requirementid']),
    migrationKeys: new Set(['migrationkey', 'migrationkeys', 'logicaltaskkey']),
    changeIds: new Set(['changeid', 'change', 'openspecchange']),
    sourceRefs: new Set(['sourceref', 'sourcerefs', 'sourcepath', 'sourcepaths', 'legacysourceref', 'legacysourcerefs', 'canonicalsourceref', 'canonicalsourcerefs']),
    evidenceRefs: new Set(['evidenceref', 'evidencerefs', 'reportref', 'reportrefs', 'receiptref', 'receiptrefs']),
    gateIds: new Set(['gate', 'gateid', 'gateids', 'gatekey', 'predicateid', 'predicateids']),
    claims: new Set(['claim', 'claims', 'tasktext', 'tasktitle']),
    workspaceRevisions: new Set(['workspacerevision', 'workspacerevisions', 'workspace_revision']),
    sourceRevisions: new Set(['sourcerevision', 'sourcerevisions', 'source_revision']),
    verdicts: new Set(['verdict', 'proofstate', 'status']),
    commands: new Set(['command', 'commands', 'verificationcommand', 'testcommand']),
    checksums: new Set(['checksum', 'receiptchecksum']),
  };
  for (const [key, entry] of Object.entries(value).slice(0, 1000)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    for (const [target, names] of Object.entries(aliases)) {
      if (!names.has(normalized)) continue;
      const values = Array.isArray(entry) ? entry : [entry];
      for (const item of values.slice(0, 200)) {
        if (typeof item === 'string' && item.trim()) output[target].push(item.trim());
        else if (item && typeof item === 'object') {
          for (const nested of ['file', 'uri', 'path', 'sourceRef', 'taskRef', 'id', 'value']) if (typeof item[nested] === 'string') output[target].push(item[nested].trim());
        }
      }
    }
    if (entry && typeof entry === 'object') collectFields(entry, depth + 1, output);
  }
  if (depth === 0) for (const key of Object.keys(output)) output[key] = [...new Set(output[key])].slice(0, 200);
  return output;
}

function taskIdentityMap(identityReport) {
  return new Map((identityReport.mappings ?? []).map((mapping) => [mapping.sourceRef, mapping]));
}

function buildIndexes(tasks, identityReport) {
  const mappings = taskIdentityMap(identityReport);
  const indexes = Object.fromEntries(['taskRef', 'canonicalTaskKey', 'taskId', 'declared', 'migration', 'legacy', 'source', 'gate', 'claimHash', 'change', 'allChange'].map((key) => [key, new Map()]));
  for (const task of tasks) {
    const mapping = mappings.get(task.taskRef) ?? {};
    if (task.changeId) add(indexes.allChange, task.changeId, task);
    add(indexes.taskRef, task.taskRef, task);
    add(indexes.taskRef, task.canonicalTaskRef, task);
    if (task.taskId) add(indexes.taskId, task.taskId, task);
    add(indexes.canonicalTaskKey, mapping.canonicalTaskKey, task);
    if (task.taskId) add(indexes.declared, `${task.authorityScope}\0${task.changeId}\0${task.taskId}`, task);
    if (mapping.migrationKey) add(indexes.migration, `${task.authorityScope}\0${mapping.migrationKey}`, task);
    for (const candidate of mapping.legacyCandidates ?? []) add(indexes.legacy, `${task.authorityScope}\0${candidate.value.toUpperCase()}`, task);
    add(indexes.source, task.taskRef, task);
    if (task.changeId && Number.isInteger(task.sourceLine)) {
      add(indexes.legacy, `${task.authorityScope}\0${`${task.changeId}:${task.sourceLine}`.toUpperCase()}`, task);
    }
    for (const token of String(task.taskText).match(/\b(?:[A-Z]{2,}[A-Z0-9]*(?:[-_.][A-Z0-9]+)+|\d+(?:\.\d+)+[a-z]?)\b/g) ?? []) {
      if (/(?:GATE|PREDICATE|REQ|REQUIREMENT|PHASE)/i.test(token)) add(indexes.gate, `${task.authorityScope}\0${token.toUpperCase()}`, task);
    }
    add(indexes.claimHash, `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity?.normalizedClaimHash}`, task);
    add(indexes.change, task.changeId, task);
  }
  return { indexes, mappings };
}

function matchesFor(indexes, key, candidates) {
  return unique(candidates.flatMap((candidate) => indexes[key].get(candidate) ?? []));
}

function isExactTaskSourceReference(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  return /(?:^|\/)(?:sveltekit-frontend\/)?openspec\/changes\/.+\/tasks\.md#L\d+(?:C\d+)?$/i.test(normalized);
}

function hasMultipleTaskReferences(fields) {
  return [fields.taskRefs, fields.canonicalTaskKeys, fields.taskIds].some((values) => new Set(values).size > 1)
    || new Set(fields.changeIds).size > 1
    || fields.sourceRefs.filter(isExactTaskSourceReference).length > 1;
}

function missingBindingReason(fields, indexes) {
  if (fields.taskRefs.length || fields.canonicalTaskKeys.length) return 'UNMATCHED_CANONICAL_TASK_REFERENCE';
  if (fields.taskIds.length) return fields.changeIds.some((changeId) => indexes.allChange.has(changeId))
    ? 'UNMATCHED_TASK_ID_WITHIN_CHANGE'
    : 'EXPLICIT_TASK_TOKEN_INVALID';
  if (fields.migrationKeys.length) return 'UNMATCHED_MIGRATION_KEY';
  if (fields.gateIds.length) return 'UNMATCHED_GATE_ID';
  if (fields.sourceRefs.some(isExactTaskSourceReference)) return 'UNMATCHED_SOURCE_REFERENCE';
  if (fields.evidenceRefs.length) return 'UNRESOLVED_EVIDENCE_ARTIFACT_IDENTITY';
  if (fields.claims.length && fields.changeIds.length) return 'UNMATCHED_CLAIM_HASH_WITHIN_CHANGE';
  if (fields.claimIds.length) return 'UNMATCHED_LEGACY_ALIAS';
  if (fields.changeIds.length) return fields.changeIds.some((changeId) => indexes.allChange.has(changeId))
    ? 'CHANGE_ONLY_NO_TASK_ID'
    : 'EXPLICIT_CHANGE_TOKEN_INVALID';
  return 'NO_SUPPORTED_IDENTITY_HINTS';
}

function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function readArtifactIdentity(ref, root) {
  const normalized = String(ref ?? '').replaceAll('\\', '/').replace(/#.*$/, '').replace(/^\.\//, '');
  if (!/\.(?:json|jsonc)$/i.test(normalized)) return null;
  const filePath = path.resolve(root, normalized);
  if (!pathWithin(root, filePath) || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 1024 * 1024) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { fields: collectFields(parsed), checksum: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}` };
  } catch {
    return null;
  }
}

function explicitArtifactCandidates(fields, indexes) {
  const candidates = [];
  for (const taskRef of fields.taskRefs) candidates.push(...matchesFor(indexes, 'taskRef', [taskRef]));
  for (const key of fields.canonicalTaskKeys) candidates.push(...matchesFor(indexes, 'canonicalTaskKey', [key]));
  for (const changeId of fields.changeIds) {
    for (const taskId of fields.taskIds) {
      for (const [key, rows] of indexes.declared.entries()) if (key.endsWith(`\0${changeId}\0${taskId}`)) candidates.push(...rows);
    }
  }
  if (!candidates.length && fields.taskIds.length === 1 && fields.changeIds.length === 0) {
    for (const [key, rows] of indexes.declared.entries()) if (key.endsWith(`\0${fields.taskIds[0]}`)) candidates.push(...rows);
  }
  return unique(candidates);
}

function sourceReferenceEvidence(receipt, fields, indexes, mappings, root) {
  const dispositions = [];
  const candidates = [];
  let evidenceChecksums = [];
  for (const ref of fields.sourceRefs) {
    if (!isExactTaskSourceReference(ref)) {
      dispositions.push({ sourceRef: ref, disposition: 'UNRESOLVED_SOURCE_REF', taskIdentityMatched: false });
      continue;
    }
    const matchingTasks = matchesFor(indexes, 'taskRef', [String(ref).replaceAll('\\', '/').replace(/^\.\//, '')]);
    const declared = matchingTasks.filter((task) => {
      const mapping = mappings.get(task.taskRef);
      return mapping?.declaredId && mapping?.canonicalKeyAdmitted === true;
    });
    if (declared.length === 1) {
      candidates.push(...declared);
      dispositions.push({ sourceRef: ref, disposition: 'EXACT_TASK_SOURCE_REF', taskIdentityMatched: true, canonicalTaskKey: mappings.get(declared[0].taskRef)?.canonicalTaskKey ?? null });
    } else {
      dispositions.push({ sourceRef: ref, disposition: 'UNRESOLVED_SOURCE_REF', taskIdentityMatched: false, reason: matchingTasks.length ? 'SOURCE_LOCATION_HAS_NO_UNIQUE_ADMITTED_DECLARED_ID' : 'TASK_SOURCE_REF_NOT_FOUND' });
    }
  }
  for (const ref of fields.evidenceRefs) {
    const artifact = readArtifactIdentity(ref, root);
    if (!artifact) {
      dispositions.push({ sourceRef: ref, disposition: 'UNRESOLVED_SOURCE_REF', taskIdentityMatched: false, reason: 'EVIDENCE_ARTIFACT_UNREADABLE_OR_UNSUPPORTED' });
      continue;
    }
    evidenceChecksums.push({ sourceRef: ref, checksum: artifact.checksum });
    const artifactFields = artifact.fields;
    const taskIdentityCount = new Set([...artifactFields.taskRefs, ...artifactFields.canonicalTaskKeys, ...artifactFields.taskIds]).size;
    if (taskIdentityCount > 1) {
      dispositions.push({ sourceRef: ref, disposition: 'MULTI_TASK_ARTIFACT', taskIdentityMatched: false, explicitIdentityCount: taskIdentityCount, checksum: artifact.checksum });
      continue;
    }
    const artifactCandidates = explicitArtifactCandidates(artifactFields, indexes);
    if (artifactCandidates.length === 1) {
      candidates.push(...artifactCandidates);
      dispositions.push({ sourceRef: ref, disposition: 'EXACT_EVIDENCE_ARTIFACT', taskIdentityMatched: true, canonicalTaskKey: mappings.get(artifactCandidates[0].taskRef)?.canonicalTaskKey ?? null, checksum: artifact.checksum });
    } else if (artifactCandidates.length > 1) {
      dispositions.push({ sourceRef: ref, disposition: 'MULTI_TASK_ARTIFACT', taskIdentityMatched: false, explicitIdentityCount: artifactCandidates.length, checksum: artifact.checksum });
    } else {
      dispositions.push({ sourceRef: ref, disposition: 'UNRESOLVED_SOURCE_REF', taskIdentityMatched: false, reason: 'ARTIFACT_HAS_NO_UNIQUE_ADMITTED_EXPLICIT_TASK_IDENTITY', checksum: artifact.checksum });
    }
  }
  return { candidates: unique(candidates), dispositions, evidenceChecksums };
}

function resolveOne(receipt, indexes, mappings, census, sourceArtifactRoot) {
  const rawFields = receipt.fields ?? collectFields(receipt);
  const fields = Object.fromEntries([
    ['taskRefs', []], ['canonicalTaskKeys', []], ['taskIds', []], ['claimIds', []], ['migrationKeys', []],
    ['changeIds', []], ['sourceRefs', []], ['evidenceRefs', []], ['gateIds', []], ['claims', []], ['workspaceRevisions', []],
    ['sourceRevisions', []], ['verdicts', []], ['commands', []], ['checksums', []],
  ].map(([key, fallback]) => [key, Array.isArray(rawFields[key]) ? rawFields[key] : fallback]));
  const authority = fields.sourceRefs.find((value) => value.replaceAll('\\', '/').startsWith('sveltekit-frontend/openspec/')) ? 'openspec://frontend' : fields.sourceRefs.some((value) => value.replaceAll('\\', '/').startsWith('openspec/')) ? 'openspec://root' : null;
  const scoped = (value) => authority ? `${authority}\0${value}` : value;
  const canonicalTaskRefs = fields.taskIds.filter((taskId) => taskId.startsWith('openspec-task:') || taskId.startsWith('openspec://'));
  const sourceEvidence = sourceReferenceEvidence(receipt, fields, indexes, mappings, sourceArtifactRoot);
  const strategies = [
    ['EXACT_TASK_REF', matchesFor(indexes, 'taskRef', [...fields.taskRefs, ...canonicalTaskRefs])],
    ['CANONICAL_TASK_KEY', matchesFor(indexes, 'canonicalTaskKey', fields.canonicalTaskKeys)],
    ['DECLARED_ID_CHANGE', unique(fields.changeIds.flatMap((changeId) => fields.taskIds.flatMap((taskId) => {
      const candidates = authority ? [indexes.declared.get(`${authority}\0${changeId}\0${taskId}`)] : [...indexes.declared.entries()].filter(([key]) => key.endsWith(`\0${changeId}\0${taskId}`)).map(([, rows]) => rows);
      return candidates.flat().filter(Boolean);
    })))],
    ['EXPLICIT_TASK_ID', matchesFor(indexes, 'taskId', fields.taskIds.filter((taskId) => !taskId.includes(':')))],
    ['EXACT_TASK_SOURCE_REF', sourceEvidence.candidates.filter((task) => sourceEvidence.dispositions.some((entry) => entry.disposition === 'EXACT_TASK_SOURCE_REF' && entry.canonicalTaskKey === mappings.get(task.taskRef)?.canonicalTaskKey))],
    ['EXACT_EVIDENCE_ARTIFACT', sourceEvidence.candidates.filter((task) => sourceEvidence.dispositions.some((entry) => entry.disposition === 'EXACT_EVIDENCE_ARTIFACT' && entry.canonicalTaskKey === mappings.get(task.taskRef)?.canonicalTaskKey))],
    ['LEGACY_CHANGE_LINE', unique([...fields.changeIds.flatMap((changeId) => fields.taskIds
      .filter((taskId) => taskId.toUpperCase().startsWith(`${changeId.toUpperCase()}:`))
      .flatMap((taskId) => {
        const normalized = taskId.toUpperCase();
        if (authority) return indexes.legacy.get(scoped(normalized)) ?? [];
        return [...indexes.legacy.entries()].filter(([key]) => key.endsWith(`\0${normalized}`)).flatMap(([, rows]) => rows);
    }))])],
    ['EXACT_GATE_ID_CHANGE', unique(fields.changeIds.flatMap((changeId) => fields.gateIds.flatMap((gateId) => {
      const gateKey = `${gateId.toUpperCase()}`;
      const changeTasks = indexes.allChange.get(changeId) ?? [];
      return changeTasks.filter((task) => {
        if (authority && task.authorityScope !== authority) return false;
        const taskGateKey = `${task.authorityScope}\0${gateKey}`;
        return (indexes.gate.get(taskGateKey) ?? []).some((gateTask) => gateTask.taskRef === task.taskRef);
      });
    })))],
  ];
  for (const [strategy, matches] of strategies) {
    if (matches.length === 1) {
      const task = matches[0];
      const mapping = mappings.get(task.taskRef) ?? {};
      if (mapping.canonicalKeyAdmitted !== true) return {
        uri: receipt.uri,
        evidenceId: receipt.evidenceId ?? fields.claimIds[0] ?? null,
        candidateType: receipt.candidateType ?? null,
        strategy,
        bindingDisposition: 'IDENTITY_QUARANTINED',
        canonicalTaskKey: mapping.canonicalTaskKey ?? task.canonicalTaskRef,
        sourceRef: task.taskRef,
        candidateTaskRefs: [task.taskRef],
        bindingReason: 'TASK_IDENTITY_NOT_ADMITTED',
        revisionStatus: 'UNRESOLVED',
        sourceReferenceDisposition: sourceEvidence.dispositions,
        artifactChecksums: sourceEvidence.evidenceChecksums,
        proofEligible: false,
      };
      const workspaceRevisions = fields.workspaceRevisions;
      const sourceRevisions = fields.sourceRevisions;
      const revisionStatus = !workspaceRevisions.length || !sourceRevisions.length
        ? 'MISSING_REVISION'
        : workspaceRevisions.includes(census.source?.workspaceRevision) && sourceRevisions.includes(task.taskHash)
          ? 'CURRENT'
          : 'STALE_REVISION';
      return {
        uri: receipt.uri,
        evidenceId: receipt.evidenceId ?? fields.claimIds[0] ?? null,
        candidateType: receipt.candidateType ?? null,
        strategy,
        bindingDisposition: revisionStatus === 'CURRENT' && strategy === 'EXACT_TASK_REF' ? 'EXACT_BOUND' : revisionStatus === 'CURRENT' ? 'LEGACY_BOUND' : revisionStatus,
        canonicalTaskKey: mapping.canonicalTaskKey ?? task.canonicalTaskRef,
        sourceRef: task.taskRef,
        candidateTaskRefs: [],
        bindingReason: 'DETERMINISTIC_MATCH',
        sourceReferenceDisposition: sourceEvidence.dispositions,
        artifactChecksums: sourceEvidence.evidenceChecksums,
        revisionStatus,
        proofEligible: false,
      };
    }
    if (matches.length > 1) {
      const portfolioLevel = hasMultipleTaskReferences(fields);
      return {
        uri: receipt.uri,
        evidenceId: receipt.evidenceId ?? null,
        candidateType: receipt.candidateType ?? null,
        strategy,
        bindingDisposition: portfolioLevel ? 'PORTFOLIO_LEVEL' : 'AMBIGUOUS',
        bindingReason: portfolioLevel ? 'MULTIPLE_TASK_IDENTITIES_IN_PORTFOLIO_ARTIFACT' : 'MULTIPLE_DETERMINISTIC_MATCHES',
        sourceReferenceDisposition: sourceEvidence.dispositions,
        artifactChecksums: sourceEvidence.evidenceChecksums,
        matchedTaskCount: matches.length,
        canonicalTaskKey: null,
        sourceRef: null,
        candidateTaskRefs: matches.slice(0, 32).map((task) => task.taskRef),
        revisionStatus: 'UNRESOLVED',
        proofEligible: false,
      };
    }
  }
  const filename = String(receipt.fileName ?? receipt.uri).toLowerCase();
  const filenameMatches = unique([...indexes.change.entries()].filter(([changeId]) => filename.includes(changeId.toLowerCase())).flatMap(([, rows]) => rows));
  const hasTaskBindingHints = ['taskRefs', 'canonicalTaskKeys', 'taskIds', 'claimIds', 'migrationKeys', 'changeIds', 'gateIds']
    .some((key) => fields[key].length > 0)
    || (fields.claims.length > 0 && fields.changeIds.length > 0)
    || fields.sourceRefs.some(isExactTaskSourceReference);
  const portfolioLevel = hasMultipleTaskReferences(fields);
  const wholeTasksLedgerReference = fields.sourceRefs.some((value) =>
    /(?:^|\/)(?:sveltekit-frontend\/)?openspec\/changes\/.+\/tasks\.md$/i.test(value.replaceAll('\\', '/').replace(/^\.\//, ''))
  );
  const sourceReferenceOnly = !wholeTasksLedgerReference && sourceEvidence.dispositions.length > 0 && !sourceEvidence.candidates.length;
  const multiTaskSourceArtifact = sourceEvidence.dispositions.some((entry) => entry.disposition === 'MULTI_TASK_ARTIFACT');
  const uniqueChange = fields.changeIds.length === 1
    ? (indexes.allChange.get(fields.changeIds[0]) ?? []).filter((task) => mappings.get(task.taskRef)?.canonicalKeyAdmitted === true)
    : [];
  if (!multiTaskSourceArtifact && !fields.taskIds.length && !fields.taskRefs.length && !fields.canonicalTaskKeys.length && uniqueChange.length === 1) {
    const task = uniqueChange[0];
    const mapping = mappings.get(task.taskRef) ?? {};
    const revisionStatus = !fields.workspaceRevisions.length || !fields.sourceRevisions.length
      ? 'MISSING_REVISION'
      : fields.workspaceRevisions.includes(census.source?.workspaceRevision) && fields.sourceRevisions.includes(task.taskHash)
        ? 'CURRENT'
        : 'STALE_REVISION';
    return {
      uri: receipt.uri,
      evidenceId: receipt.evidenceId ?? fields.claimIds[0] ?? null,
      candidateType: receipt.candidateType ?? null,
      strategy: 'CHANGE_ONLY_UNIQUE_TASK',
      bindingDisposition: revisionStatus === 'CURRENT' ? 'LEGACY_BOUND' : revisionStatus,
      canonicalTaskKey: mapping.canonicalTaskKey ?? task.canonicalTaskRef,
      sourceRef: task.taskRef,
      candidateTaskRefs: [],
      bindingReason: 'UNIQUE_ADMITTED_TASK_IN_EXPLICIT_CHANGE',
      revisionStatus,
      sourceReferenceDisposition: sourceEvidence.dispositions,
      artifactChecksums: sourceEvidence.evidenceChecksums,
      proofEligible: false,
    };
  }
  if (!fields.taskIds.length && !fields.taskRefs.length && !fields.canonicalTaskKeys.length && fields.changeIds.length === 1 && uniqueChange.length > 1) {
    return {
      uri: receipt.uri,
      evidenceId: receipt.evidenceId ?? fields.claimIds[0] ?? null,
      candidateType: receipt.candidateType ?? null,
      strategy: 'CHANGE_ONLY_MULTI_TASK',
      bindingDisposition: 'AMBIGUOUS',
      bindingReason: 'CHANGE_ONLY_REFERENCE_HAS_MULTIPLE_ADMITTED_TASKS',
      canonicalTaskKey: null,
      sourceRef: null,
      candidateTaskRefs: uniqueChange.slice(0, 32).map((task) => task.taskRef),
      revisionStatus: 'UNRESOLVED',
      sourceReferenceDisposition: sourceEvidence.dispositions,
      artifactChecksums: sourceEvidence.evidenceChecksums,
      proofEligible: false,
    };
  }
  const identityCandidateMatches = unique([
    ...matchesFor(indexes, 'migration', fields.migrationKeys.map(scoped)),
    ...matchesFor(indexes, 'gate', fields.gateIds.map((gateId) => scoped(gateId.toUpperCase()))),
    ...unique(fields.claims.flatMap((claim) => fields.changeIds.flatMap((changeId) => {
      const hash = claimHash(claim);
      const keys = authority ? [`${authority}\0${changeId}\0${hash}`] : [...indexes.claimHash.keys()].filter((key) => key.endsWith(`\0${changeId}\0${hash}`));
      return keys.flatMap((key) => indexes.claimHash.get(key) ?? []);
    }))),
  ]);
  const unsupportedIdentityCandidate = fields.migrationKeys.length > 0 || fields.gateIds.length > 0 || fields.claims.length > 0;
  const outsideOpenSpecScope = receipt.scopeDisposition === 'ATLAS_UNSCOPED' && !hasTaskBindingHints && !filenameMatches.length && !sourceReferenceOnly;
  return {
    uri: receipt.uri,
    evidenceId: receipt.evidenceId ?? fields.claimIds[0] ?? null,
    candidateType: receipt.candidateType ?? null,
    strategy: filenameMatches.length ? 'FILENAME_HINT' : null,
    bindingDisposition: filenameMatches.length ? 'HEURISTIC_ONLY' : multiTaskSourceArtifact ? 'AMBIGUOUS' : sourceReferenceOnly || unsupportedIdentityCandidate ? 'CANDIDATE_ONLY' : outsideOpenSpecScope ? 'OUT_OF_SCOPE' : portfolioLevel ? 'PORTFOLIO_LEVEL' : hasTaskBindingHints ? 'MISSING_TASK' : 'TRUE_ORPHAN',
    bindingReason: filenameMatches.length ? 'FILENAME_ONLY_CANDIDATE' : multiTaskSourceArtifact ? 'MULTI_TASK_ARTIFACT' : sourceReferenceOnly ? 'SOURCE_REF_NOT_TASK_IDENTITY' : unsupportedIdentityCandidate ? 'CANDIDATE_IDENTITY_NOT_ADMITTED_FOR_BINDING' : outsideOpenSpecScope ? 'OUTSIDE_OPENSPEC_EVIDENCE_SCOPE' : portfolioLevel ? 'MULTIPLE_TASK_IDENTITIES_IN_PORTFOLIO_ARTIFACT' : missingBindingReason(fields, indexes),
    canonicalTaskKey: null,
    sourceRef: null,
    candidateTaskRefs: unique([...filenameMatches, ...identityCandidateMatches]).slice(0, 32).map((task) => task.taskRef),
    revisionStatus: 'UNRESOLVED',
    sourceReferenceDisposition: sourceEvidence.dispositions,
    artifactChecksums: sourceEvidence.evidenceChecksums,
    proofEligible: false,
  };
}

export function resolveOpenSpecOrphanBindingsV1(census, identityReport, typeReport, options = {}) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const typeByUri = new Map((typeReport?.receipts ?? []).map((receipt) => [receipt.uri, receipt]));
  const inventory = [
    ...(census.evidenceReceipts ?? []).map((receipt) => ({ ...receipt, canonicalSchemaValid: true })),
    ...(census.historicalReceiptCandidates ?? []),
  ].map((receipt) => ({ ...receipt, ...typeByUri.get(receipt.uri) }));
  const { indexes, mappings } = buildIndexes(census.tasks ?? [], identityReport);
  const sourceArtifactRoot = path.resolve(options.sourceArtifactRoot ?? ROOT);
  const bindings = inventory.map((receipt) => resolveOne(receipt, indexes, mappings, census, sourceArtifactRoot));
  const counts = Object.fromEntries([...new Set(bindings.map((binding) => binding.bindingDisposition))].sort().map((state) => [state, bindings.filter((binding) => binding.bindingDisposition === state).length]));
  const bindingReasonCounts = Object.fromEntries([...new Set(bindings.map((binding) => binding.bindingReason).filter(Boolean))].sort().map((reason) => [reason, bindings.filter((binding) => binding.bindingReason === reason).length]));
  const unsigned = {
    schema: 'atlas.openspec-orphan-binding-resolution.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    milestone: 'EVF-03C',
    mode: 'READ_ONLY_RANKED_BINDING_DIAGNOSTIC',
    status: bindings.every((binding) => !['TRUE_ORPHAN', 'MISSING_TASK', 'AMBIGUOUS', 'PORTFOLIO_LEVEL', 'IDENTITY_QUARANTINED', 'CANDIDATE_ONLY', 'HEURISTIC_ONLY'].includes(binding.bindingDisposition)) ? 'ORPHAN_BINDING_COVERAGE_PASS' : 'ORPHAN_BINDING_COVERAGE_NOT_PROVEN',
    source: {
      census: process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json',
      identityRecovery: relative(latestReport('openspec-task-identity-recovery-v1.json', 'OPENSPEC_IDENTITY_RECOVERY_PATH')),
      receiptTypes: relative(latestReport('openspec-receipt-type-classification-v1.json', 'OPENSPEC_RECEIPT_TYPES_PATH')),
      workspaceRevision: census.source?.workspaceRevision ?? null,
    },
    summary: {
      receiptCount: bindings.length,
      bindingDispositionCounts: counts,
      bindingReasonCounts,
      exactBoundCount: bindings.filter((binding) => binding.bindingDisposition === 'EXACT_BOUND').length,
      legacyBoundCount: bindings.filter((binding) => binding.bindingDisposition === 'LEGACY_BOUND').length,
      ambiguousCount: bindings.filter((binding) => binding.bindingDisposition === 'AMBIGUOUS').length,
      portfolioLevelCount: bindings.filter((binding) => binding.bindingDisposition === 'PORTFOLIO_LEVEL').length,
      missingTaskCount: bindings.filter((binding) => binding.bindingDisposition === 'MISSING_TASK').length,
      trueOrphanCount: bindings.filter((binding) => binding.bindingDisposition === 'TRUE_ORPHAN').length,
      outOfScopeCount: bindings.filter((binding) => binding.bindingDisposition === 'OUT_OF_SCOPE').length,
      heuristicOnlyCount: bindings.filter((binding) => binding.bindingDisposition === 'HEURISTIC_ONLY').length,
      candidateOnlyCount: bindings.filter((binding) => binding.bindingDisposition === 'CANDIDATE_ONLY').length,
      quarantinedIdentityCount: bindings.filter((binding) => binding.bindingDisposition === 'IDENTITY_QUARANTINED').length,
      missingRevisionCount: bindings.filter((binding) => binding.bindingDisposition === 'MISSING_REVISION').length,
      staleRevisionCount: bindings.filter((binding) => binding.bindingDisposition === 'STALE_REVISION').length,
      proofEligibleCount: 0,
      writesPerformed: false,
    },
    ranking: ['EXACT_TASK_REF', 'CANONICAL_TASK_KEY', 'EXPLICIT_TASK_ID', 'DECLARED_ID_CHANGE', 'EXACT_TASK_SOURCE_REF', 'EXACT_EVIDENCE_ARTIFACT', 'LEGACY_CHANGE_LINE', 'CHANGE_ONLY_UNIQUE_TASK', 'SOURCE_REF_CANDIDATE', 'MIGRATION_GATE_CLAIM_CANDIDATE', 'FILENAME_HINT'],
    bindings,
    invariants: [
      'Source-reference equality is not task identity; only exact source/artifact references carrying one explicit admitted task identity may resolve. Filename hints remain HEURISTIC_ONLY.',
      'Only admitted canonical task identities may receive bindings; quarantined identities remain diagnostic.',
      'Change-only references resolve only when exactly one admitted task exists in that change.',
      'Unscoped Atlas artifacts remain OUT_OF_SCOPE unless they contain explicit OpenSpec identity fields.',
      'Semantic similarity is not executed and cannot create a task binding or proof.',
      'Portfolio reports referencing multiple task identities remain non-proof candidates until assertions identify each task predicate independently.',
      'Revision status is reported independently from identity binding and proof remains false in this diagnostic.',
    ],
    likely_cause: 'Historical receipts and task ledgers use different identity generations; ranked exact, legacy, source, and claim joins expose recoverable bindings without promoting heuristics.',
    evidence: [process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json', relative(latestReport('openspec-task-identity-recovery-v1.json', 'OPENSPEC_IDENTITY_RECOVERY_PATH')), relative(latestReport('openspec-receipt-type-classification-v1.json', 'OPENSPEC_RECEIPT_TYPES_PATH'))],
    patch_targets: ['scripts/atlas/resolve-openspec-orphan-bindings-v1.mjs'],
    safe_next_command: 'node scripts/atlas/resolve-openspec-orphan-bindings-v1.mjs',
    smoke_command: 'node --check scripts/atlas/resolve-openspec-orphan-bindings-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  const censusPath = latestCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const identityReport = JSON.parse(fs.readFileSync(latestReport('openspec-task-identity-recovery-v1.json', 'OPENSPEC_IDENTITY_RECOVERY_PATH'), 'utf8'));
  const typeReport = JSON.parse(fs.readFileSync(latestReport('openspec-receipt-type-classification-v1.json', 'OPENSPEC_RECEIPT_TYPES_PATH'), 'utf8'));
  const report = resolveOpenSpecOrphanBindingsV1(census, identityReport, typeReport);
  report.source.census = relative(censusPath);
  report.evidence = [relative(censusPath), report.source.identityRecovery, report.source.receiptTypes];
  const { checksum: _checksum, ...unsigned } = report;
  report.checksum = checksum(unsigned);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, summary: report.summary, output: OUTPUT_PATH }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
