import type { NlpEntity } from './miniforge-nlp-sidecar.js';

export interface LangExtractGroundingReportV1 {
  schema: 'atlas.langextract-grounding-report.v1';
  total: number;
  grounded: number;
  exact: number;
  fuzzy: number;
  ungrounded: number;
  status: 'PROVEN_GROUNDED' | 'DEGRADED_ALIGNMENT' | 'BLOCKED_UNGROUNDED' | 'NO_EXTRACTIONS';
}

/**
 * Grounding gate based on native LangExtract char_interval/alignment_status.
 * `start`/`end` legacy fields alone are not accepted as proof of grounding.
 */
export function evaluateLangExtractGrounding(entities: NlpEntity[]): LangExtractGroundingReportV1 {
  if (entities.length === 0) return { schema: 'atlas.langextract-grounding-report.v1', total: 0, grounded: 0, exact: 0, fuzzy: 0, ungrounded: 0, status: 'NO_EXTRACTIONS' };
  let grounded = 0, exact = 0, fuzzy = 0, ungrounded = 0;
  for (const entity of entities) {
    const interval = entity.char_interval;
    const valid = interval != null && Number.isFinite(interval.start_pos) && Number.isFinite(interval.end_pos) && Number(interval.end_pos) >= Number(interval.start_pos);
    if (!valid) { ungrounded++; continue; }
    grounded++;
    if (entity.alignment_status === 'match_exact') exact++;
    else if (entity.alignment_status) fuzzy++;
  }
  const status = ungrounded > 0 ? 'BLOCKED_UNGROUNDED' : fuzzy > 0 ? 'DEGRADED_ALIGNMENT' : 'PROVEN_GROUNDED';
  return { schema: 'atlas.langextract-grounding-report.v1', total: entities.length, grounded, exact, fuzzy, ungrounded, status };
}

export function assertGroundedLangExtractEvidence(entities: NlpEntity[]): void {
  const report = evaluateLangExtractGrounding(entities);
  if (report.status === 'BLOCKED_UNGROUNDED') throw new Error('LANGEXTRACT_UNGROUNDED_EVIDENCE_BLOCKED');
}
