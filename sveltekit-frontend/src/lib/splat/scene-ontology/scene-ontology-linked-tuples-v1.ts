/** Parent Atlas SCENE-SEMANTIC ontology bridge. Pure ECMAScript/TypeScript, no DB writes.
 * Separate from the existing 13-group CODE domain taxonomy / feature_ontology_tuples table.
 * Scene identity and exact evidence lineage are never produced by this module.
 */
export const SCENE_ONTOLOGY_VERSION = 'parent-atlas.scene-ontology.v1' as const;
export const SEMANTIC_ID_UNRESOLVED = 0;

export type NodeKind = 'entity' | 'recipe' | 'observation' | 'cue' | 'source' | 'scope' | 'region' | 'review' | 'concept';
export type Origin = 'SYNTHETIC' | 'PROMPT_PROPOSAL' | 'MODEL_PROPOSAL' | 'SOURCE_OBSERVATION' | 'HUMAN_REVIEWED';
export type Predicate =
  | 'IS_A' | 'PART_OF' | 'CONTAINS' | 'LOCATED_IN' | 'CONNECTS_TO'
  | 'HAS_GEOMETRY' | 'USES_MATERIAL' | 'INSTANCE_OF' | 'USES_RECIPE'
  | 'HAS_RENDER_STYLE' | 'HAS_APPEARANCE' | 'DETECTED_IN' | 'OBSERVES'
  | 'HAS_PIXEL_REGION' | 'PROPOSES_PROXY' | 'PROPOSES_PLACEMENT' | 'CUE_TARGETS' | 'CUE_SOURCE'
  | 'CUE_CLASSIFIED_AS' | 'REVIEWED_BY' | 'DERIVED_FROM' | 'SUPPORTED_BY'
  | 'CONTRADICTS' | 'SCOPED_TO' | 'RENDERS_AS' | 'HAS_ARTIFACT'
  | 'SHARES_GEOMETRY_WITH' | 'PARTICIPATES_IN';

