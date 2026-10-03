import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const censusPath = process.env.OPENSPEC_CENSUS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
const outputPath = process.env.OPENSPEC_LANGEXTRACT_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_LANGEXTRACT_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-langextract-proposals-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const limit = Math.max(1, Math.min(128, Number(process.env.OPENSPEC_LANGEXTRACT_LIMIT ?? 64)));
const runSidecar = process.env.OPENSPEC_LANGEXTRACT_RUN === '1';
const timeoutMs = Math.max(1000, Number(process.env.OPENSPEC_LANGEXTRACT_TIMEOUT_MS ?? 30000));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checksum(value) {
  return `sha256:${digest(canonicalJson(value))}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`MISSING_CENSUS:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSource(task) {
  const sourcePath = path.resolve(ROOT, task.tasksPath);
  if (!fs.existsSync(sourcePath)) return { sourcePath, source: null, sourceRevision: null, sourceSpan: null };
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sourceRevision = `sha256:${digest(source)}`;
  const lines = source.split(/\r?\n/);
  const lineIndex = Math.max(0, Number(task.sourceLine ?? 1) - 1);
  const startChar = lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0);
  const text = lines[lineIndex] ?? task.taskText ?? '';
  return { sourcePath, source, sourceRevision, sourceSpan: { startChar, endChar: startChar + text.length, text } };
}

function selectTasks(census) {
  const candidates = census.tasks.filter((task) => {
    const unresolved = task.taskIdStatus !== 'STABLE'
      || task.unresolvedDependencies?.length
      || task.ambiguousDependencies?.length
      || task.declaredChecked === true;
    return unresolved;
  });
  return candidates.sort((left, right) => {
    const score = (task) => (task.ambiguousDependencies?.length ? 4 : 0)
      + (task.unresolvedDependencies?.length ? 3 : 0)
      + (task.taskIdStatus !== 'STABLE' ? 2 : 0)
      + (task.declaredChecked ? 1 : 0);
    return score(right) - score(left) || String(left.taskRef).localeCompare(String(right.taskRef));
  }).slice(0, limit);
}

async function healthCheck() {
  const response = await fetch(`${sidecarUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, httpStatus: response.status, payload };
}

async function extract(task, sourceInfo) {
  const response = await fetch(`${sidecarUrl}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      source_type: 'plain_text',
      source_ref: `${task.tasksPath}#L${task.sourceLine}`,
      source_revision: sourceInfo.sourceRevision,
      language: 'markdown',
      text: sourceInfo.sourceSpan.text,
      extraction_mode: 'concepts',
      grounded_extraction_required: true,
      passes: ['grounded'],
      max_chars: sourceInfo.sourceSpan.text.length,
      document_id: task.canonicalTaskRef ?? task.taskRef,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SIDECAR_EXTRACT_HTTP_${response.status}:${JSON.stringify(payload).slice(0, 500)}`);
  const grounded = Array.isArray(payload.metadata?.grounded_extractions) ? payload.metadata.grounded_extractions : [];
  const sourceSpan = sourceInfo.sourceSpan;
  const proposals = grounded.map((item, index) => {
    const start = Number(item.char_interval?.start_pos ?? item.start_char);
    const end = Number(item.char_interval?.end_pos ?? item.end_char);
    const exact = Number.isInteger(start) && Number.isInteger(end) && sourceSpan.text.slice(start, end) === (item.extraction_text ?? item.text);
    return {
      proposalId: `openspec-langextract:${digest(`${task.taskRef}|${index}|${item.extraction_text ?? item.text ?? ''}`).slice(0, 32)}`,
      taskRef: task.taskRef,
      taskId: task.canonicalTaskRef ?? null,
      proposalType: 'LANGEXTRACT_CANDIDATE',
      value: item.extraction_text ?? item.text ?? null,
      sourceRef: `${task.tasksPath}#L${task.sourceLine}`,
      sourceRevision: sourceInfo.sourceRevision,
      sourceSpan: exact ? { startChar: sourceSpan.startChar + start, endChar: sourceSpan.startChar + end, text: sourceSpan.text.slice(start, end) } : null,
      exactGrounding: exact,
      providerRevision: payload.metadata?.provider_revision ?? null,
      modelId: payload.metadata?.model_id ?? null,
      canonicalAdmission: false,
      proofPromotion: false,
      taskMutation: false,
    };
  });
  return {
    taskRef: task.taskRef,
    sourceRevision: sourceInfo.sourceRevision,
    httpStatus: response.status,
    providerRevision: payload.metadata?.provider_revision ?? null,
    groundedExtractionUsed: payload.metadata?.grounded_extraction_used === true,
    proposals,
  };
}

