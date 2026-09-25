import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeTransportMarkersV1, analyzeSummaryContaminationV1, evaluateSummaryAdmissionV1, sha256Text,
} from './summary-quality-v1.mjs';
import { sanitizeGemma4Summary } from './gemma4-summary-sanitizer.mjs';

const CLEAN = 'Registers the retrieval route, validates the query, and returns ranked packets with their score components.';
const lineage = { canonical_chunk_id: 'fullrepo:src/a.ts:0', source_ref: 'src/a.ts', source_revision: 'sha256:aa', workspace_revision: 'sha256:bb', input_digest: 'sha256:cc', proposal_checksum: 'sha256:dd', model_revision: 'ornith-1.5-9b', prompt_template_revision: 'pt-1' };
const current = { source_revision: 'sha256:aa', workspace_revision: 'sha256:bb', input_digest: 'sha256:cc' };

test('transport markers are removed but reasoning is never repaired', () => {
  assert.equal(sanitizeTransportMarkersV1(`<start_of_turn>model ${CLEAN}<end_of_turn>`).changed, true);
  const reasoning = analyzeSummaryContaminationV1('<|channel>thought The user wants a summary of the code. It defines routes.');
  assert.equal(reasoning.reasoningLeak, true);
  assert.equal(reasoning.clean, false);
});

test('echoed few-shot scaffold (the July 4 failure mode) is detected', () => {
  const july = 'This image shows routes.\n\n---\n\n**Example of a good summary:**\n*This feature maps routes.*\n\n---\n\n**Your turn:**\nFeature: x.png\nSource: a/x.png';
  const r = analyzeSummaryContaminationV1(july);
  assert.equal(r.scaffoldLeak, true);
  assert.ok(r.reasons.includes('PROMPT_SCAFFOLD_LEAK'));
  assert.equal(analyzeSummaryContaminationV1('The request is to summarize the content in 1-2 concise sentences. * A path.').scaffoldLeak, true);
  assert.equal(analyzeSummaryContaminationV1(CLEAN).clean, true);
});

test('admission: clean summary with matching lineage is ADMITTED with an exact digest', () => {
  const a = evaluateSummaryAdmissionV1({ summary: CLEAN, lineage, current });
  assert.equal(a.status, 'ADMITTED');
  assert.equal(a.summaryDigest, sha256Text(CLEAN));
  assert.deepEqual([a.scaffoldLeak, a.reasoningLeak, a.controlTokenLeak], [false, false, false]);
});

test('admission blocks on changed identity, missing lineage, contamination and empty text', () => {
  assert.equal(evaluateSummaryAdmissionV1({ summary: CLEAN, lineage, current: { ...current, source_revision: 'sha256:zz' } }).status, 'BLOCKED_IDENTITY_CHANGED');
  assert.equal(evaluateSummaryAdmissionV1({ summary: CLEAN, lineage, current: { ...current, input_digest: 'sha256:zz' } }).reasons[0], 'CHANGED_INPUT_DIGEST');
  assert.equal(evaluateSummaryAdmissionV1({ summary: CLEAN, lineage: { ...lineage, model_revision: '' }, current }).status, 'BLOCKED_LINEAGE_MISSING');
  assert.equal(evaluateSummaryAdmissionV1({ summary: CLEAN, lineage, current: null }).status, 'BLOCKED_LINEAGE_MISSING');
  assert.equal(evaluateSummaryAdmissionV1({ summary: `${CLEAN}\n---\nYour turn: Feature: a Source: b`, lineage, current }).status, 'BLOCKED_CONTAMINATION');
  assert.equal(evaluateSummaryAdmissionV1({ summary: '   ', lineage, current }).status, 'BLOCKED_EMPTY');
});

test('admission never sanitizes: a summary with control tokens is blocked, not silently cleaned', () => {
  const a = evaluateSummaryAdmissionV1({ summary: `${CLEAN}<end_of_turn>`, lineage, current });
  assert.equal(a.status, 'BLOCKED_CONTAMINATION');
  assert.equal(a.controlTokenLeak, true);
  const cleaned = sanitizeTransportMarkersV1(`${CLEAN}<end_of_turn>`).text;
  assert.equal(evaluateSummaryAdmissionV1({ summary: cleaned, lineage, current }).status, 'ADMITTED');
});

test('regression: the legacy sanitizer contract is exactly {raw, summary, changed, leaky, safe}', () => {
  const ok = sanitizeGemma4Summary(CLEAN);
  assert.deepEqual(Object.keys(ok).sort(), ['changed', 'leaky', 'raw', 'safe', 'summary']);
  assert.equal(ok.safe, true);
  assert.equal(sanitizeGemma4Summary('<|channel>thought we need to analyze this').safe, false);
  // callers must read `.safe` / `.summary`; any other property (e.g. `.clean`, `.text`, `.ok`) is undefined
  assert.equal(ok.clean, undefined);
  assert.equal(ok.text, undefined);
});
