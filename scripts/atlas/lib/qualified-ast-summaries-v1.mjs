import { createHash } from 'node:crypto';
import path from 'node:path';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));

function checkedSourceRef(value) {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value)
    || value.includes('\\') || value.split('/').some((part) => part === '..' || part === '')) {
    throw new TypeError('SOURCE_REF_INVALID');
  }
  return value;
}

function checkedObservation(row, source) {
  const sourceRef = checkedSourceRef(row.source_ref);
  if (!source || row.source_revision !== source.sourceRevision
    || row.workspace_revision !== source.workspaceRevision) throw new Error('AST_SUMMARY_SOURCE_LINEAGE_MISMATCH');
  if (row.canonical_symbol_id != null || row.symbol_version_id != null || row.packet_key != null) {
    throw new Error('AST_SUMMARY_CANONICAL_IDENTITY_OUT_OF_SCOPE');
  }
  if (typeof row.tree_node_occurrence_id !== 'string' || !row.tree_node_occurrence_id
    || typeof row.name !== 'string' || !row.name || typeof row.symbol_kind !== 'string'
    || typeof row.ast_kind !== 'string' || typeof row.language !== 'string') {
    throw new TypeError('AST_SUMMARY_OBSERVATION_INVALID');
  }
  if (!Number.isInteger(row.start_byte) || !Number.isInteger(row.end_byte)
    || row.start_byte < 0 || row.end_byte <= row.start_byte || row.end_byte > source.bytes.length) {
    throw new Error('AST_SUMMARY_SPAN_OUT_OF_BOUNDS');
  }
  try { utf8.decode(source.bytes.subarray(row.start_byte, row.end_byte)); }
  catch { throw new Error('AST_SUMMARY_SPAN_UTF8_INVALID'); }
  return { sourceRef, source };
}

function makeSummary(body) {
  return { ...body, summarySha256: hash(canonical(body)) };
}