export interface CatalogConcept { id: string; parent: string | null; label: string; tier: 0 | 1 | 2; }
export interface SceneCatalog {
  schema: string;
  concepts: CatalogConcept[];
  relations: { id: string; subjectKind: string; objectKind: string }[];
}
export interface SourceBinding {
  sourceKind: 'EVIDENCE' | 'PROMPT' | 'FIXTURE';
  sourceId: string;
  evidenceId?: string; // Exact UUID from the existing authorized case authority; never inferred.
  sourceRevision?: string; // hex digest of the exact source revision
  contentSha256?: string; // exact source bytes if known
  modelId?: string;
  modelArtifactSha256?: string;
  runId?: string;
}
export interface PixelRegion {
  width: number;
  height: number;
  box: [number, number, number, number]; // x0,y0,x1,y1 in ORIGINAL image pixel coordinates
}
export interface SceneNode {
  id: string; // scene-local ID, not an evidence/person ID
  kind: NodeKind;
  conceptId: string;
  origin: Origin;
  caseId: string; // authorized case scope or 'synthetic-demo'
  sceneId: string;
  label?: string;
  source?: SourceBinding;
  region?: PixelRegion;
  recipeKey?: string;
  sceneIntervalMs?: [number, number]; // optional reviewed/proposed SCENE clock; never inferred from image boxes
}
export interface SceneTuple {
  subject: string;
  predicate: Predicate;
  object: string;
  origin: Origin;
  confidence?: number; // algorithmic confidence only; NEVER a verified-fact probability
  source?: SourceBinding;
  sourceIntervalMs?: [number, number]; // CUE_SOURCE edge, exact source clock if separately known
}
export interface TupleGraph { schema: typeof SCENE_ONTOLOGY_VERSION; nodes: SceneNode[]; tuples: SceneTuple[]; }
export interface ValidationResult { valid: boolean; errors: string[]; counts: { nodes: number; tuples: number; cues: number; observedRegions: number }; }
const SHA = /^[a-f\d]{64}$/i;
const VALID_NODE_KINDS = new Set<NodeKind>(['entity','recipe','observation','cue','source','scope','region','review','concept']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[a-zA-Z0-9_.:/-]{1,160}$/;
const CUE_SOURCE_PREDICATE: Predicate = 'CUE_SOURCE';
const sourceRequired = new Set<Predicate>(['DETECTED_IN', 'HAS_PIXEL_REGION', 'DERIVED_FROM', 'SUPPORTED_BY']);

function checkSource(source: SourceBinding | undefined, errors: string[], prefix: string): void {
  if (!source) { errors.push(`${prefix}:SOURCE_MISSING`); return; }
  if (!['EVIDENCE','PROMPT','FIXTURE'].includes(source.sourceKind) || !SAFE_ID.test(source.sourceId)) {
    errors.push(`${prefix}:SOURCE_KIND_OR_ID_INVALID`);
  }
  if (source.sourceKind === 'EVIDENCE') {
    if (!source.evidenceId || !UUID.test(source.evidenceId)) errors.push(`${prefix}:EVIDENCE_ID_INVALID`);
    if (!source.sourceRevision || !/^sha256:[a-f\d]{64}$/i.test(source.sourceRevision)) errors.push(`${prefix}:SOURCE_REVISION_INVALID`);
    if (!source.contentSha256 || !SHA.test(source.contentSha256)) errors.push(`${prefix}:SOURCE_SHA256_INVALID`);
  }
  if (source.contentSha256 && !SHA.test(source.contentSha256)) errors.push(`${prefix}:BAD_CONTENT_SHA`);
  if (source.modelArtifactSha256 && !SHA.test(source.modelArtifactSha256)) errors.push(`${prefix}:BAD_MODEL_SHA`);
}

/** Static ontology validation: path parent existence, unique IDs, no cycles, declared relation set. */
export function validateSceneCatalog(catalog: SceneCatalog): string[] {
  const errors: string[] = [];
  if (catalog?.schema !== 'parent-atlas.scene-ontology.catalog.v1') errors.push('CATALOG_SCHEMA');
  if (!Array.isArray(catalog?.concepts) || catalog.concepts.length === 0) return ['CATALOG_EMPTY'];
  const byId = new Map<string, CatalogConcept>();
  for (const c of catalog.concepts) {
    if (byId.has(c.id)) errors.push(`DUPLICATE_CONCEPT:${c.id}`);
    if (!/^pa:[a-z][a-z0-9-]*(\.[a-z0-9-]+){0,2}$/.test(c.id)) errors.push(`INVALID_CONCEPT_ID:${c.id}`);
    byId.set(c.id, c);
  }
  for (const c of catalog.concepts) {
    if (c.parent === null && c.tier !== 0) errors.push(`ROOT_TIER_MISMATCH:${c.id}`);
    if (c.parent !== null && (!byId.has(c.parent) || !c.id.startsWith(`${c.parent}.`) || c.tier !== (byId.get(c.parent)!.tier + 1))) {
      errors.push(`BAD_PARENT:${c.id}`);
    }
  }
  const relations = new Set<string>();
  for (const r of catalog.relations) {
    if (relations.has(r.id)) errors.push(`DUPLICATE_RELATION:${r.id}`);
    relations.add(r.id);
  }
  return errors;
}

/** Exact relationships only. No semantic similarity guessing or implicit case-scoped joins. */
export function validateTupleGraph(graph: TupleGraph, catalog: SceneCatalog, scope?: {caseId: string; sceneId: string; authorizedEvidenceIds?: ReadonlySet<string>}): ValidationResult {
  const errors = validateSceneCatalog(catalog);
  if (graph?.schema !== SCENE_ONTOLOGY_VERSION) errors.push('GRAPH_SCHEMA_INVALID');
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.tuples)) return { valid: false, errors: [...errors,'GRAPH_STRUCTURE'], counts: { nodes: 0, tuples: 0, cues: 0, observedRegions: 0 } };
  if (graph.nodes.length > 10_000 || graph.tuples.length > 50_000) errors.push('GRAPH_SIZE_LIMIT');
  const byId = new Map<string, SceneNode>();
  const concepts = new Set(catalog.concepts.map(c => c.id));
  const relationDefs = new Map(catalog.relations.map(r => [r.id,r]));
  for (const n of graph.nodes) {
    if (!SAFE_ID.test(n.id)) errors.push(`NODE_ID_INVALID:${n.id}`);
    if (!VALID_NODE_KINDS.has(n.kind)) errors.push(`NODE_KIND_INVALID:${n.id}`);
    if (byId.has(n.id)) errors.push(`NODE_DUPLICATE:${n.id}`);
    if (!concepts.has(n.conceptId)) errors.push(`CONCEPT_UNKNOWN:${n.id}`);
    if (!SAFE_ID.test(n.caseId) || !SAFE_ID.test(n.sceneId)) errors.push(`SCOPE_INVALID:${n.id}`);
    if (scope && (n.caseId !== scope.caseId || n.sceneId !== scope.sceneId)) errors.push(`CONTEXT_SCOPE_MISMATCH:${n.id}`);
    if (scope?.authorizedEvidenceIds && n.source?.sourceKind === 'EVIDENCE' && !scope.authorizedEvidenceIds.has(n.source.evidenceId ?? '')) errors.push(`EVIDENCE_NOT_AUTHORIZED:${n.id}`);
    if (n.kind === 'source') checkSource(n.source, errors, n.id);
    if (n.sceneIntervalMs && (n.kind !== 'cue' || n.sceneIntervalMs.length !== 2 || !n.sceneIntervalMs.every(Number.isSafeInteger) || n.sceneIntervalMs[0] < 0 || n.sceneIntervalMs[1] < n.sceneIntervalMs[0])) errors.push(`SCENE_CUE_INTERVAL_INVALID:${n.id}`);
    if (n.kind === 'observation' && n.origin !== 'SOURCE_OBSERVATION' && n.origin !== 'MODEL_PROPOSAL') errors.push(`OBSERVATION_ORIGIN_INVALID:${n.id}`);
    if (n.kind === 'region') {
      const r = n.region;
      if (!r || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width <= 0 || r.height <= 0 || r.width > 32_768 || r.height > 32_768 || !Array.isArray(r.box) || r.box.length !== 4 || !r.box.every(Number.isFinite) || r.box[0] < 0 || r.box[1] < 0 || r.box[2] > r.width || r.box[3] > r.height || r.box[0] >= r.box[2] || r.box[1] >= r.box[3]) {
        errors.push(`PIXEL_REGION_INVALID:${n.id}`);
      }
    }
    byId.set(n.id,n);
  }
  const cueSources = new Map<string, string[]>();
  const observationRegions = new Map<string, number>();
  const observationsWithSources = new Set<string>();
  for (let i=0;i<graph.tuples.length;i++) {
    const t = graph.tuples[i];
    const a = byId.get(t.subject), b = byId.get(t.object);
    const pre = `TUPLE_${i}`;
    if (!a || !b) { errors.push(`${pre}:DANGLING_NODE`); continue; }
    if (a.caseId !== b.caseId || a.sceneId !== b.sceneId) errors.push(`${pre}:CROSS_SCOPE`);
    const def = relationDefs.get(t.predicate);
    if (!def) errors.push(`${pre}:PREDICATE_UNKNOWN`);
    if (def && def.subjectKind !== 'node' && def.subjectKind !== a.kind) errors.push(`${pre}:SUBJECT_KIND_MISMATCH`);
    if (def && def.objectKind !== 'node' && def.objectKind !== b.kind) errors.push(`${pre}:OBJECT_KIND_MISMATCH`);
    if (t.sourceIntervalMs && (t.predicate !== 'CUE_SOURCE' || t.sourceIntervalMs.length !== 2 || !t.sourceIntervalMs.every(Number.isSafeInteger) || t.sourceIntervalMs[0] < 0 || t.sourceIntervalMs[1] < t.sourceIntervalMs[0])) errors.push(`${pre}:SOURCE_INTERVAL_INVALID`);
    if (t.confidence !== undefined && (!Number.isFinite(t.confidence) || t.confidence < 0 || t.confidence > 1)) errors.push(`${pre}:CONFIDENCE_OUT_OF_RANGE`);
    if (t.origin === 'HUMAN_REVIEWED' && t.confidence !== undefined) errors.push(`${pre}:REVIEW_NOT_A_CONFIDENCE_SCORE`);
    if (sourceRequired.has(t.predicate) && t.source) checkSource(t.source, errors, pre);
    if (scope?.authorizedEvidenceIds && t.source?.sourceKind === 'EVIDENCE' && !scope.authorizedEvidenceIds.has(t.source.evidenceId ?? '')) errors.push(`${pre}:EVIDENCE_NOT_AUTHORIZED`);
    if (t.predicate === CUE_SOURCE_PREDICATE) cueSources.set(a.id,[...(cueSources.get(a.id) ?? []),b.id]);
    if (t.predicate === 'HAS_PIXEL_REGION') observationRegions.set(a.id,(observationRegions.get(a.id) ?? 0) + 1);
    if (t.predicate === 'DETECTED_IN') observationsWithSources.add(a.id);
    if (t.predicate === 'PROPOSES_PROXY' && a.origin !== 'MODEL_PROPOSAL' && a.origin !== 'SOURCE_OBSERVATION') errors.push(`${pre}:PROXY_NOT_PROPOSAL`);
    if (t.predicate === 'PROPOSES_PLACEMENT' && a.origin !== 'HUMAN_REVIEWED') errors.push(`${pre}:UNCALIBRATED_PLACEMENT_FORBIDDEN`);
    if (t.predicate === 'CUE_TARGETS' && b.kind !== 'entity') errors.push(`${pre}:CUE_TARGET_NOT_ENTITY`);
    if (t.predicate === 'CUE_SOURCE') {
      if (!b.source) errors.push(`${pre}:CUE_SOURCE_HAS_NO_BINDING`);
    }
    if (t.predicate === 'DETECTED_IN') {
      if (!b.source) errors.push(`${pre}:DETECTION_SOURCE_HAS_NO_BINDING`);
      if (!t.source) errors.push(`${pre}:DETECTION_TUPLE_SOURCE_MISSING`);
      if (t.origin === 'MODEL_PROPOSAL' && (!t.source?.modelId || !t.source?.modelArtifactSha256 || !t.source?.runId)) errors.push(`${pre}:MODEL_PROVENANCE_INCOMPLETE`);
    }
    if (t.predicate === 'OBSERVES' && t.origin === 'HUMAN_REVIEWED' && a.origin !== 'HUMAN_REVIEWED') errors.push(`${pre}:OBSERVATION_CANNOT_AUTO_PROMOTE`);
  }
  for (const n of graph.nodes) {
    if (n.kind === 'cue' && (cueSources.get(n.id) ?? []).length !== 1) errors.push(`CUE_EXACTLY_ONE_SOURCE:${n.id}`);
    if (n.kind === 'observation' && (!observationsWithSources.has(n.id) || !observationRegions.has(n.id))) errors.push(`OBSERVATION_SOURCE_OR_REGION_MISSING:${n.id}`);
  }
  return {valid:errors.length === 0, errors, counts:{nodes:graph.nodes.length, tuples:graph.tuples.length, cues:graph.nodes.filter(n=>n.kind==='cue').length, observedRegions:graph.nodes.filter(n=>n.kind==='region').length}};
}

