#!/usr/bin/env node

import crypto from 'node:crypto';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRangePart(value) {
  const text = normalizeText(value);
  return text ? text : '0';
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function buildCanonicalPacketKey(input = {}) {
  const explicit = normalizeText(input.packet_key ?? input.packetKey ?? input.packet_id ?? input.packetId);
  if (explicit) return explicit;

  const sourceRef = normalizeText(
    input.source_ref ?? input.sourceRef ?? input.relative_path ?? input.relativePath
  );
  const lineStart = normalizeRangePart(input.line_start ?? input.lineStart);
  const lineEnd = normalizeRangePart(input.line_end ?? input.lineEnd);
  const contentHash = normalizeText(input.content_hash ?? input.contentHash);

  if (!sourceRef && !contentHash) {
    return '';
  }

  const identity = [sourceRef, lineStart, lineEnd, contentHash].join('|');
  return `sha256:${sha256Hex(identity)}`;
}

export function buildCanonicalPacketIdentity(input = {}) {
  return {
    packet_key: buildCanonicalPacketKey(input),
    source_ref: normalizeText(
      input.source_ref ?? input.sourceRef ?? input.relative_path ?? input.relativePath
    ),
    line_start: input.line_start ?? input.lineStart ?? null,
    line_end: input.line_end ?? input.lineEnd ?? null,
    content_hash: normalizeText(input.content_hash ?? input.contentHash),
  };
}
