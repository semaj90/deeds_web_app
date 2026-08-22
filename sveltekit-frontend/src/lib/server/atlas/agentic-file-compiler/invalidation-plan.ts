import { sha256Stable } from './contracts.js';
export type InvalidationTarget='bitfrost'|'context-manifest'|'prompt-plan'|'prefill'|'lexical'|'ast'|'semantic_768'|'qdrant'|'graph'|'neo4j'|'cagra'|'diskann';
export interface InvalidationPlanV1 { schema:'atlas.invalidation-plan.v1'; invalidationId:string; mutationId:string; sourceRefs:string[]; invalidate:InvalidationTarget[]; eagerRefresh:InvalidationTarget[]; lazyRefresh:InvalidationTarget[]; workspaceRevision:string; sourceRevisionAfter:string; checksum:string; }
export function buildInvalidationPlan(input:{mutationId:string;sourceRefs:string[];workspaceRevision:string;sourceRevisionAfter:string}):InvalidationPlanV1{
 const invalidate:InvalidationTarget[]=['bitfrost','context-manifest','prompt-plan','prefill','lexical','ast','semantic_768','qdrant','graph','neo4j','cagra','diskann'];
 const eagerRefresh:InvalidationTarget[]=['lexical','ast','semantic_768','qdrant','graph','neo4j'];
 const lazyRefresh:InvalidationTarget[]=['cagra','diskann','prefill'];
 const body={schema:'atlas.invalidation-plan.v1' as const,invalidationId:`invalidate:${input.mutationId}`,mutationId:input.mutationId,sourceRefs:[...new Set(input.sourceRefs)].sort(),invalidate,eagerRefresh,lazyRefresh,workspaceRevision:input.workspaceRevision,sourceRevisionAfter:input.sourceRevisionAfter};
 return {...body,checksum:sha256Stable(body)};
}
