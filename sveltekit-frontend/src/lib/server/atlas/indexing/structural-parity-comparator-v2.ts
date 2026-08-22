import type { StructuralObservationV1 } from './structural-observation-v1.js';

export type StructuralParityMismatchClassV2 =
  | 'LEFT_SPAN_INVALID'
  | 'RIGHT_SPAN_INVALID'
  | 'NAMED_SYMBOL_MISSING_LEFT'
  | 'NAMED_SYMBOL_MISSING_RIGHT'
  | 'SEMANTIC_KIND_UNKNOWN_LEFT'
  | 'SEMANTIC_KIND_UNKNOWN_RIGHT'
  | 'SEMANTIC_KIND_UNKNOWN_BOTH'
  | 'SEMANTIC_KIND_MISMATCH'
  | 'EXACT_SPAN_MISMATCH';

export interface StructuralParityPairV2 {
  name: string;
  left: StructuralObservationV1;
  right: StructuralObservationV1;
  semanticKindComparable: boolean;
  semanticKindMatch: boolean;
  exactSpanMatch: boolean;
  startByteDelta: number;
  endByteDelta: number;
  mismatchClasses: StructuralParityMismatchClassV2[];
}

export interface StructuralParityComparisonV2 {
  schema: 'atlas.structural-parity-comparison.v2';
  leftNamedCount: number;
  rightNamedCount: number;
  pairedCount: number;
  unmatchedLeft: StructuralObservationV1[];
  unmatchedRight: StructuralObservationV1[];
  pairs: StructuralParityPairV2[];
  mismatchCounts: Partial<Record<StructuralParityMismatchClassV2, number>>;
  gates: {
    leftSpanSelfValid: boolean;
    rightSpanSelfValid: boolean;
    namedSymbolCoverage: boolean;
    semanticKindParity: boolean;
    exactSpanParity: boolean;
  };
}

type Candidate = {
  leftIndex: number;
  rightIndex: number;
  kindPenalty: number;
  parentPenalty: number;
  spanDelta: number;
};

function named(rows: StructuralObservationV1[]): StructuralObservationV1[] {
  return rows
    .filter((row) => Boolean(row.name?.trim()))
    .sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '')
      || a.startByte - b.startByte
      || a.endByte - b.endByte
      || a.symbolKind.localeCompare(b.symbolKind));
}

function groupByName(rows: StructuralObservationV1[]): Map<string, StructuralObservationV1[]> {
  const groups = new Map<string, StructuralObservationV1[]>();
  for (const row of rows) {
    const name = row.name!;
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return groups;
}

function candidateCost(left: StructuralObservationV1, right: StructuralObservationV1, leftIndex: number, rightIndex: number): Candidate {
  const knownKindMatch = left.symbolKind !== 'UNKNOWN'
    && right.symbolKind !== 'UNKNOWN'
    && left.symbolKind === right.symbolKind;
  const bothUnknown = left.symbolKind === 'UNKNOWN' && right.symbolKind === 'UNKNOWN';
  return {
    leftIndex,
    rightIndex,
    kindPenalty: knownKindMatch ? 0 : bothUnknown ? 1 : 2,
    parentPenalty: left.parentContext === right.parentContext ? 0 : 1,
    spanDelta: Math.abs(left.startByte - right.startByte) + Math.abs(left.endByte - right.endByte),
  };
}

function pairGroup(left: StructuralObservationV1[], right: StructuralObservationV1[]): {
  pairs: Array<[StructuralObservationV1, StructuralObservationV1]>;
  unmatchedLeft: StructuralObservationV1[];
  unmatchedRight: StructuralObservationV1[];
} {
  const candidates: Candidate[] = [];
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      candidates.push(candidateCost(left[leftIndex]!, right[rightIndex]!, leftIndex, rightIndex));
    }
  }
  candidates.sort((a, b) =>
    a.kindPenalty - b.kindPenalty
    || a.parentPenalty - b.parentPenalty
    || a.spanDelta - b.spanDelta
    || a.leftIndex - b.leftIndex
    || a.rightIndex - b.rightIndex);

  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const pairs: Array<[StructuralObservationV1, StructuralObservationV1]> = [];
  for (const candidate of candidates) {
    if (usedLeft.has(candidate.leftIndex) || usedRight.has(candidate.rightIndex)) continue;
    usedLeft.add(candidate.leftIndex);
    usedRight.add(candidate.rightIndex);
    pairs.push([left[candidate.leftIndex]!, right[candidate.rightIndex]!]);
  }

  return {
    pairs,
    unmatchedLeft: left.filter((_, index) => !usedLeft.has(index)),
    unmatchedRight: right.filter((_, index) => !usedRight.has(index)),
  };
}

