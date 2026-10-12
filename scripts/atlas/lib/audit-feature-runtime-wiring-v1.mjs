import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OWNERS = {
  route: 'sveltekit-frontend/src/routes/api/retrieval/search-unified/+server.ts',
  workflow: 'sveltekit-frontend/src/lib/server/retrieval/semantic-search-workflow.ts',
  shadow: 'sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-context-manifest-shadow-v1.ts',
  adapter: 'sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-adapter.ts',
  provider: 'sveltekit-frontend/src/lib/server/retrieval/revision-qualified-shadow-provider-v1.ts',
  featureDictionary: 'scripts/atlas/lib/product-feature-decomposition-v1.mjs',
  featureBridge: 'scripts/atlas/lib/product-feature-retrieval-bridge-v1.mjs',
  orfRowReader: 'sveltekit-frontend/src/lib/server/atlas/retrieval/orf-feature-row-reader-v1.ts',
  centroidCrosswalk: 'sveltekit-frontend/src/lib/server/atlas/retrieval/centroid-card-candidate-crosswalk-v1.ts',
  sourceRefinement: 'sveltekit-frontend/src/lib/server/atlas/retrieval/ast-grep-refinement-v1.ts',
  agentOrchestrator: 'scripts/agent/agent-orchestrator.mjs',
  aceAssembler: 'scripts/agent/ace-assembler-recommendations.mjs',
  legacyAceQueryRouter: 'sveltekit-frontend/src/lib/server/ace/query-router.ts',
  sourceRefPacketAssembler: 'sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts',
  productionAceAssembler: 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
  productionAceCaller: 'sveltekit-frontend/src/lib/server/ai/openai-facade.ts',
  redisOwner: 'sveltekit-frontend/src/lib/server/redis.ts',
  valkeyOwner: 'sveltekit-frontend/src/lib/server/cache/valkey-client.ts',
};
const check = (id, status, evidence, next) => ({id,status,evidence,next});
const contains = (s, fragment) => typeof s === 'string' && s.includes(fragment);
const hasCacheRead = (source) => /\b(?:getValkeyClient|getRedis|readAcePacketFromRedis|loadCentroidsFromDB)\s*\(|\b(?:redis|valkey)\.(?:get|mget|hget|hgetall|smembers|zrange)\s*\(/i.test(source ?? '');

/** Static wiring census, NOT a runtime readback or code-execution proof. */
export function auditFeatureRuntimeWiringV1(files) {
  const src=(key)=>files[key]??null;
  const route=src('route'), workflow=src('workflow'), shadow=src('shadow'), adapter=src('adapter');
  const orchestrator=src('agentOrchestrator'), aceAssembler=src('aceAssembler');
  const productionAce=src('productionAceAssembler'), productionAceCaller=src('productionAceCaller');
  const legacyAceQueryRouter=src('legacyAceQueryRouter'), sourceRefPacketAssembler=src('sourceRefPacketAssembler');
  const topoScopeStart = productionAce?.indexOf('export function buildTopologicalKagCacheScopeV1') ?? -1;
  const topoScope = topoScopeStart >= 0 ? productionAce.slice(topoScopeStart, topoScopeStart + 700) : '';
  const hasGraphRevisionBinding = /graphRevision|projectionRevision|neighborhoodHash/.test(topoScope);
  const hasSourceWorkspaceBinding = topoScope.includes('sourceRevision') && topoScope.includes('workspaceRevision');
  const hasCompleteRevisionBinding = ['workspaceRevision', 'sourceRevision', 'featureRevision', 'candidateSnapshotRevision'].every((field) => topoScope.includes(field)) && hasGraphRevisionBinding;
  const orchestratorReadsCache=hasCacheRead(orchestrator);
  const checks=[
    check('CANONICAL_SEARCH_ROUTE', contains(route,'runSemanticSearchWorkflow')?'SOURCE_CALL_PRESENT':'BLOCKED', 'route → runSemanticSearchWorkflow', 'If absent, inspect canonical app route'),
    check('SHADOW_CALL', contains(workflow,'runSearchRuntimeContextManifestShadowV1')?'SOURCE_CALL_PRESENT':'BLOCKED', 'workflow → shadow', 'Wire existing shadow, not duplicate manifest'),
    check('SHADOW_PROVIDER_CONTRACT',contains(shadow,'resolveFeatureSources')?'CONTRACT_PRESENT':'BLOCKED','shadow requires resolveFeatureSources','Use existing provider contract'),
    check('SHADOW_CONFIGURED_AT_CALLSITE', /contextManifestShadow\s*:\s*[^,\n}]+/.test(workflow??'')?'INSPECT_REQUIRED':'NOT_ESTABLISHED', 'Static check cannot infer nontrivial configuration or activation', 'Inspect real workflow call and runtime invocation'),
    check('SEARCH_ACE_METHOD_OWNER',contains(adapter,'async searchWithAceManifest(')?'OWNER_PRESENT':'BLOCKED','SearchRuntime ACE method declaration', 'Inspect its actual callers'),
    check('SEARCH_ACE_CALLER',contains(workflow,'adapter.searchWithAceManifest(')?'SOURCE_CALL_PRESENT':'BLOCKED','Workflow call to SearchRuntime ACE method', 'Route the existing workflow through the canonical ACE method only after its required providers are available'),
    check('LIVE_CACHE_HINT_PROVIDER', /cachedPacketHints\s*:/.test(workflow??'') || /centroidCandidateHint\s*:/.test(workflow??'') ? 'CALLSITE_PRESENT_REVIEW_REQUIRED' : 'NOT_WIRED', 'Search workflow source only; provider presence does not prove a live Valkey read or revision-qualified cache result', 'Do not wire cache hints until a read-only producer supplies identity, source/workspace revisions, and generation'),
    check('ROUTE_ACE_MANIFEST_PATH', contains(route,'contextManifestShadow') && contains(workflow,'adapter.searchWithAceManifest(') ? 'SOURCE_PATH_PRESENT' : 'NOT_WIRED', 'Search route response/workflow references only; no manifest admission is implied', 'Connect through existing SearchRuntime only after canonical snapshot and authorized source/profile owners are available'),
    check('CANONICAL_PROFILE_PROVIDER',src('provider')?'FILE_PRESENT_NOT_AUTHENTICATED':'BLOCKED','Local provider file presence only','Bind authorized source reader and 3 independent metric producers'),
    check('FEATURE_DECOMPOSITION',src('featureDictionary')?'FILE_PRESENT':'BLOCKED','Feature proposal dictionary','Connect proposal IDs to actual canonical SearchRuntime candidates'),
    check('FEATURE_TOPFILES_BRIDGE',src('featureBridge')?'FILE_PRESENT_NOT_WIRED':'BLOCKED','TopFiles bridge','Use existing ranking owner and source readback'),
    check('ORF_ROW_READER_OWNER',src('orfRowReader')?'OWNER_PRESENT':'BLOCKED','Persisted ORF exact-gate reader file presence','Inspect its callers and current persisted-row coverage'),
    check('ORF_ROW_READER_PRODUCTION_CALLER',contains(src('provider'),'readOrfRowsForCandidateMapV1')||contains(src('workflow'),'readOrfRowsForCandidateMapV1')?'SOURCE_CALL_PRESENT':'BLOCKED','ORF reader reference in provider/workflow source','Wire only through current revision-pinned map and read-only rows'),
    check('CENTROID_CROSSWALK',src('centroidCrosswalk')?'FILE_PRESENT_DIAGNOSTIC_ONLY':'BLOCKED','Centroid exemplars may only route','Do not reenable hard Qdrant filter'),
    check('ACE_ASSEMBLER_CACHE_READ',hasCacheRead(aceAssembler)?'CACHE_READ_REFERENCE_PRESENT':'NO_CACHE_READ_PATH_IN_ASSEMBLER','Static scan of the ACE assembler for known Valkey/Redis read APIs; this is not call-graph proof','Keep cache resolution in its existing owner and pass only qualified candidates to ACE'),
    check('PRODUCTION_ACE_PROMPT_CACHE',hasCacheRead(productionAce)&&contains(productionAce,'aceTopologicalKagKey')?'SOURCE_PATH_PRESENT':'NOT_ESTABLISHED','Production AI ACE context assembler contains a shared-cache read path for its topological/KAG prompt block; static evidence is not a live cache hit','Verify cache key inputs, invalidation revisions, and runtime hit/miss behavior'),
    check('PRODUCTION_ACE_CACHE_REVISION_BINDING',hasCompleteRevisionBinding?'REVISION_FIELDS_PRESENT':hasSourceWorkspaceBinding&&hasGraphRevisionBinding?'CACHE_KEY_SUPPORTS_SOURCE_WORKSPACE_GRAPH_DIMENSIONS':hasGraphRevisionBinding?'PARTIAL_GRAPH_PROJECTION_ONLY':'REVISION_BINDING_NOT_ESTABLISHED','Static check of cache-key capability only; legacy ranked-card producers do not supply/authenticate those values, and feature/candidate revisions may be absent','Use authoritative source/workspace and candidate revisions where the existing producer provides them'),
    check('LEGACY_ACE_CARD_REVISION_BINDING',contains(legacyAceQueryRouter,'source_revision')&&contains(legacyAceQueryRouter,'workspace_revision')&&contains(sourceRefPacketAssembler,'source_revision')&&contains(sourceRefPacketAssembler,'workspace_revision')?'REVISION_FIELDS_REFERENCED':'LEGACY_RANKED_CARDS_UNBOUND','Legacy query-router and source-ref packet assembler source census; their ranked-card producers must carry actual values, not just declare fields','Bridge from canonical revision-qualified SearchRuntime candidates or keep these cache dimensions null'),
    check('PRODUCTION_ACE_CALLER',contains(productionAceCaller,'assembleACEContext')&&contains(productionAceCaller,'buildACEPromptCached')?'SOURCE_CALLS_PRESENT':'NOT_ESTABLISHED','OpenAI facade references the production ACE assembly/cache functions; this is source-call evidence only','Verify request-level manifest and evidence bindings independently'),
    check('CENTROID_HINT_TO_ACE_EVIDENCE', 'NOT_ESTABLISHED','Production ACE prompt caching is distinct from centroid-cache candidate hints; no admitted source/ontology evidence path is inferred','Keep centroid hints diagnostic until canonical candidate and evidence readback'),
    check('ORCHESTRATOR_VALKEY_TO_ACE',!orchestratorReadsCache&&contains(orchestrator,'Valkey')&&contains(orchestrator,'ace.addCandidate(')?'STATIC_MENTION_ONLY':orchestratorReadsCache?'CACHE_READ_REFERENCE_REQUIRES_DATAFLOW_REVIEW':'NOT_ESTABLISHED','Static source census cannot prove that a cache result reaches ACE evidence','Trace the actual cache result to addCandidate and verify packet/source revisions'),
    check('ONTOLOGY_ADMISSION','NOT_ESTABLISHED','Static source census cannot establish persisted admitted tuple','Use independent canonical ontology tuple readback'),
    check('MANIFEST_READBACK','NOT_ESTABLISHED','Static source census cannot establish receipt identity','Recompute canonical checksum with existing builder and verify grounded source'),
    check('ORNITH_MANIFEST_RECEIPT','NOT_ESTABLISHED','No model receipt independently read back','Bind actual model/prompt revisions and manifest checksum'),
  ];
  return {schema:'atlas.feature-runtime-wiring-audit.v1',authority:'SOURCE_CENSUS_ONLY',checks,allLiveProven:false,writesPerformed:false};
}

export async function runFeatureRuntimeWiringAuditV1(root) {
  const files={};
  for(const [key,relative] of Object.entries(OWNERS)) {
    try{ files[key]=await readFile(resolve(root,relative),'utf8'); }
    catch(e){if(e?.code==='ENOENT') files[key]=null; else throw e;}
  }
  return {...auditFeatureRuntimeWiringV1(files),paths:OWNERS};
}

if (process.argv[1]?.endsWith('audit-feature-runtime-wiring-v1.mjs')) {
  const root=resolve(process.argv[2]??'.');
  console.log(JSON.stringify(await runFeatureRuntimeWiringAuditV1(root),null,2));
}
