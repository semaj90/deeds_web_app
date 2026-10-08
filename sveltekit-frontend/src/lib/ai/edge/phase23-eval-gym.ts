/** EDGE-08: evaluate deterministic grounded extractions; no fake inference receipts. */
export interface ExtractionFixture { id:string; sourceRevision:string; sourceText:string; expectedLabels:readonly string[]; allowedEvidenceIds:readonly string[]; }
export interface ExtractionCandidate { labels:readonly string[]; evidenceIds:readonly string[]; }
export function scoreExtraction(fixture:ExtractionFixture, candidate:ExtractionCandidate) {
  const target=new Set(fixture.expectedLabels), predicted=new Set(candidate.labels);
  const correct=[...predicted].filter(x=>target.has(x)).length;
  const unsupported=candidate.evidenceIds.filter(id=>!fixture.allowedEvidenceIds.includes(id));
  const precision=predicted.size?correct/predicted.size:0;
  const recall=target.size?correct/target.size:1;
  return {fixtureId:fixture.id,sourceRevision:fixture.sourceRevision,precision,recall,
    unsupportedEvidence:unsupported, verdict:unsupported.length?'FAIL':'NOT_PROVEN' as 'FAIL'|'NOT_PROVEN'};
}
// TODO: replace toy labels with frozen Eval Gym owner fixtures and evidence span assertions.
// TODO: only produce PASS after actual model execution and source-grounded citation readback.
