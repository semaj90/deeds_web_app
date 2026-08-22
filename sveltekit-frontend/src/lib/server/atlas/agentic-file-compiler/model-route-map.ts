export type ModelRuntime='llama-server'|'trt-llm'|'bitnet'|'hosted';
export interface ModelRouteV1 { taskClass:string; runtime:ModelRuntime; modelId:string; minConfidence:number; maxTokens:number; resourceClass:string; priority:number; }
export interface ModelRouteMapV1 { schema:'atlas.model-route-map.v1'; routeMapRevision:string; routes:ModelRouteV1[]; producerRevision:string; }
export function selectModelRoute(map:ModelRouteMapV1,input:{taskClass:string;requiredConfidence:number;estimatedTokens:number;allowedRuntimes?:ModelRuntime[]}):ModelRouteV1|null{
 const allowed=new Set(input.allowedRuntimes ?? ['llama-server','trt-llm','bitnet','hosted']);
 return [...map.routes].filter(r=>r.taskClass===input.taskClass&&allowed.has(r.runtime)&&r.minConfidence>=input.requiredConfidence&&r.maxTokens>=input.estimatedTokens).sort((a,b)=>a.priority-b.priority||a.modelId.localeCompare(b.modelId))[0]??null;
}
