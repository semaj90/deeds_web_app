import { describe, expect, it } from 'vitest';
import { evaluateLangExtractGrounding } from '../src/lib/server/nlp/langextract-grounding-gate.js';

describe('LangExtract grounding gate', () => {
  it('blocks char_interval=null even when legacy start/end exist', () => {
    const report = evaluateLangExtractGrounding([{ text:'Alice', label:'person', start:0, end:5, char_interval:null, alignment_status:null }]);
    expect(report.status).toBe('BLOCKED_UNGROUNDED');
  });
  it('distinguishes exact from fuzzy native grounding', () => {
    expect(evaluateLangExtractGrounding([{ text:'Alice', label:'person', char_interval:{start_pos:0,end_pos:5}, alignment_status:'match_exact' }]).status).toBe('PROVEN_GROUNDED');
    expect(evaluateLangExtractGrounding([{ text:'Alice', label:'person', char_interval:{start_pos:0,end_pos:5}, alignment_status:'match_fuzzy' }]).status).toBe('DEGRADED_ALIGNMENT');
  });
});
