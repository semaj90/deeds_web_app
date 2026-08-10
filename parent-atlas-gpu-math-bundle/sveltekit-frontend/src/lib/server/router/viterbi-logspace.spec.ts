import { describe, expect, it } from 'vitest';
import { viterbiLogSpace } from './viterbi-logspace';

const ln=(p:number)=>Math.log(p);

describe('viterbiLogSpace',()=>{
  it('decodes a deterministic two-state sequence',()=>{
    const r=viterbiLogSpace({
      initialLogProb:[ln(0.9),ln(0.1)],
      transitionLogProb:[[ln(0.9),ln(0.1)],[ln(0.2),ln(0.8)]],
      emissionLogProb:[[ln(0.9),ln(0.1)],[ln(0.8),ln(0.2)],[ln(0.1),ln(0.9)]],
    });
    expect(r.states).toHaveLength(3);
    expect(Number.isFinite(r.logProbability)).toBe(true);
  });

  it('uses stable lowest-index tie breaking',()=>{
    const r=viterbiLogSpace({
      initialLogProb:[0,0], transitionLogProb:[[0,0],[0,0]], emissionLogProb:[[0,0],[0,0]],
    });
    expect(r.states).toEqual([0,0]);
  });
});
