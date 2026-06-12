#!/usr/bin/env node

import path from 'node:path';

function stripKnownPrefixes(value) {
  let text = String(value ?? '').trim();
  if (!text) return '';

  text = text.replace(/\\/g, '/');
  text = text.replace(/^file:\/+/i, '');
  text = text.replace(/^[A-Za-z]:\/+/i, '');
  text = text.replace(/[?#].*$/, '');
  text = text.replace(/^\.\/+/g, '');
  while (text.startsWith('../')) {
    text = text.slice(3);
  }

  for (const prefix of ['deeds-web-app/', 'sveltekit-frontend/']) {
    if (text.toLowerCase().startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }

  text = text.replace(/\/+/g, '/');
  text = text.replace(/^\/+/, '');
  return text.toLowerCase();
}

export function normalizeSourceRef(input) {
  return stripKnownPrefixes(input);
}

export function sourceRefVariants(input) {
  const normalized = normalizeSourceRef(input);
  if (!normalized) return [];

  const parts = normalized.split('/').filter(Boolean);
  const variants = new Set([normalized]);

  if (parts.length > 0) {
    variants.add(parts.at(-1));
  }
  if (parts.length > 1) {
    variants.add(parts.slice(-2).join('/'));
    variants.add(parts.slice(1).join('/'));
  }
  if (parts.length > 2) {
    variants.add(parts.slice(-3).join('/'));
  }

  const dirname = path.posix.dirname(normalized);
  if (dirname && dirname !== '.') {
    variants.add(dirname);
    variants.add(path.posix.basename(dirname));
  }

  return [...variants].filter(Boolean);
}

function comparableSourceRef(input) {
  return stripKnownPrefixes(input);
}

function rawComparableSourceRef(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .replace(/^[A-Za-z]:\/+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function reasonRank(reason) {
  switch (reason) {
    case 'exact': return 0;
    case 'normalized': return 1;
    case 'rel_path': return 2;
    case 'suffix': return 3;
    case 'basename_directory': return 4;
    default: return 5;
  }
}

export function sourceRefMatchReason(candidate, target) {
  const candidateNorm = normalizeSourceRef(candidate);
  const targetNorm = normalizeSourceRef(target);
  if (!candidateNorm || !targetNorm) return 'unmatched';

  const candidateRaw = rawComparableSourceRef(candidate);
  const targetRaw = rawComparableSourceRef(target);
  const candidateComparable = comparableSourceRef(candidate);
  const targetComparable = comparableSourceRef(target);

  if (candidateRaw === targetRaw) {
    return 'exact';
  }

  if (candidateNorm === targetNorm) {
    return candidateComparable === targetComparable ? 'normalized' : 'normalized';
  }

  if (candidateNorm.endsWith(`/${targetNorm}`) || targetNorm.endsWith(`/${candidateNorm}`)) {
    return 'suffix';
  }

  const candidateParts = candidateNorm.split('/').filter(Boolean);
  const targetParts = targetNorm.split('/').filter(Boolean);

  if (candidateParts.slice(-2).join('/') === targetParts.slice(-2).join('/')) {
    return 'rel_path';
  }

  if (path.posix.basename(candidateNorm) === path.posix.basename(targetNorm)) {
    return 'basename_directory';
  }

  return 'unmatched';
}

export function bestSourceRefMatch(candidate, targets) {
  let best = null;
  for (const target of targets ?? []) {
    const reason = sourceRefMatchReason(candidate, target);
    if (reason === 'unmatched') continue;
    if (!best || reasonRank(reason) < reasonRank(best.reason)) {
      best = { target, reason };
      if (reason === 'exact') break;
    }
  }
  return best;
}