function classifyPair(left: StructuralObservationV1, right: StructuralObservationV1): StructuralParityPairV2 {
  const mismatchClasses: StructuralParityMismatchClassV2[] = [];
  if (!left.spanValid || left.spanContainsName === false) mismatchClasses.push('LEFT_SPAN_INVALID');
  if (!right.spanValid || right.spanContainsName === false) mismatchClasses.push('RIGHT_SPAN_INVALID');

  const leftUnknown = left.symbolKind === 'UNKNOWN';
  const rightUnknown = right.symbolKind === 'UNKNOWN';
  if (leftUnknown && rightUnknown) mismatchClasses.push('SEMANTIC_KIND_UNKNOWN_BOTH');
  else if (leftUnknown) mismatchClasses.push('SEMANTIC_KIND_UNKNOWN_LEFT');
  else if (rightUnknown) mismatchClasses.push('SEMANTIC_KIND_UNKNOWN_RIGHT');
  else if (left.symbolKind !== right.symbolKind) mismatchClasses.push('SEMANTIC_KIND_MISMATCH');

  const exactSpanMatch = left.startByte === right.startByte && left.endByte === right.endByte;
  if (!exactSpanMatch) mismatchClasses.push('EXACT_SPAN_MISMATCH');

  return {
    name: left.name!,
    left,
    right,
    semanticKindComparable: !leftUnknown && !rightUnknown,
    semanticKindMatch: !leftUnknown && !rightUnknown && left.symbolKind === right.symbolKind,
    exactSpanMatch,
    startByteDelta: right.startByte - left.startByte,
    endByteDelta: right.endByte - left.endByte,
    mismatchClasses,
  };
}

export function compareStructuralObservationsV2(
  leftRows: StructuralObservationV1[],
  rightRows: StructuralObservationV1[],
): StructuralParityComparisonV2 {
  const leftNamed = named(leftRows);
  const rightNamed = named(rightRows);
  const leftGroups = groupByName(leftNamed);
  const rightGroups = groupByName(rightNamed);
  const names = [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();

  const pairs: StructuralParityPairV2[] = [];
  const unmatchedLeft: StructuralObservationV1[] = [];
  const unmatchedRight: StructuralObservationV1[] = [];

  for (const name of names) {
    const matched = pairGroup(leftGroups.get(name) ?? [], rightGroups.get(name) ?? []);
    pairs.push(...matched.pairs.map(([left, right]) => classifyPair(left, right)));
    unmatchedLeft.push(...matched.unmatchedLeft);
    unmatchedRight.push(...matched.unmatchedRight);
  }

  const mismatchCounts: Partial<Record<StructuralParityMismatchClassV2, number>> = {};
  const add = (kind: StructuralParityMismatchClassV2): void => {
    mismatchCounts[kind] = (mismatchCounts[kind] ?? 0) + 1;
  };
  for (const pair of pairs) for (const kind of pair.mismatchClasses) add(kind);
  for (const _ of unmatchedLeft) add('NAMED_SYMBOL_MISSING_RIGHT');
  for (const _ of unmatchedRight) add('NAMED_SYMBOL_MISSING_LEFT');

  const leftSpanSelfValid = leftRows.every((row) => row.spanValid && row.spanContainsName !== false);
  const rightSpanSelfValid = rightRows.every((row) => row.spanValid && row.spanContainsName !== false);
  const namedSymbolCoverage = unmatchedLeft.length === 0 && unmatchedRight.length === 0;
  const semanticKindParity = namedSymbolCoverage
    && pairs.length === leftNamed.length
    && pairs.every((pair) => pair.semanticKindComparable && pair.semanticKindMatch);
  const exactSpanParity = namedSymbolCoverage
    && pairs.length === leftNamed.length
    && pairs.every((pair) => pair.exactSpanMatch);

  return {
    schema: 'atlas.structural-parity-comparison.v2',
    leftNamedCount: leftNamed.length,
    rightNamedCount: rightNamed.length,
    pairedCount: pairs.length,
    unmatchedLeft,
    unmatchedRight,
    pairs: pairs.sort((a, b) => a.name.localeCompare(b.name) || a.left.startByte - b.left.startByte),
    mismatchCounts,
    gates: {
      leftSpanSelfValid,
      rightSpanSelfValid,
      namedSymbolCoverage,
      semanticKindParity,
      exactSpanParity,
    },
  };
}
