#!/usr/bin/env node

import crypto from 'node:crypto';
import { normalizeSourceRef } from './canonical-source-ref.mjs';

export function stableHash(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(input ?? '').digest('hex').slice(0, 24);
}

export function parsePgVectorText(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const vector = value.map((item) => Number(item));
    return vector.every(Number.isFinite) ? vector : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const body = raw.replace(/^[\[{(]+/, '').replace(/[\]})]+$/, '');
  if (!body) return null;

  const vector = body
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  return vector.length > 0 ? vector : null;
}

export function l2Normalize(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    return vector.slice();
  }
  return vector.map((value) => value / norm);
}

export function meanVectors(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) return null;
  const dim = vectors[0]?.length ?? 0;
  if (!dim) return null;

  const sum = new Array(dim).fill(0);
  let count = 0;

  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== dim) continue;
    count++;
    for (let i = 0; i < dim; i++) {
      sum[i] += Number(vector[i]) || 0;
    }
  }

  if (count === 0) return null;
  return sum.map((value) => value / count);
}

export function vectorChecksum(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return '';
  return crypto
    .createHash('sha256')
    .update(vector.map((value) => Number(value).toFixed(10)).join(','))
    .digest('hex')
    .slice(0, 16);
}

export function hasTurnMarkers(text) {
  const value = String(text ?? '');
  return /<start_of_turn>|<end_of_turn>|<\|im_start\|>|<\|im_end\|>/i.test(value);
}

export function scanObjectForTurnMarkers(value, path = '$') {
  if (typeof value === 'string') {
    return hasTurnMarkers(value) ? [{ path, value }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanObjectForTurnMarkers(item, `${path}[${index}]`));
  }

  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, item]) => scanObjectForTurnMarkers(item, `${path}.${key}`));
}

export function firstDefined(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = typeof value === 'string' ? value.trim() : String(value).trim();
    if (text) return text;
  }
  return '';
}

export function normalizedSourceRef(value) {
  return normalizeSourceRef(value);
}

export function isInvalidSourceRef(value) {
  const normalized = normalizedSourceRef(value);
  if (!normalized) return true;
  if (normalized === 'null' || normalized === 'undefined' || normalized === 'n/a') return true;
  if (/^(\.|\/)+$/.test(normalized)) return true;
  return false;
}

