export function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s) || 1e-12;
}

export function cosine(a: number[], b: number[]) {
  return dot(a, b) / (norm(a) * norm(b));
}

export type Candidate = { id: string; payload?: any; vector: number[] };

export function rerank(queryVec: number[], candidates: Candidate[]) {
  const scored = candidates.map((c) => ({
    id: c.id,
    score: cosine(queryVec, c.vector),
    payload: c.payload,
  }));
  scored.sort((x, y) => y.score - x.score);
  return scored;
}