/** `Uint16` ordinal IDs are fast for in-memory lookup, never primary IDs or stored case/evidence identity. */
export function createSceneConceptLut(catalog: SceneCatalog) {
  const errors = validateSceneCatalog(catalog);
  if (errors.length) throw new Error(`INVALID_SCENE_CATALOG:${errors.join(';')}`);
  const sorted = [...catalog.concepts.map(c=>c.id)].sort();
  if (sorted.length >= 65535) throw new Error('SCENE_LUT_EXCEEDS_UINT16');
  const byId = new Map<string,number>(sorted.map((id,i)=>[id,i+1]));
  const byOrdinal = ['UNRESOLVED',...sorted];
  return {
    version:'parent-atlas.scene-lut.v1',
    entries: sorted.length,
    ordinal(id:string):number {return byId.get(id) ?? SEMANTIC_ID_UNRESOLVED;},
    concept(ordinal:number):string | null {return Number.isInteger(ordinal) && ordinal>0 ? byOrdinal[ordinal]??null:null;},
    pack(ids:string[]):Uint16Array {return Uint16Array.from(ids.map(id=>byId.get(id)??0));}
  };
}

/** Hard type map: semantic candidate does not become a measured location/identity/scene fact. */
export const DETECTION_RECIPE_LUT: Readonly<Record<string,{shape:string; semantic:string}>> = Object.freeze({
  person:{shape:'capsule',semantic:'pa:actor.representation.neutral-humanoid'},
  chair:{shape:'box',semantic:'pa:object.furniture.chair'},
  couch:{shape:'box',semantic:'pa:object.furniture.sofa'},
  'dining table':{shape:'box',semantic:'pa:object.furniture.table'},
  bed:{shape:'box',semantic:'pa:object.furniture.bed'},
  bottle:{shape:'cylinder',semantic:'pa:object.personal-item.bottle'},
  cup:{shape:'cylinder',semantic:'pa:object.personal-item.cup'},
  car:{shape:'box',semantic:'pa:object.transport.car'},
  bus:{shape:'box',semantic:'pa:object.transport.bus'},
  'potted plant':{shape:'sphere',semantic:'pa:object.landscape.shrub'},
  tv:{shape:'box',semantic:'pa:object.appliance.television'}
});
export type DetectionSuggestion = { label:string;score:number; source:SourceBinding;pixel:PixelRegion };
export function chooseIllustrativeGeometry(d: DetectionSuggestion, catalog:SceneCatalog, minScore=0.5) {
  const errors:string[]=[];
  checkSource(d.source,errors,'DETECTION');
  if (errors.length || d.source.sourceKind!=='EVIDENCE' || !Number.isFinite(d.score) || d.score<minScore || d.score>1) return {status:'UNRESOLVED' as const, reason: errors[0]??'CONFIDENCE_OR_SOURCE_MISSING'};
  const key=d.label.trim().toLowerCase().replace(/\s+/g,' ');
  const r=DETECTION_RECIPE_LUT[key];
  if (!r || !catalog.concepts.some(x=>x.id===r.semantic)) return {status:'UNRESOLVED' as const,reason:'NO_EXACT_RECIPE_MATCH'};
  const {width,height,box}=d.pixel;
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||box.length!==4||!box.every(Number.isFinite)||box[0]<0||box[1]<0||box[2]>width||box[3]>height||box[0]>=box[2]||box[1]>=box[3]) return {status:'UNRESOLVED' as const,reason:'BOX_OUT_OF_SOURCE_BOUNDS'};
  return {status:'ILLUSTRATIVE_ONLY' as const,shape:r.shape,semantic:r.semantic,pixel:{width,height,box},depthMeters:null,worldPosition:null,source:d.source};
}

