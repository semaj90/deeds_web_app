/**
 * GraphSearch-inspired traversal over canonical n-ary hyperedges.
 * Traversal is a bounded evidence expansion policy, not another retrieval owner.
 */
import type { HyperedgeSearchParams,TraversalStep,TraversalResult,SearchMode,Hyperedge } from './hypergraph-types.js';
import { searchHyperedges } from './hypergraph-search.js';

export interface HypergraphTraversalBudget{maxEdges:number;maxMembers:number;maxHops:number;maxTokens:number;maxMillis:number;}
export interface BudgetedTraversalResult extends TraversalResult{exhaustedBy:Array<'edges'|'members'|'hops'|'tokens'|'millis'>;memberCount:number;estimatedTokens:number;}
const estimateTokens=(value:string)=>Math.max(1,Math.ceil(value.length/4));
const edgeTokenEstimate=(edge:Hyperedge)=>estimateTokens(edge.label??edge.edge_type)+edge.members.reduce((t,m)=>t+estimateTokens(m.member_key),0);

async function hop(anchorKey:string,hopNum:number,limit:number):Promise<{step:TraversalStep;edges:Hyperedge[];scoredEdges:Array<{edge:Hyperedge;score:number}>}>{
  const {results}=await searchHyperedges({member_key:anchorKey,limit});const decay=1/hopNum;const scores:Record<string,number>={};
  const scoredEdges=results.map(result=>({edge:result.edge,score:result.activationScore*decay}));
  for(const {edge,score} of scoredEdges)for(const member of edge.members){if(member.member_key===anchorKey)continue;scores[member.member_key]=Math.max(scores[member.member_key]??0,score);}
  return{step:{hop:hopNum,anchor_key:anchorKey,candidates:Object.keys(scores),scores},edges:scoredEdges.map(x=>x.edge),scoredEdges};
}

export async function traverseHop1(anchorKey:string,limit=30):Promise<TraversalResult>{const started=Date.now();const {step,edges}=await hop(anchorKey,1,limit);return{mode:'hop1',anchor_key:anchorKey,steps:[step],edges,totalHops:1,durationMs:Date.now()-started};}

export async function traverseMultihop(anchorKey:string,maxHops=2,limitPerHop=20):Promise<TraversalResult>{
  const result=await traverseMultihopBounded(anchorKey,{maxEdges:Number.MAX_SAFE_INTEGER,maxMembers:Number.MAX_SAFE_INTEGER,maxHops,maxTokens:Number.MAX_SAFE_INTEGER,maxMillis:Number.MAX_SAFE_INTEGER},limitPerHop);
  const {exhaustedBy:_e,memberCount:_m,estimatedTokens:_t,...legacy}=result;return legacy;
}

/**
 * Bounded expansion invariant: only ADMITTED hyperedges may contribute a score
 * or seed the next frontier. Returned-but-over-budget relations are invisible to
 * subsequent hops. The frontier is ordered by marginal activation score.
 */
export async function traverseMultihopBounded(anchorKey:string,budget:HypergraphTraversalBudget,limitPerHop=20):Promise<BudgetedTraversalResult>{
  const started=Date.now(),visited=new Set<string>([anchorKey]),steps:TraversalStep[]=[];const allEdges=new Map<string,Hyperedge>();const exhaustedBy:BudgetedTraversalResult['exhaustedBy']=[];
  let frontier=[anchorKey],memberCount=0,estimatedTokens=0;const maxHops=Math.max(0,budget.maxHops);
  outer:for(let h=1;h<=maxHops&&frontier.length>0;h++){
    const mergedScores:Record<string,number>={};const newCandidates=new Set<string>();
    for(const anchor of frontier){
      if(Date.now()-started>=budget.maxMillis){exhaustedBy.push('millis');break outer;}
      if(allEdges.size>=budget.maxEdges){exhaustedBy.push('edges');break outer;}
      const remainingEdges=Math.max(0,budget.maxEdges-allEdges.size),requestLimit=Math.min(limitPerHop,remainingEdges);if(requestLimit<=0){exhaustedBy.push('edges');break outer;}
      const {scoredEdges}=await hop(anchor,h,requestLimit);
      for(const {edge,score} of scoredEdges){
        if(Date.now()-started>=budget.maxMillis){exhaustedBy.push('millis');break outer;}
        const already=allEdges.has(edge.id);const nextMembers=memberCount+(already?0:edge.members.length);const nextTokens=estimatedTokens+(already?0:edgeTokenEstimate(edge));
        if(!already&&allEdges.size+1>budget.maxEdges){exhaustedBy.push('edges');break outer;}
        if(!already&&nextMembers>budget.maxMembers){exhaustedBy.push('members');continue;}
        if(!already&&nextTokens>budget.maxTokens){exhaustedBy.push('tokens');continue;}
        if(!already){allEdges.set(edge.id,edge);memberCount=nextMembers;estimatedTokens=nextTokens;}
        for(const member of edge.members){const key=member.member_key;if(key===anchor||visited.has(key))continue;mergedScores[key]=Math.max(mergedScores[key]??0,score);newCandidates.add(key);}
      }
    }
    const newKeys=[...newCandidates].sort((a,b)=>(mergedScores[b]??0)-(mergedScores[a]??0)||a.localeCompare(b));
    steps.push({hop:h,anchor_key:anchorKey,candidates:newKeys,scores:mergedScores});newKeys.forEach(key=>visited.add(key));frontier=newKeys;
  }
  if(steps.length>=maxHops&&maxHops>0)exhaustedBy.push('hops');
  return{mode:'multihop',anchor_key:anchorKey,steps,edges:[...allEdges.values()],totalHops:steps.length,durationMs:Date.now()-started,exhaustedBy:[...new Set(exhaustedBy)],memberCount,estimatedTokens};
}

export async function traverseFlat(params:Omit<HyperedgeSearchParams,'search_mode'|'anchor_key'|'max_hops'>):Promise<TraversalResult>{const started=Date.now();const {results}=await searchHyperedges(params);const scores:Record<string,number>={};for(const result of results)for(const key of result.matchedMembers)scores[key]=Math.max(scores[key]??0,result.activationScore);return{mode:'global',anchor_key:'',steps:[{hop:0,anchor_key:'',candidates:Object.keys(scores),scores}],edges:results.map(r=>r.edge),totalHops:0,durationMs:Date.now()-started};}

export async function traverseHypergraph(params:HyperedgeSearchParams):Promise<TraversalResult>{const mode:SearchMode=params.search_mode??'global',anchor=params.anchor_key??'',maxHops=params.max_hops??2,limit=params.limit??20;switch(mode){case'hop1':return traverseHop1(anchor,limit);case'multihop':return traverseMultihop(anchor,maxHops,Math.max(1,Math.ceil(limit/Math.max(1,maxHops))));default:return traverseFlat(params);}}
