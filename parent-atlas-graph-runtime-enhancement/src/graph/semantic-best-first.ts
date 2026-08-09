// EXPERIMENTAL. Not claimed to be admissible A*.
// Keep external to Neo4j until Domain #10 proves value.

export interface Neighbor {
  key: string;
  edgeType: string;
  edgeCost: number;
  semanticDistance: number;
  taxonomyDistance: number;
  routingDistance: number;
}
export interface Weights { semantic:number; taxonomy:number; routing:number; }
export interface State { key:string; g:number; h:number; f:number; path:string[]; }

export const heuristic = (n: Neighbor, w: Weights) =>
  w.semantic*n.semanticDistance +
  w.taxonomy*n.taxonomyDistance +
  w.routing*n.routingDistance;

export async function semanticBestFirst(
  start: string,
  isGoal: (key:string)=>boolean,
  expand: (key:string)=>Promise<Neighbor[]>,
  w: Weights,
  maxExpanded = 500
): Promise<State|null> {
  const q: State[] = [{key:start,g:0,h:0,f:0,path:[start]}];
  const best = new Map<string,number>([[start,0]]);
  let expanded = 0;
  while (q.length && expanded < maxExpanded) {
    q.sort((a,b)=>a.f-b.f);
    const cur = q.shift()!;
    if (isGoal(cur.key)) return cur;
    expanded++;
    for (const n of await expand(cur.key)) {
      const g = cur.g + n.edgeCost;
      if (g >= (best.get(n.key) ?? Infinity)) continue;
      best.set(n.key,g);
      const h = heuristic(n,w);
      q.push({key:n.key,g,h,f:g+h,path:[...cur.path,n.key]});
    }
  }
  return null;
}
