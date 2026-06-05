#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

export function normalizePathLike(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\.?\.\//, '');
}

export function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizePathLike(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function firstArrayValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value) && value.length > 0) return value[0];
  }
  return null;
}

export function normalizeSourceRef(row) {
  return (
    normalizePathLike(row?.source_ref) ??
    normalizePathLike(row?.sourceRef) ??
    normalizePathLike(firstArrayValue(row, ['sourceRefs', 'source_refs'])) ??
    normalizePathLike(row?.file_path) ??
    normalizePathLike(row?.path) ??
    normalizePathLike(row?.relative_path) ??
    null
  );
}

export function normalizeSourceRefs(row) {
  const values = [
    row?.source_ref,
    row?.sourceRef,
    ...(Array.isArray(row?.sourceRefs) ? row.sourceRefs : []),
    ...(Array.isArray(row?.source_refs) ? row.source_refs : []),
    row?.file_path,
    row?.path,
    row?.relative_path,
  ];
  return uniqueStrings(values);
}

export function normalizeFeatureId(row) {
  return (
    normalizePathLike(row?.feature_id) ??
    normalizePathLike(row?.featureId) ??
    normalizePathLike(firstArrayValue(row, ['feature_ids', 'featureIds'])) ??
    null
  );
}

export function normalizeFeatureLabel(row) {
  return (
    normalizePathLike(row?.feature_label) ??
    normalizePathLike(row?.featureLabel) ??
    normalizePathLike(row?.label) ??
    normalizePathLike(row?.title) ??
    null
  );
}

export function sampleTopLevelKeys(row, limit = 12) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  return Object.keys(row).slice(0, limit);
}

export function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      lineCount: 0,
      validRows: 0,
      invalidRows: [],
      rows: [],
      keySamples: [],
    };
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = [];
  const invalidRows = [];
  const keySample = new Set();

  lines.forEach((line, index) => {
    if (!line || !line.trim()) return;
    try {
      const row = JSON.parse(line);
      rows.push({
        ...row,
        __lineNumber: index + 1,
      });
      for (const key of sampleTopLevelKeys(row)) {
        keySample.add(key);
      }
    } catch (error) {
      invalidRows.push({
        lineNumber: index + 1,
        message: error instanceof Error ? error.message : String(error),
        preview: line.slice(0, 240),
      });
    }
  });

  return {
    filePath,
    exists: true,
    lineCount: lines.filter((line) => line.trim()).length,
    validRows: rows.length,
    invalidRows,
    rows,
    keySamples: [...keySample].slice(0, 12),
  };
}

export function relativeDisplay(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}
