/**
 * Shared summary-quality owner (three responsibilities, no I/O):
 *   sanitizeTransportMarkersV1()      remove ONLY transport/control tokens that are safe to drop
 *   analyzeSummaryContaminationV1()   reasoning leak, echoed prompt scaffold, placeholder/meta patterns
 *   evaluateSummaryAdmissionV1()      lineage + digest + quality -> ADMITTED | BLOCKED_*
 *
 * Reasoning text is NEVER "repaired" here: content inside a thought block is not a summary. Admission does not
 * sanitize; a contaminated summary is BLOCKED and a caller may sanitize and re-evaluate explicitly.
 * `sanitizeGemma4Summary` (gemma4-summary-sanitizer.mjs) stays a compatibility wrapper for legacy callers.
 */
import { createHash } from 'node:crypto';
import { hasGemma4ReasoningLeak } from './gemma4-summary-sanitizer.mjs';

const TRANSPORT_TOKEN_RE = /<\|?\s*(?:start_of_turn|end_of_turn|bos|eos|message|end|start)\s*\|?>|<\s*(?:start|end)\s+of\s+turn\s*>/gi;
const CONTROL_TOKEN_TEST_RE = /<\|?\s*(?:start_of_turn|end_of_turn|bos|eos|message|end|start|channel)\s*\|?>|<\|channel\>|<channel\|>|<\|endthinking\|?>|<\s*(?:start|end)\s+of\s+turn\s*>/i;

// Echoed few-shot / instruction scaffold (found in ~88% of the 2026-07-04 spool file)
const SCAFFOLD_PATTERNS = [
  /Example of a good summary/i,
  /\*\*\s*Your turn\s*:?\s*\*\*/i,
  /\bYour turn\s*:/i,
  /\bExample\s+\d+\s*\(/i,
  /\bHow would you describe\b/i,
  /^\s*---\s*$/m,
  /^\s*(the\s+)?(request|task)\s+is\s+to\s+summari[sz]e\b/i,
  /\bFeature:\s*\S[\s\S]{0,200}\bSource:\s*\S/i,
  /\bwrite\s+(one|a)\s+concise\s+(final\s+)?summary\s+sentence\b/i,
];

const PLACEHOLDER_RE = /\b(todo|fixme|placeholder|lorem ipsum|tbd)\b/i;

export function sha256Text(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

export function sanitizeTransportMarkersV1(value) {
  const raw = String(value ?? '');
  const text = raw.replace(TRANSPORT_TOKEN_RE, '').replace(/[ \t]+\n/g, '\n').trim();
  return { text, changed: text !== raw.trim() };
}

export function analyzeSummaryContaminationV1(value) {
  const text = String(value ?? '');
  const reasoningLeak = hasGemma4ReasoningLeak(text);
  const controlTokenLeak = CONTROL_TOKEN_TEST_RE.test(text);
  const scaffoldLeak = SCAFFOLD_PATTERNS.some((re) => re.test(text));
  const trimmed = text.trim();
  const placeholderOrMeta = trimmed.length < 20 || PLACEHOLDER_RE.test(trimmed);
  const reasons = [];
  if (reasoningLeak) reasons.push('REASONING_LEAK');
  if (scaffoldLeak) reasons.push('PROMPT_SCAFFOLD_LEAK');
  if (controlTokenLeak) reasons.push('CONTROL_TOKEN_LEAK');
  if (placeholderOrMeta) reasons.push(trimmed.length < 20 ? 'TOO_SHORT' : 'PLACEHOLDER_PATTERN');
  return { reasoningLeak, scaffoldLeak, controlTokenLeak, placeholderOrMeta, clean: reasons.length === 0, reasons };
}

const REQUIRED_LINEAGE = ['canonical_chunk_id', 'source_ref', 'source_revision', 'workspace_revision', 'input_digest', 'proposal_checksum', 'model_revision', 'prompt_template_revision'];
const IDENTITY_COMPARED = ['source_revision', 'workspace_revision', 'input_digest'];

/**
 * @param summary   proposed summary text (exact bytes; never normalized here)
 * @param lineage   what the proposal claims (all REQUIRED_LINEAGE fields)
 * @param current   what the caller re-read from the authoritative binding NOW (source_revision, workspace_revision, input_digest)
 */
export function evaluateSummaryAdmissionV1({ summary, lineage, current }) {
  const text = typeof summary === 'string' ? summary : '';
  const base = { schema: 'atlas.summary-admission.v1', summaryDigest: text ? sha256Text(text) : null };
  const contamination = analyzeSummaryContaminationV1(text);
  const flags = { scaffoldLeak: contamination.scaffoldLeak, reasoningLeak: contamination.reasoningLeak, controlTokenLeak: contamination.controlTokenLeak };
  if (!text.trim()) return { ...base, ...flags, status: 'BLOCKED_EMPTY', reasons: ['EMPTY_SUMMARY'] };
  const missing = REQUIRED_LINEAGE.filter((k) => !lineage || typeof lineage[k] !== 'string' || lineage[k].length === 0);
  if (missing.length) return { ...base, ...flags, status: 'BLOCKED_LINEAGE_MISSING', reasons: missing.map((k) => `MISSING_${k.toUpperCase()}`) };
  if (!current) return { ...base, ...flags, status: 'BLOCKED_LINEAGE_MISSING', reasons: ['CURRENT_BINDING_NOT_PROVIDED'] };
  const changed = IDENTITY_COMPARED.filter((k) => current[k] !== lineage[k]);
  if (changed.length) return { ...base, ...flags, status: 'BLOCKED_IDENTITY_CHANGED', reasons: changed.map((k) => `CHANGED_${k.toUpperCase()}`) };
  if (!contamination.clean) return { ...base, ...flags, status: 'BLOCKED_CONTAMINATION', reasons: contamination.reasons };
  return { ...base, ...flags, status: 'ADMITTED', reasons: [] };
}
