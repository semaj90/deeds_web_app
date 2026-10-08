import { describe,expect,it } from 'vitest';
import { scoreExtraction } from './phase23-eval-gym.js';
describe('EDGE-08 deterministic evaluation scaffold',()=>{
  const f={id:'fixture-1',sourceRevision:'s1',sourceText:'Action: review the filing',expectedLabels:['ACTION'],allowedEvidenceIds:['span:1']};
  it('flags fabricated citations',()=>expect(scoreExtraction(f,{labels:['ACTION'],evidenceIds:['fabricated']}).verdict).toBe('FAIL'));
  it('does not claim PASS for a fixture-only check',()=>expect(scoreExtraction(f,{labels:['ACTION'],evidenceIds:['span:1']}).verdict).toBe('NOT_PROVEN'));
});
