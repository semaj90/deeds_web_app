/**
 * StableFileIdOwnerAuditV1 — PURE evaluator (S01-08). It creates NO identity, NO id generator, NO namespace.
 * It only judges whether an EXISTING candidate satisfies every requirement of a stable file identity, from observations supplied by the caller.
 *
 * A stableFileId must be: opaque; survive content revisions; survive verified moves/aliases; and must not be the current path, a content hash,
 * a treeNodeId, a packetKey, or a vector/graph projection id.
 *
 * Verdict: PROVEN only when EXACTLY ONE candidate passes every requirement; AMBIGUOUS when several do; MISSING when none does.
 * A requirement is PASS / FAIL / UNPROVEN; UNPROVEN never counts as a pass (fail closed).
 */
export type RequirementState = 'PASS' | 'FAIL' | 'UNPROVEN';
export type StableFileIdVerdict = 'STABLE_FILE_ID_OWNER_PROVEN' | 'STABLE_FILE_ID_OWNER_AMBIGUOUS' | 'STABLE_FILE_ID_OWNER_MISSING';

export interface CandidateObservationV1 {
  /** e.g. `graphify_files.file_id` */
  name: string;
  /** true when the id is a random/opaque value; false when it is derived from a path/hash/tree/packet/vector coordinate; null when unknown. */
  opaque: boolean | null;
  /** What the id is derived from when not opaque, for the record. */
  derivedFrom?: 'PATH' | 'CONTENT_HASH' | 'TREE_NODE' | 'PACKET_KEY' | 'VECTOR_OR_GRAPH_ID' | null;
  /** Logical files observed at 2+ content revisions: how many, and in how many the id stayed the same. */
  revisionSurvival: { observedLogicalFiles: number; idPreserved: number } | null;
  /** Verified move/alias cases the candidate's mechanism handled, and how many kept the id. `mechanismAvailable=false` when no mechanism can express a file move. */
  moveSurvival: { mechanismAvailable: boolean; observedVerifiedMoves: number; idPreserved: number } | null;
}

export interface CandidateEvaluationV1 {
  name: string;
  requirements: Record<'opaque' | 'notDerivedFromForbiddenCoordinate' | 'survivesContentRevisions' | 'survivesVerifiedMoveOrAlias', RequirementState>;
  passes: boolean;
  failedOrUnproven: string[];
}

export function evaluateCandidateV1(c: CandidateObservationV1): CandidateEvaluationV1 {
  const opaque: RequirementState = c.opaque === true ? 'PASS' : c.opaque === false ? 'FAIL' : 'UNPROVEN';
  const notDerived: RequirementState = c.derivedFrom ? 'FAIL' : c.opaque === true ? 'PASS' : 'UNPROVEN';
  const rev: RequirementState = !c.revisionSurvival || c.revisionSurvival.observedLogicalFiles === 0
    ? 'UNPROVEN'
    : c.revisionSurvival.idPreserved === c.revisionSurvival.observedLogicalFiles ? 'PASS' : 'FAIL';
  const move: RequirementState = !c.moveSurvival || !c.moveSurvival.mechanismAvailable || c.moveSurvival.observedVerifiedMoves === 0
    ? 'UNPROVEN'
    : c.moveSurvival.idPreserved === c.moveSurvival.observedVerifiedMoves ? 'PASS' : 'FAIL';
  const requirements = { opaque, notDerivedFromForbiddenCoordinate: notDerived, survivesContentRevisions: rev, survivesVerifiedMoveOrAlias: move };
  const failedOrUnproven = Object.entries(requirements).filter(([, s]) => s !== 'PASS').map(([k, s]) => `${k}:${s}`);
  return { name: c.name, requirements, passes: failedOrUnproven.length === 0, failedOrUnproven };
}