async function main() {
  const census = readJson(censusPath);
  if (census.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const selected = selectTasks(census);
  const sourceWindows = selected.map((task) => {
    const sourceInfo = readSource(task);
    return {
      taskRef: task.taskRef,
      taskId: task.canonicalTaskRef ?? null,
      selectionReasons: [
        ...(task.taskIdStatus !== 'STABLE' ? ['TASK_ID_UNRESOLVED'] : []),
        ...(task.unresolvedDependencies?.length ? ['DEPENDENCY_UNRESOLVED'] : []),
        ...(task.ambiguousDependencies?.length ? ['DEPENDENCY_AMBIGUOUS'] : []),
        ...(task.declaredChecked === true ? ['CHECKED_CLAIM_REQUIRES_GROUNDING'] : []),
      ],
      sourceRef: `${task.tasksPath}#L${task.sourceLine}`,
      sourceRevision: sourceInfo.sourceRevision,
      sourceSpan: sourceInfo.sourceSpan,
      sourceExists: Boolean(sourceInfo.source),
      sourceRevisionMatchesBytes: Boolean(sourceInfo.sourceRevision),
    };
  });
  let health = null;
  let extraction = [];
  let errors = [];
  if (runSidecar) {
    try {
      health = await healthCheck();
      if (!health.ok) throw new Error(`SIDECAR_HEALTH_HTTP_${health.httpStatus}`);
      for (const task of selected) {
        try {
          const sourceInfo = readSource(task);
          if (!sourceInfo.source) throw new Error('TASK_SOURCE_MISSING');
          extraction.push(await extract(task, sourceInfo));
        } catch (error) {
          errors.push({ taskRef: task.taskRef, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      errors.push({ scope: 'sidecar', error: error instanceof Error ? error.message : String(error) });
    }
  }
  const proposals = extraction.flatMap((item) => item.proposals ?? []);
  const unsigned = {
    schema: 'atlas.openspec-langextract-proposals.v1',
    mode: runSidecar ? 'READ_ONLY_SIDECAR_PROBE' : 'READ_ONLY_PROPOSAL_INPUT_PLAN',
    status: runSidecar && health?.ok && errors.length === 0 ? 'PROPOSALS_CAPTURED_NOT_ADMITTED' : runSidecar ? 'SIDECAR_NOT_PROVEN' : 'SIDECAR_NOT_REQUESTED',
    source: { census: relative(censusPath), workspaceRevision: census.source?.workspaceRevision ?? null },
    selection: { limit, selectedTaskCount: selected.length, selectedTaskRefs: selected.map((task) => task.taskRef) },
    sourceWindows,
    sidecar: { url: sidecarUrl, endpoint: '/extract', health, requested: runSidecar, timeoutMs },
    extraction,
    proposals,
    errors,
    policy: {
      proposalOnly: true,
      canonicalAdmission: false,
      proofPromotion: false,
      checkboxMutation: false,
      heuristicMatchCountsAsProof: false,
      sourceSpanRequired: true,
      existingNlpSidecarAuthority: 'observation-only; no task identity or proof state ownership',
    },
    writesPerformed: false,
    likely_cause: 'Unresolved OpenSpec prose and legacy structures need grounded observation without allowing NLP output to create identity or proof.',
    evidence: [relative(censusPath), 'scripts/atlas/audit-langextract-grounding-v1.mjs', 'ATLAS_NLP_SIDECAR_URL'],
    patch_targets: ['scripts/atlas/propose-openspec-langextract-candidates-v1.mjs'],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-ledger-import-v1.mjs',
    smoke_command: 'node --check scripts/atlas/propose-openspec-langextract-candidates-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, selectedTaskCount: selected.length, proposalCount: proposals.length, errors: errors.length, writesPerformed: report.writesPerformed, output: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
