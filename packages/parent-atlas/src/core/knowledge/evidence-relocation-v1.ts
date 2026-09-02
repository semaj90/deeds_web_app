import { z } from 'zod';
import { sha256HexV1, sha256TextV1 } from './stable-json-v1.js';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const contextualTextAnchorV1Schema = z
  .object({
    schema: z.literal('atlas.contextual-text-anchor.v1').default('atlas.contextual-text-anchor.v1'),
    selectedLineCount: z.number().int().positive(),
    selectedContentChecksum: sha256Hex,
    firstSelectedLineChecksum: sha256Hex,
    lastSelectedLineChecksum: sha256Hex,
    precedingContextLineCount: z.number().int().min(0).max(3),
    precedingContextChecksum: sha256Hex,
    followingContextLineCount: z.number().int().min(0).max(3),
    followingContextChecksum: sha256Hex,
    anchorChecksum: sha256Hex,
  })
  .strict();

export type ContextualTextAnchorV1 = z.infer<typeof contextualTextAnchorV1Schema>;

function splitExactLines(source: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline === -1 ? source.length : newline + 1;
    lines.push(source.slice(start, end));
    start = end;
  }
  return lines;
}

function selectedText(lines: readonly string[], startIndex: number, endIndexExclusive: number): string {
  return lines.slice(startIndex, endIndexExclusive).join('');
}

export function buildContextualTextAnchorV1(
  source: string,
  startLine: number,
  endLine: number,
): ContextualTextAnchorV1 {
  const lines = splitExactLines(source);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) {
    throw new Error('CONTEXT_ANCHOR_INVALID_LINE_RANGE');
  }
  const startIndex = startLine - 1;
  const endIndexExclusive = endLine;
  const precedingStart = Math.max(0, startIndex - 3);
  const followingEnd = Math.min(lines.length, endIndexExclusive + 3);
  const body = {
    schema: 'atlas.contextual-text-anchor.v1' as const,
    selectedLineCount: endIndexExclusive - startIndex,
    selectedContentChecksum: sha256TextV1(selectedText(lines, startIndex, endIndexExclusive)),
    firstSelectedLineChecksum: sha256TextV1(lines[startIndex] ?? ''),
    lastSelectedLineChecksum: sha256TextV1(lines[endIndexExclusive - 1] ?? ''),
    precedingContextLineCount: startIndex - precedingStart,
    precedingContextChecksum: sha256TextV1(lines.slice(precedingStart, startIndex).join('')),
    followingContextLineCount: followingEnd - endIndexExclusive,
    followingContextChecksum: sha256TextV1(lines.slice(endIndexExclusive, followingEnd).join('')),
  };
  return contextualTextAnchorV1Schema.parse({ ...body, anchorChecksum: sha256HexV1(body) });
}

export type EvidenceRelocationResultV1 =
  | { status: 'RESOLVED'; method: 'EXACT_TEXT' | 'CONTEXT_ANCHOR'; startLine: number; endLine: number; contentChecksum: string; contentChanged: boolean }
  | { status: 'AMBIGUOUS'; method: 'EXACT_TEXT' | 'CONTEXT_ANCHOR'; candidateCount: number }
  | { status: 'UNRESOLVED'; method: 'EXACT_TEXT' | 'CONTEXT_ANCHOR' };

function contextMatches(lines: readonly string[], start: number, end: number, anchor: ContextualTextAnchorV1): boolean {
  const precedingOk =
    anchor.precedingContextLineCount === 0
      ? start === 0
      : start >= anchor.precedingContextLineCount &&
        sha256TextV1(lines.slice(start - anchor.precedingContextLineCount, start).join('')) === anchor.precedingContextChecksum;
  const followingOk =
    anchor.followingContextLineCount === 0
      ? end === lines.length
      : end + anchor.followingContextLineCount <= lines.length &&
        sha256TextV1(lines.slice(end, end + anchor.followingContextLineCount).join('')) === anchor.followingContextChecksum;
  return precedingOk && followingOk;
}

function contextBoundaries(lines: readonly string[], count: number, checksum: string, side: 'before' | 'after'): number[] {
  if (count === 0) return [side === 'before' ? 0 : lines.length];
  const out: number[] = [];
  for (let start = 0; start + count <= lines.length; start += 1) {
    if (sha256TextV1(lines.slice(start, start + count).join('')) === checksum) {
      out.push(side === 'before' ? start + count : start);
    }
  }
  return out;
}

export function relocateContextualTextAnchorV1(source: string, anchorInput: ContextualTextAnchorV1): EvidenceRelocationResultV1 {
  const anchor = contextualTextAnchorV1Schema.parse(anchorInput);
  const lines = splitExactLines(source);
  const exact: Array<{ start: number; end: number }> = [];
  for (let start = 0; start + anchor.selectedLineCount <= lines.length; start += 1) {
    const end = start + anchor.selectedLineCount;
    if (
      sha256TextV1(lines[start] ?? '') === anchor.firstSelectedLineChecksum &&
      sha256TextV1(lines[end - 1] ?? '') === anchor.lastSelectedLineChecksum &&
      sha256TextV1(selectedText(lines, start, end)) === anchor.selectedContentChecksum
    ) {
      exact.push({ start, end });
    }
  }
  if (exact.length === 1) {
    const match = exact[0];
    return { status: 'RESOLVED', method: 'EXACT_TEXT', startLine: match.start + 1, endLine: match.end, contentChecksum: anchor.selectedContentChecksum, contentChanged: false };
  }
  if (exact.length > 1) {
    const contextual = exact.filter((candidate) => contextMatches(lines, candidate.start, candidate.end, anchor));
    if (contextual.length === 1) {
      const match = contextual[0];
      return { status: 'RESOLVED', method: 'EXACT_TEXT', startLine: match.start + 1, endLine: match.end, contentChecksum: anchor.selectedContentChecksum, contentChanged: false };
    }
    return { status: 'AMBIGUOUS', method: 'EXACT_TEXT', candidateCount: contextual.length || exact.length };
  }

  const starts = contextBoundaries(lines, anchor.precedingContextLineCount, anchor.precedingContextChecksum, 'before');
  const ends = contextBoundaries(lines, anchor.followingContextLineCount, anchor.followingContextChecksum, 'after');
  const candidates: Array<{ start: number; end: number }> = [];
  for (const start of starts) {
    for (const end of ends) {
      if (end > start) candidates.push({ start, end });
    }
  }
  if (candidates.length === 1) {
    const match = candidates[0];
    const content = selectedText(lines, match.start, match.end);
    return { status: 'RESOLVED', method: 'CONTEXT_ANCHOR', startLine: match.start + 1, endLine: match.end, contentChecksum: sha256TextV1(content), contentChanged: true };
  }
  if (candidates.length > 1) return { status: 'AMBIGUOUS', method: 'CONTEXT_ANCHOR', candidateCount: candidates.length };
  return { status: 'UNRESOLVED', method: 'CONTEXT_ANCHOR' };
}