export function evaluateStableFileIdOwnerV1(candidates: readonly CandidateObservationV1[]) {
  const evaluated = candidates.map(evaluateCandidateV1);
  const passing = evaluated.filter((e) => e.passes);
  const verdict: StableFileIdVerdict = passing.length === 1 ? 'STABLE_FILE_ID_OWNER_PROVEN' : passing.length > 1 ? 'STABLE_FILE_ID_OWNER_AMBIGUOUS' : 'STABLE_FILE_ID_OWNER_MISSING';
  return {
    verdict,
    owner: passing.length === 1 ? passing[0].name : null,
    passingCandidates: passing.map((p) => p.name),
    evaluated,
    // Hard rule: a blocked proof never justifies inventing a namespace here.
    newNamespaceCreated: false as const,
    idGeneratorAdded: false as const,
  };
}

/**
 * S01-08A candidate census classification. Predicate-based: a candidate is judged by what it IS (derived from a path, scoped to a revision,
 * a regenerable random placeholder, packet-local, a projection coordinate), never by its column name.
 * Precedence: PATH > REVISION > PROJECTION > PACKET_LOCAL > EPHEMERAL_UUID > QUALIFIED. Insufficient evidence is UNKNOWN, never QUALIFIED.
 */
export type CensusClass =
  | 'QUALIFIED_CANDIDATE' | 'DISQUALIFIED_PATH_IDENTITY' | 'DISQUALIFIED_REVISION_IDENTITY' | 'DISQUALIFIED_EPHEMERAL_UUID'
  | 'DISQUALIFIED_PACKET_LOCAL' | 'DISQUALIFIED_PROJECTION_ID' | 'AMBIGUOUS' | 'UNKNOWN';

export interface CensusFactsV1 extends CandidateObservationV1 {
  pathDerived: boolean | null;
  /** An id that a re-run of its writer regenerates (random per assignment, e.g. randomUUID() in a backfill). */
  ephemeralRandom: boolean | null;
  /** An id assigned per packet row rather than per logical file. */
  packetLocal: boolean | null;
  /** An id that is a vector/graph projection coordinate. */
  projectionId: boolean | null;
  /** More than one writer or namespace competes to define this id. */
  ambiguousOwners?: boolean;
}

export function classifyCensusCandidateV1(f: CensusFactsV1): { cls: CensusClass; reasons: string[] } {
  const reasons: string[] = [];
  if (f.pathDerived === true || f.derivedFrom === 'PATH') { reasons.push('IDENTITY_IS_A_PATH_STRING'); return { cls: 'DISQUALIFIED_PATH_IDENTITY', reasons }; }
  const rs = f.revisionSurvival;
  if (rs && rs.observedLogicalFiles > 0 && rs.idPreserved < rs.observedLogicalFiles) { reasons.push(`ID_CHANGED_ACROSS_REVISIONS:${rs.observedLogicalFiles - rs.idPreserved}/${rs.observedLogicalFiles}`); return { cls: 'DISQUALIFIED_REVISION_IDENTITY', reasons }; }
  if (f.projectionId === true || f.derivedFrom === 'VECTOR_OR_GRAPH_ID' || f.derivedFrom === 'TREE_NODE' || f.derivedFrom === 'PACKET_KEY' || f.derivedFrom === 'CONTENT_HASH') { reasons.push('IDENTITY_IS_A_PROJECTION_OR_DERIVED_COORDINATE'); return { cls: 'DISQUALIFIED_PROJECTION_ID', reasons }; }
  if (f.packetLocal === true) { reasons.push('ASSIGNED_PER_PACKET_ROW'); return { cls: 'DISQUALIFIED_PACKET_LOCAL', reasons }; }
  if (f.ephemeralRandom === true) { reasons.push('RANDOM_ID_REGENERABLE_BY_WRITER'); return { cls: 'DISQUALIFIED_EPHEMERAL_UUID', reasons }; }
  if (f.ambiguousOwners === true) { reasons.push('MULTIPLE_OWNERS'); return { cls: 'AMBIGUOUS', reasons }; }
  const e = evaluateCandidateV1(f);
  if (e.passes) return { cls: 'QUALIFIED_CANDIDATE', reasons: ['ALL_REQUIREMENTS_PASS'] };
  return { cls: 'UNKNOWN', reasons: e.failedOrUnproven };
}
