import crypto from 'node:crypto';

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

export function parsePgVectorTextV3(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('[') || !raw.endsWith(']')) return null;
  const body = raw.slice(1, -1);
  if (!body) return [];
  return body.split(',').map((item) => Number(item.trim()));
}

export function inspectSemanticVectorV3(raw) {
  if (raw === null || raw === undefined) {
    return { state: 'MISSING', dimension: null, norm: null, textChecksum: null };
  }
  const vector = parsePgVectorTextV3(raw);
  if (!vector) return { state: 'UNREADABLE', dimension: null, norm: null, textChecksum: sha256(String(raw)) };
  if (vector.length !== 768) return { state: 'WRONG_DIMENSION', dimension: vector.length, norm: null, textChecksum: sha256(raw) };
  if (!vector.every(Number.isFinite)) return { state: 'NON_FINITE', dimension: vector.length, norm: null, textChecksum: sha256(raw) };
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm)) return { state: 'NON_FINITE', dimension: vector.length, norm: null, textChecksum: sha256(raw) };
  if (norm === 0) return { state: 'ZERO_NORM', dimension: vector.length, norm, textChecksum: sha256(raw) };
  if (Math.abs(norm - 1) > 0.02) return { state: 'NON_UNIT', dimension: vector.length, norm, textChecksum: sha256(raw) };
  return { state: 'WELL_FORMED', dimension: vector.length, norm, textChecksum: sha256(raw) };
}

export function classifySemanticBindingV3(fields) {
  const representationRevisionPresent = typeof fields.representationRevision === 'string'
    && fields.representationRevision.trim().length > 0;
  const immutableDigestsPresent = [fields.modelRevision, fields.tokenizerRevision, fields.inputDigest, fields.vectorChecksum]
    .every((value) => typeof value === 'string' && SHA256.test(value));
  return representationRevisionPresent && immutableDigestsPresent
    ? 'DIGEST_BOUND'
    : 'UNQUALIFIED_OR_INCOMPLETE';
}