export function buildQualifiedAstSummariesV1({ observations, sourceEvidence, sourceSnapshotRevision, parserRevision }) {
  if (!Array.isArray(observations) || observations.length === 0 || !(sourceEvidence instanceof Map)
    || typeof sourceSnapshotRevision !== 'string' || !sourceSnapshotRevision
    || typeof parserRevision !== 'string' || !parserRevision) throw new TypeError('AST_SUMMARY_INPUT_INVALID');

  const seen = new Set();
  const byFile = new Map();
  for (const row of observations) {
    const sourceRef = checkedSourceRef(row?.source_ref);
    const source = sourceEvidence.get(sourceRef);
    const checked = checkedObservation(row, source);
    if (seen.has(row.tree_node_occurrence_id)) throw new Error('AST_SUMMARY_DUPLICATE_OCCURRENCE');
    seen.add(row.tree_node_occurrence_id);
    const rows = byFile.get(sourceRef) ?? [];
    rows.push(row);
    byFile.set(sourceRef, rows);
    if (checked.source.sourceRef && checked.source.sourceRef !== sourceRef) throw new Error('AST_SUMMARY_SOURCE_REF_MISMATCH');
  }

  const fileSummaries = [...byFile.entries()].sort(([left], [right]) => compareUtf8(left, right)).map(([sourceRef, rows]) => {
    const source = sourceEvidence.get(sourceRef);
    const facts = rows.map((row) => ({
      occurrenceId: row.tree_node_occurrence_id,
      language: row.language,
      symbolKind: row.symbol_kind,
      astKind: row.ast_kind,
      name: row.name,
      startByte: row.start_byte,
      endByte: row.end_byte,
      startLine: row.start_line,
      endLine: row.end_line,
    })).sort((left, right) => left.startByte - right.startByte || compareUtf8(left.occurrenceId, right.occurrenceId));
    const input = { sourceRef, sourceRevision: source.sourceRevision, workspaceRevision: source.workspaceRevision,
      sourceSnapshotRevision, parserRevision, observations: facts };
    const summaryText = `Source-only AST observations for ${sourceRef}: ${facts.length} candidates; ${facts.map((fact) => `${fact.symbolKind} ${fact.name} at line ${fact.startLine}`).join('; ')}. Canonical symbol resolution is absent.`;
    return makeSummary({
      sourceRef,
      sourceRevision: source.sourceRevision,
      workspaceRevision: source.workspaceRevision,
      sourceSnapshotRevision,
      parserRevision,
      summaryKind: 'SOURCE_REVISION_QUALIFIED_AST_OBSERVATIONS_ONLY',
      summaryText,
      observationCount: facts.length,
      observations: facts,
      canonicalSymbolResolutionCount: 0,
      inputSha256: hash(canonical(input)),
      unavailableEvidence: ['CANONICAL_SYMBOL_RESOLUTION', 'REVIEWED_DOMAIN_LABELS', 'RUNTIME_CALL_PROOF'],
    });
  });

  const directoryChildren = new Map();
  const ensureDirectory = (directory) => {
    if (!directoryChildren.has(directory)) directoryChildren.set(directory, { files: [], directories: [] });
  };
  for (const summary of fileSummaries) {
    const directory = path.posix.dirname(summary.sourceRef);
    let current = directory;
    while (true) {
      ensureDirectory(current);
      if (current === '.') break;
      const parent = path.posix.dirname(current);
      ensureDirectory(parent);
      directoryChildren.get(parent).directories.push(current);
      current = parent;
    }
    directoryChildren.get(directory).files.push(summary);
  }

  const directorySummaries = [];
  const orderedDirectories = [...directoryChildren.keys()].sort((left, right) => {
    const depth = (value) => value === '.' ? 0 : value.split('/').length;
    return depth(right) - depth(left) || compareUtf8(left, right);
  });
  const summaryByDirectory = new Map();
  for (const directoryPath of orderedDirectories) {
    const children = directoryChildren.get(directoryPath);
    const directFiles = [...new Map(children.files.map((summary) => [summary.sourceRef, summary])).values()]
      .sort((left, right) => compareUtf8(left.sourceRef, right.sourceRef));
    const directDirectories = [...new Set(children.directories)].sort(compareUtf8);
    const childBindings = [
      ...directFiles.map((summary) => ({ child: summary.sourceRef, kind: 'FILE', summarySha256: summary.summarySha256 })),
      ...directDirectories.map((child) => ({ child, kind: 'DIRECTORY', summarySha256: summaryByDirectory.get(child)?.summarySha256 })),
    ].sort((left, right) => compareUtf8(left.kind, right.kind) || compareUtf8(left.child, right.child));
    if (childBindings.some((binding) => !binding.summarySha256)) throw new Error('AST_DIRECTORY_CHILD_SUMMARY_MISSING');
    const input = { directoryPath, childBindings, sourceSnapshotRevision, parserRevision };
    const summary = makeSummary({
      directoryPath,
      sourceSnapshotRevision,
      parserRevision,
      summaryKind: 'HIERARCHICAL_AGGREGATE_OF_QUALIFIED_AST_FILE_SUMMARIES',
      directFileSummaryCount: directFiles.length,
      directDirectorySummaryCount: directDirectories.length,
      descendantFileSummaryCount: directFiles.length + directDirectories.reduce(
        (total, child) => total + summaryByDirectory.get(child).descendantFileSummaryCount, 0),
      childBindings,
      summaryText: `${directoryPath === '.' ? 'Repository root' : `Directory ${directoryPath}`} has ${directFiles.length} direct AST file summaries and ${directDirectories.length} direct child directory summaries; totals are bounded to the admitted AST cohort.`,
      inputSha256: hash(canonical(input)),
      unavailableEvidence: ['UNOBSERVED_FILES', 'CANONICAL_SYMBOL_RESOLUTION', 'REVIEWED_DOMAIN_LABELS'],
    });
    summaryByDirectory.set(directoryPath, summary);
    directorySummaries.push(summary);
  }

  directorySummaries.sort((left, right) => compareUtf8(left.directoryPath, right.directoryPath));
  return { fileSummaries, directorySummaries };
}

export function canonicalAstSummaryJsonV1(value) {
  return canonical(value);
}
