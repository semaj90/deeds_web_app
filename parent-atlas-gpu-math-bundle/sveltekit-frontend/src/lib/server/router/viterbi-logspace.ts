export interface ViterbiInput {
  /** [T][S] log P(observation_t | state_s) */
  emissionLogProb: number[][];
  /** [S][S] log P(next=j | current=i) */
  transitionLogProb: number[][];
  /** [S] log P(state at t=0) */
  initialLogProb: number[];
}

export interface ViterbiResult {
  states: number[];
  logProbability: number;
}

function assertFiniteOrNegInf(x: number, label: string): void {
  if (!(Number.isFinite(x) || x === Number.NEGATIVE_INFINITY)) {
    throw new Error(`${label} must be finite or -Infinity`);
  }
}

/** Deterministic log-space Viterbi with lowest-state-index tie breaking. */
export function viterbiLogSpace(input: ViterbiInput): ViterbiResult {
  const T = input.emissionLogProb.length;
  const S = input.initialLogProb.length;
  if (T === 0 || S === 0) throw new Error('Viterbi requires T>0 and S>0');
  if (input.transitionLogProb.length !== S || input.transitionLogProb.some(r => r.length !== S)) {
    throw new Error('transitionLogProb must be SxS');
  }
  if (input.emissionLogProb.some(r => r.length !== S)) throw new Error('every emission row must have S states');

  input.initialLogProb.forEach((v,s)=>assertFiniteOrNegInf(v,`initial[${s}]`));
  input.transitionLogProb.forEach((r,i)=>r.forEach((v,j)=>assertFiniteOrNegInf(v,`transition[${i}][${j}]`)));
  input.emissionLogProb.forEach((r,t)=>r.forEach((v,s)=>assertFiniteOrNegInf(v,`emission[${t}][${s}]`)));

  let prev = new Array<number>(S);
  const back: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(-1));
  for (let s=0;s<S;s++) prev[s]=input.initialLogProb[s]+input.emissionLogProb[0][s];

  for (let t=1;t<T;t++) {
    const cur=new Array<number>(S).fill(Number.NEGATIVE_INFINITY);
    for (let j=0;j<S;j++) {
      let best=Number.NEGATIVE_INFINITY, bestState=0;
      for (let i=0;i<S;i++) {
        const cand=prev[i]+input.transitionLogProb[i][j];
        if (cand>best || (cand===best && i<bestState)) { best=cand; bestState=i; }
      }
      cur[j]=best+input.emissionLogProb[t][j];
      back[t][j]=bestState;
    }
    prev=cur;
  }

  let finalState=0;
  for (let s=1;s<S;s++) if (prev[s]>prev[finalState]) finalState=s;
  const states=new Array<number>(T); states[T-1]=finalState;
  for (let t=T-1;t>0;t--) states[t-1]=back[t][states[t]];
  return {states,logProbability:prev[finalState]};
}
