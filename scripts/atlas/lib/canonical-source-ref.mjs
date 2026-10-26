#!/usr/bin/env node
/**
 * Canonical source-ref compatibility shim.
 *
 * Multiple scripts still import this historical filename. Keep the canonical
 * normalize/hash helpers here so existing lanes continue to run without a
 * broad refactor.
 */

import crypto from 'node:crypto';
import { normalizeSourceRef as baseNormalizeSourceRef, sourceRefVariants } from './normalize-source-ref.mjs';

const GENERATED_PATTERNS = [
  /(^|\/)\.venv(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)dist(\/|$)/i,
  /(^|\/)build(\/|$)/i,
  /(^|\/)coverage(\/|$)/i,
  /(^|\/)generated(\/|$)/i,
  /\.generated\./i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
];

export function normalizeSourceRef(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[\u0000-\u001f\u007f]/u.test(raw) || raw.includes('?') || raw.includes('#')) {
    throw new Error('SOURCE_REF_INVALID_CHARACTER');
  }
  if (/^(?:[\\/]{2}|[\\/])|^[A-Za-z]:/u.test(raw)) {
    throw new Error('SOURCE_REF_MUST_BE_REPOSITORY_RELATIVE');
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(raw)) {
    throw new Error('SOURCE_REF_URL_OR_SCHEME_FORBIDDEN');
  }

  const pathParts = raw.replaceAll('\\', '/').split('/').filter(Boolean);
  for (const pathPart of pathParts) {
    let decoded = pathPart;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        throw new Error('SOURCE_REF_INVALID_ESCAPE');
      }
    }
    if (decoded === '..') throw new Error('SOURCE_REF_PARENT_TRAVERSAL');
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw new Error('SOURCE_REF_ENCODED_SEPARATOR');
    }
  }
  return baseNormalizeSourceRef(value);
}

export function sourceRefHash(value) {
  const normalized = normalizeSourceRef(value);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

export function legacyPacketKeyFromSourceRef(value) {
  const sourceRef = String(value ?? '');
  if (!sourceRef) return '';
  return `packet:${crypto.createHash('sha256').update(sourceRef, 'utf8').digest('hex').slice(0, 12)}`;
}

export function assertLegacyPacketKeySourceRefMatch({ packetKey, sourceRef, existingSourceRef }) {
  const candidateSourceRef = String(sourceRef ?? '');
  const storedSourceRef = String(existingSourceRef ?? '');
  if (!candidateSourceRef || !storedSourceRef || packetKey !== legacyPacketKeyFromSourceRef(candidateSourceRef)) {
    throw new Error('LEGACY_PACKET_KEY_COLLISION_CHECK_INPUT_INVALID');
  }
  if (candidateSourceRef !== storedSourceRef) throw new Error('LEGACY_PACKET_KEY_TRUNCATION_COLLISION');
  return true;
}

export function assertLegacyPacketKeyCorpusV1(entries) {
  for (const entry of entries ?? []) {
    const sourceRef = String(entry?.sourceRef ?? '');
    const packetKey = String(entry?.packetKey ?? '');
    if (!sourceRef || packetKey !== legacyPacketKeyFromSourceRef(sourceRef)) {
      throw new Error('LEGACY_PACKET_KEY_CORPUS_ENTRY_INVALID');
    }
  }
  return assertPacketKeySourceRefPairsUniqueV1(entries);
}

export function assertPacketKeySourceRefPairsUniqueV1(entries) {
  const sourceRefByPacketKey = new Map();
  for (const entry of entries ?? []) {
    const sourceRef = String(entry?.sourceRef ?? '');
    const packetKey = String(entry?.packetKey ?? '');
    if (!sourceRef || !packetKey) throw new Error('PACKET_KEY_SOURCE_REF_PAIR_INVALID');
    const existingSourceRef = sourceRefByPacketKey.get(packetKey);
    if (existingSourceRef !== undefined && existingSourceRef !== sourceRef) {
      throw new Error('LEGACY_PACKET_KEY_TRUNCATION_COLLISION');
    }
    sourceRefByPacketKey.set(packetKey, sourceRef);
  }
  return true;
}

export function isGeneratedPath(value) {
  const normalized = String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\/+/i, '')
    .replace(/^file:\/+/i, '')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  if (!normalized) return false;
  return GENERATED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export { sourceRefVariants };

export default {
  normalizeSourceRef,
  sourceRefHash,
  isGeneratedPath,
  sourceRefVariants,
};
