import { createHash } from 'node:crypto';

import type { AtlasStructuralEvidenceChunk } from '$lib/server/nlp/miniforge-nlp-sidecar.js';

export type StructuralSymbolKindV1 =
  | 'FILE'
  | 'FUNCTION'
  | 'METHOD'
  | 'CLASS'
  | 'INTERFACE'
  | 'TYPE'
  | 'ENUM'
  | 'VARIABLE'
  | 'UNKNOWN';

export interface StructuralSourceFingerprintV1 {
  schema: 'atlas.structural-source-fingerprint.v1';
  sha256: string;
  utf8ByteLength: number;
  utf16CodeUnitLength: number;
  lfCount: number;
  crlfCount: number;
  loneLfCount: number;
}

export interface StructuralObservationV1 {
  schema: 'atlas.structural-observation.v1';
  provider: string;
  rawNodeType: string;
  rawKind: string;
  symbolKind: StructuralSymbolKindV1;
  name: string | null;
  startByte: number;
  endByte: number;
  spanValid: boolean;
  spanContainsName: boolean | null;
  parentRoute: string[];
  parentContext: string | null;
}

export function fingerprintStructuralSource(source: string): StructuralSourceFingerprintV1 {
  const bytes = Buffer.from(source, 'utf8');
  const crlfCount = (source.match(/\r\n/g) ?? []).length;
  const lfCount = (source.match(/\n/g) ?? []).length;
  return {
    schema: 'atlas.structural-source-fingerprint.v1',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    utf8ByteLength: bytes.byteLength,
    utf16CodeUnitLength: source.length,
    lfCount,
    crlfCount,
    loneLfCount: Math.max(0, lfCount - crlfCount),
  };
}

export function normalizeStructuralSymbolKind(
  rawKind: string | null | undefined,
  rawNodeType: string | null | undefined,
): StructuralSymbolKindV1 {
  const values = [rawKind, rawNodeType]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toUpperCase());

  for (const value of values) {
    if (value === 'FILE' || value === 'MODULE' || value === 'PROGRAM') return 'FILE';
    if (value.includes('METHOD')) return 'METHOD';
    if (value.includes('FUNCTION') || value === 'ARROW_FUNCTION' || value === 'FUNCTION_EXPRESSION') return 'FUNCTION';
    if (value.includes('CLASS')) return 'CLASS';
    if (value.includes('INTERFACE')) return 'INTERFACE';
    if (value.includes('TYPE_ALIAS') || value === 'TYPE') return 'TYPE';
    if (value.includes('ENUM')) return 'ENUM';
    if (value.includes('VARIABLE') || value === 'VARIABLE_DECLARATOR' || value === 'LEXICAL_DECLARATION') return 'VARIABLE';
  }

  // Deliberately do not coerce FRAGMENT/DECLARATION/CHUNK into a symbol kind.
  // Those are chunk-boundary vocabularies and cannot prove semantic symbol class.
  return 'UNKNOWN';
}

export function projectStructuralObservation(
  provider: string,
  source: string,
  chunk: AtlasStructuralEvidenceChunk,
): StructuralObservationV1 {
  const bytes = Buffer.from(source, 'utf8');
  const startByte = Number(chunk.start_byte);
  const endByte = Number(chunk.end_byte);
  const spanValid = Number.isInteger(startByte)
    && Number.isInteger(endByte)
    && startByte >= 0
    && endByte >= startByte
    && endByte <= bytes.byteLength;
  const name = chunk.name?.trim() || null;
  const spanText = spanValid ? bytes.subarray(startByte, endByte).toString('utf8') : '';

  return {
    schema: 'atlas.structural-observation.v1',
    provider,
    rawNodeType: chunk.node_type,
    rawKind: chunk.kind,
    symbolKind: normalizeStructuralSymbolKind(chunk.kind, chunk.node_type),
    name,
    startByte,
    endByte,
    spanValid,
    spanContainsName: name ? spanValid && spanText.includes(name) : null,
    parentRoute: [...(chunk.parent_route ?? [])],
    parentContext: chunk.parent_context ?? null,
  };
}
