import { createHash } from 'node:crypto';

export const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
export const normalizePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const toInteger = (value) => Number.isInteger(Number(value)) ? Number(value) : null;

const EXCLUDED = /(^|\/)(node_modules|\.svelte-kit|dist|build|coverage|\.git|\.venv|__pycache__|qdrant-windows|backups?|reports?)(\/|$)|(^|\/)(runtime|storage)(\/|$)|\.(map|lock)$/i;
const FIRST_PARTY = /\.(ts|tsx|svelte)$/i;

export function isTrackedFirstPartySource(sourceRef) {
  return Boolean(sourceRef) && FIRST_PARTY.test(sourceRef) && !EXCLUDED.test(sourceRef);
}

// Real `svelte-check --output machine-verbose` lines are `<epochMs> <jsonPayload>`, NOT a bare
// JSON line -- confirmed live against real svelte-check output (v4.x), not assumed. Plain
// `--output machine` is even further off: it never emits full JSON at all, only a hand-formatted
// `TYPE "file" line:col "message"` string per diagnostic (see MachineFriendlyWriter.file() in
// node_modules/svelte-check/dist/src/index.js). This normalizer previously assumed a bare
// `{filename, start:{line,column}, code, text, severity}` JSON object per line -- a shape that
// never occurs in real output, so EVERY diagnostic line from a real checker run was silently
// misclassified as malformed and captured=0, regardless of how many real errors existed. The
// runner must invoke `--output machine-verbose` (not `machine`) for this parser to see JSON at
// all. Real diagnostic JSON shape: `{type:'ERROR'|'WARNING', filename, start:{line,character},
// end, message, code, codeDescription, source}` -- 0-indexed line/character, `type` not
// `severity`, `character` not `column`, `message` not `text`, numeric `code` for TS diagnostics.
const PROTOCOL_LINE = /^\d+\s+(START|COMPLETED|FAILURE)\b/;
const TIMESTAMPED_JSON_LINE = /^\d+\s+(\{.*\})$/;

export function parseMachineJsonl(inputText, { limit = 100000, workspaceRevision = null, sourceRevision = null } = {}) {
  const errors = [];
  const malformedLines = [];
  const excludedLines = [];
  const protocolLines = [];
  const lines = String(inputText).split(/\r?\n/);
  for (let lineNumber = 0; lineNumber < lines.length && errors.length < limit; lineNumber += 1) {
    const line = lines[lineNumber].trim();
    if (!line) continue;
    if (PROTOCOL_LINE.test(line)) { protocolLines.push(lineNumber + 1); continue; }
    const match = line.match(TIMESTAMPED_JSON_LINE);
    if (!match) { malformedLines.push(lineNumber + 1); continue; }
    let value;
    try { value = JSON.parse(match[1]); } catch { malformedLines.push(lineNumber + 1); continue; }
    if (!value || typeof value !== 'object' || !value.filename || !value.start || !value.type) {
      malformedLines.push(lineNumber + 1);
      continue;
    }
    const file = normalizePath(value.filename);
    if (!isTrackedFirstPartySource(file)) { excludedLines.push(lineNumber + 1); continue; }
    const startLine = toInteger(value.start.line);
    const startCharacter = toInteger(value.start.character);
    const lineValue = startLine === null ? null : startLine + 1;
    const column = startCharacter === null ? null : startCharacter + 1;
    const rawCode = value.code;
    const code = rawCode === undefined || rawCode === null
      ? null
      : typeof rawCode === 'number'
        ? `TS${rawCode}`
        : String(rawCode).trim() || null;
    const message = String(value.message ?? '').trim();
    const severity = value.type === 'WARNING' ? 'warning' : 'error';
    const fingerprintInput = JSON.stringify({ file, line: lineValue, column, code, message, severity });
    errors.push({
      errorId: `tserr:${digest(fingerprintInput).slice(7)}`,
      sourceRef: file,
      line: lineValue,
      column,
      code,
      message,
      severity,
      sourceRevision,
      workspaceRevision,
      evidenceKind: 'SVELTE_CHECK_MACHINE_VERBOSE_JSON',
      evidenceLine: lineNumber + 1,
    });
  }
  return { errors, malformedLines, excludedLines, protocolLines };
}

export function buildEvidenceReport(inputText, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 100000;
  const parsed = parseMachineJsonl(inputText, { ...options, limit });
  const byCode = {};
  const bySeverity = { error: 0, warning: 0 };
  for (const error of parsed.errors) {
    const key = error.code ?? 'UNCODED';
    byCode[key] = (byCode[key] ?? 0) + 1;
    bySeverity[error.severity] += 1;
  }
  return {
    schema: 'atlas.typescript-error-evidence.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_MACHINE_JSONL_CAPTURE',
    input: { artifactChecksum: digest(String(inputText)), limit },
    lineage: { workspaceRevision: options.workspaceRevision ?? null, sourceRevision: options.sourceRevision ?? null },
    errors: parsed.errors,
    summary: {
      captured: parsed.errors.length,
      truncated: parsed.errors.length >= limit,
      malformedLineCount: parsed.malformedLines.length,
      malformedLineNumbers: parsed.malformedLines.slice(0, 100),
      excludedLineCount: parsed.excludedLines.length,
      excludedLineNumbers: parsed.excludedLines.slice(0, 100),
      protocolLineCount: parsed.protocolLines.length,
      byCode,
      bySeverity,
    },
    promotion: { taskCandidateEligible: false, mutationAuthorized: false, governedEventRequired: true, independentValidationRequired: true },
    writesPerformed: false,
    safeToApply: false,
  };
}