/** Additive LIGHT math, not arbitrary surface/paint mixing. (1,0,0)+(0,0,1) = MAGENTA. */
export function mixAdditiveLights(...rgb:readonly (readonly [number,number,number])[]):[number,number,number] {
  let r=0,g=0,b=0;
  for(const c of rgb){for(const v of c)if(!Number.isFinite(v)||v<0||v>1)throw new Error('RGB_INVALID');r+=c[0];g+=c[1];b+=c[2];}
  return [Math.min(r,1),Math.min(g,1),Math.min(b,1)];
}

/** Resolve bounded synthesis tasks topologically; no LLM, queue or GPU side effects. */
export type SceneStage = 'SOURCE'|'DETECT'|'CONCEPT'|'LAYOUT'|'RECIPE'|'RENDER'|'REVIEW'|'SAVE';
export interface DagTask { id:string; stage:SceneStage; after:string[]; }
export function orderSceneDag(tasks: readonly DagTask[]):DagTask[] {
  if(tasks.length>128)throw new Error('DAG_TOO_LARGE');
  const map=new Map<string,DagTask>();
  for(const t of tasks){if(map.has(t.id)||!SAFE_ID.test(t.id))throw new Error(`TASK_ID_INVALID:${t.id}`);map.set(t.id,t)}
  const state=new Map<string,number>();const result:DagTask[]=[];
  function visit(id:string){const k=state.get(id)??0;if(k===1)throw new Error('DAG_CYCLE');if(k===2)return;const t=map.get(id);if(!t)throw new Error(`DAG_MISSING_DEP:${id}`);state.set(id,1);for(const dep of t.after)visit(dep);state.set(id,2);result.push(t)}
  for(const id of map.keys())visit(id);return result;
}
