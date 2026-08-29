#!/usr/bin/env node

/** Read-only proof: validate the bounded Ornith response through ClaimVerification. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'sveltekit-frontend');
const reportPath = path.join(root, 'docs/reports/ornith-external-evidence-synthesis-replay-v1.json');
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
if (report.status !== 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN' || report.grounded !== true) throw new Error('GROUNDED_CLAIM_REQUIRES_GREEN_SYNTHESIS_REPLAY');
const { claimSchema, evidenceObservationSchema, buildDefaultEvidenceClaimPolicies, verifyClaimAgainstPolicy } = await import(pathToFileURL(path.join(root, 'packages/parent-atlas/src/core/claim-verification.ts')).href);
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const synthesis = report.synthesis;
if (!synthesis || typeof synthesis.summary !== 'string' || !Array.isArray(synthesis.evidenceRefs) || typeof synthesis.confidence !== 'number') throw new Error('GROUNDED_CLAIM_RESPONSE_MISSING');
const allowed = new Set(report.evidenceRefs);
if (synthesis.evidenceRefs.length === 0 || synthesis.evidenceRefs.some((ref) => !allowed.has(ref))) throw new Error('GROUNDED_CLAIM_EVIDENCE_NOT_IN_CONTEXT');
const evidence = synthesis.evidenceRefs.map((ref) => evidenceObservationSchema.parse({
  evidence_id: ref,
  evidence_revision: report.contextManifestChecksum,
  subject_canonical_ids: report.candidateOrdinals.map((ordinal) => `candidate:${ordinal}`),
  evidence_kind: 'GRAPH_MEASUREMENT',
  source_ref: ref,
  source_revision: report.contextManifestChecksum,
  producer: 'ornith',
  producer_revision: 'ornith-external-evidence-synthesis-replay-v1',
  output_checksum: hash({ ref, contextManifestChecksum: report.contextManifestChecksum }),
  observed_value: { summary: synthesis.summary, confidence: synthesis.confidence },
  reproducible: report.responseChecksums.identical === true,
  trust_class: 'RUNTIME_OBSERVED',
  canonical_authority: false,
}));
const claim = claimSchema.parse({ claim_id: `claim:${report.contextManifestChecksum}`, claim_revision: report.contextManifestChecksum, claim_type: 'SEMANTICALLY_RELEVANT', subject_canonical_ids: evidence[0].subject_canonical_ids, evidence_refs: evidence.map((item) => item.evidence_id), producer_revision: 'ornith-external-evidence-synthesis-replay-v1', canonical_authority: false });
const policy = buildDefaultEvidenceClaimPolicies('claim-policy:semantic-relevance-v1').find((item) => item.claim_type === 'SEMANTICALLY_RELEVANT');
if (!policy) throw new Error('GROUNDED_CLAIM_POLICY_MISSING');
const receipt = verifyClaimAgainstPolicy({ claim, evidence, policy, receipt_id: `receipt:${report.contextManifestChecksum}`, producer_revision: 'claim-verification-v1' });
const output = { schema: 'atlas.ornith-grounded-claim-validation.v1', mode: 'READ_ONLY_GROUNDED_CLAIM_VALIDATION', status: receipt.verdict === 'VERIFIED' ? 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN' : 'ORNITH_GROUNDED_CLAIM_VALIDATION_BLOCKED', claim, receipt, evidenceCount: evidence.length, contextManifestChecksum: report.contextManifestChecksum, controls: { canonicalAuthority: false, mutationAllowed: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false } };
const outputPath = path.join(root, 'docs/reports/ornith-grounded-claim-validation-v1.json');
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, verdict: receipt.verdict, evidenceCount: evidence.length, receiptId: receipt.receipt_id, reportPath: outputPath }, null, 2));
if (output.status !== 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN') process.exitCode = 1;
