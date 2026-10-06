import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const digestParts = (...parts) => digest(parts.map((part) => part == null ? '' : String(part)).join('||'));
const present = (value) => typeof value === 'string' && value.trim().length > 0;
const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

export function proveDomainClassifierPassV1({ packet, text, modelId = null, response }) {
  const failures = [];
  const passResults = Array.isArray(response?.pass_results) ? response.pass_results : [];
  const passes = passResults.filter((item) => item?.family === 'classify' && item?.pass_name === 'domain_classifier');
  const pass = passes.length === 1 ? passes[0] : null;

  if (!pass) failures.push(passes.length === 0 ? 'CLASSIFIER_PASS_MISSING' : 'CLASSIFIER_PASS_AMBIGUOUS');
  if (response?.document_id !== packet.packetKey) failures.push('PACKET_KEY_RESPONSE_MISMATCH');
  if (pass?.packet_key !== packet.packetKey) failures.push('PACKET_KEY_PASS_MISMATCH');
  if (pass?.source_ref !== packet.sourceRef) failures.push('SOURCE_REF_MISMATCH');
  if (pass?.source_revision !== packet.sourceRevision) failures.push('SOURCE_REVISION_MISMATCH');
  if (pass?.workspace_revision !== packet.workspaceRevision) failures.push('WORKSPACE_REVISION_MISMATCH');
  if (pass?.input_hash !== digestParts(text, 'classify', 'domain_classifier', packet.sourceRef, packet.packetKey, modelId)) failures.push('INPUT_CHECKSUM_MISMATCH');
  if (pass?.status !== 'succeeded') failures.push('CLASSIFIER_PASS_NOT_SUCCEEDED');
  if (!present(pass?.pass_revision)) failures.push('PASS_REVISION_MISSING');
  if (!present(pass?.backend_version) || pass.backend_version === 'unknown') failures.push('BACKEND_REVISION_MISSING');
  if (!present(pass?.output_hash) || !/^[a-f0-9]{64}$/i.test(pass.output_hash)) failures.push('OUTPUT_CHECKSUM_INVALID');

  const artifacts = pass?.artifacts ?? {};
  const features = pass?.features ?? {};
  const backend = pass?.backend;
  if (!['sklearn-lr', 'sklearn-nb'].includes(backend)) failures.push('CLASSIFIER_BACKEND_UNQUALIFIED');
  if (!present(artifacts.model_revision) || artifacts.model_revision === 'unknown') failures.push('MODEL_REVISION_MISSING');
  if (!probability(features.logistic_regression_domain_probability)) failures.push('LOGISTIC_PROBABILITY_INVALID');
  if (!probability(features.naive_bayes_domain_probability)) failures.push('NAIVE_BAYES_PROBABILITY_INVALID');

  return {
    schema: 'atlas.domain-classifier-pass-proof.v1',
    status: failures.length === 0 ? 'PASS_CALLER_BOUND' : 'UNQUALIFIED',
    canonicalAuthority: false,
    writesPerformed: false,
    identityBinding: 'CALLER_BOUND_AND_RESPONSE_CHECKED',
    packet: { ...packet },
    inputChecksum: `sha256:${digest(text)}`,
    pass: pass ? {
      family: pass.family,
      passName: pass.pass_name,
      passRevision: pass.pass_revision ?? null,
      backend,
      backendVersion: pass.backend_version ?? null,
      status: pass.status,
      inputHash: pass.input_hash ?? null,
      outputHash: pass.output_hash ?? null,
      modelRevision: artifacts.model_revision ?? null,
      selectedLabel: artifacts.label ?? null,
      naiveBayesLabel: artifacts.naive_bayes_label ?? null,
      naiveBayesDomainProbability: features.naive_bayes_domain_probability ?? null,
      naiveBayesDomainProbabilities: features.naive_bayes_domain_probabilities ?? null,
      logisticRegressionLabel: artifacts.logistic_regression_label ?? null,
      logisticRegressionDomainProbability: features.logistic_regression_domain_probability ?? null,
      logisticRegressionDomainProbabilities: features.logistic_regression_domain_probabilities ?? null,
      warnings: pass.warnings ?? [],
      evidenceRefs: [],
    } : null,
    failures,
  };
}
