/** Adapter from parent-atlas.prompt-scene-plan.v1 -> scene-local semantic graph.
 * Keeps primitive registry, mesh geometry, live arena, and case authority in their OWN modules.
 * Import into existing app, passing its ScenePlanV1 as a structural type.
 */
import type {SceneNode,SceneTuple,TupleGraph,SourceBinding} from './scene-ontology-linked-tuples-v1.js';
import {SCENE_ONTOLOGY_VERSION} from './scene-ontology-linked-tuples-v1.js';
import type { SceneRuntimeRecipeV1 } from '../../reconstruction/scene-runtime-recipe-v1.js';

export type PromptPlanLike = {
  schema:'parent-atlas.prompt-scene-plan.v1';
  preset:'studio'|'four-bedroom-two-story';
  provenance:'GENERATED_ILLUSTRATIVE_UNCALIBRATED';
  floors:{index:number;rooms:{id:string;kind:string;x:number;z:number;width:number;depth:number}[]}[];
  props:{id:string;kind:string;roomId:string;floor:number}[];
  actors:{id:string;floor:number;x:number;z:number;presentation:'NEUTRAL_GENERATED_STATIC'}[];
  cues:{id:string;actorIds:string[];status:'UNREVIEWED_STORY_PROPOSAL';actions:[]}[];
};
export interface GraphBuildScope {
  caseId:string;
  sceneId:string;
  promptSource:SourceBinding;
}
const ROOM:Readonly<Record<string,string>>={
  living:'living-room',dining:'dining-room',kitchen:'kitchen',bedroom:'bedroom',bathroom:'bathroom',
  hall:'hallway',stairs:'stairwell',entry:'foyer',storage:'closet'
};
const PROP:Readonly<Record<string,string>>={
  table:'object.furniture.table',chair:'object.furniture.chair',bed:'object.furniture.bed',
  sofa:'object.furniture.sofa',counter:'object.furniture.counter',sink:'object.fixture.sink',
  lamp:'object.fixture.light-fixture',stairs:'space.structure.stair',plant:'object.landscape.shrub',
  desk:'object.furniture.desk'
};
// Units and all geometric dimensions come from the validated prompt scene plan, not the taxonomy.
const primitiveFor=(kind:string)=> kind==='sink'||kind==='plant'?'cylinder':'box';
export function createLinkedTuplesFromPromptScene(plan:PromptPlanLike,ctx:GraphBuildScope):TupleGraph {
  if(plan.schema!=='parent-atlas.prompt-scene-plan.v1'||plan.provenance!=='GENERATED_ILLUSTRATIVE_UNCALIBRATED'||plan.floors.length>2||plan.floors.length===0||plan.props.length>100||plan.actors.length>16||plan.cues.length>32)throw new Error('PROMPT_SCENE_INVALID_OR_UNBOUNDED');
  if(ctx.promptSource.sourceKind!=='PROMPT'&&ctx.promptSource.sourceKind!=='FIXTURE')throw new Error('PROMPT_SCENE_SOURCE_MUST_BE_PROMPT_OR_FIXTURE');
  const nodes:SceneNode[]=[];const tuples:SceneTuple[]=[];
  const add=(id:string,kind:SceneNode['kind'],category:string,recipeKey?:string)=>{
    nodes.push({id,kind,conceptId:'pa:'+category,origin:'SYNTHETIC',caseId:ctx.caseId,sceneId:ctx.sceneId,...(recipeKey?{recipeKey}:{})});
  };
  const edge=(subject:string,predicate:SceneTuple['predicate'],object:string)=>tuples.push({subject,predicate,object,origin:'SYNTHETIC'});
  add('entity:building','entity',plan.preset==='studio'?'space.building.studio':'space.building.house');
  const srcId='source:prompt';
  nodes.push({id:srcId,kind:'source',conceptId:'pa:observation.source.prompt',origin:'PROMPT_PROPOSAL',caseId:ctx.caseId,sceneId:ctx.sceneId,source:ctx.promptSource});
  const floorRooms = new Map<number,{id:string;kind:string;x:number;z:number;width:number;depth:number}[]>();
  for(const floor of plan.floors){
    add(`entity:floor-${floor.index}`,'entity',floor.index===0?'space.floor.ground':'space.floor.upper');
    edge(`entity:floor-${floor.index}`,'PART_OF','entity:building');
    floorRooms.set(floor.index,floor.rooms);
    for(const r of floor.rooms){
      const term=ROOM[r.kind]; if(!term)throw new Error(`UNKNOWN_ROOM_KIND:${r.kind}`);
      add(`entity:room-${r.id}`,'entity',`space.room.${term}`);
      edge(`entity:room-${r.id}`,'PART_OF',`entity:floor-${floor.index}`);
    }
  }
  const kinds=[...new Set(plan.props.map(p=>primitiveFor(p.kind)))].sort();
  for(const primitive of kinds)add(`recipe:${primitive}`,'recipe',`geometry.primitive.${primitive}`,`registry-v1:${primitive}`);
  for(const prop of plan.props){
    const category=PROP[prop.kind];if(!category)throw new Error(`UNKNOWN_PROP_KIND:${prop.kind}`);
    add(`entity:prop-${prop.id}`,'entity',category);
    edge(`entity:prop-${prop.id}`,'LOCATED_IN',`entity:room-${prop.roomId}`);
    edge(`entity:prop-${prop.id}`,'HAS_GEOMETRY',`recipe:${primitiveFor(prop.kind)}`);
  }
  if(plan.actors.length)add('recipe:humanoid','recipe','actor.representation.neutral-humanoid','neutral-avatar-v1');
  for(const a of plan.actors){
    if(a.presentation!=='NEUTRAL_GENERATED_STATIC')throw new Error('ACTOR_NOT_STATIC');
    add(`entity:actor-${a.id}`,'entity','actor.representation.neutral-humanoid');
    edge(`entity:actor-${a.id}`,'INSTANCE_OF','recipe:humanoid');
    const room=floorRooms.get(a.floor)?.find(r=>a.x>=r.x&&a.z>=r.z&&a.x<=r.x+r.width&&a.z<=r.z+r.depth);
    edge(`entity:actor-${a.id}`,'LOCATED_IN',room?`entity:room-${room.id}`:`entity:floor-${a.floor}`);
  }
  for(const cue of plan.cues){
    if(cue.status!=='UNREVIEWED_STORY_PROPOSAL'||cue.actions.length!==0)throw new Error('CUE_MUST_BE_UNREVIEWED_AND_STATIC');
    const id=`cue:${cue.id}`;
    nodes.push({id,kind:'cue',conceptId:'pa:event.cue.uncertainty',origin:'PROMPT_PROPOSAL',caseId:ctx.caseId,sceneId:ctx.sceneId});
    tuples.push({subject:id,predicate:'CUE_SOURCE',object:srcId,origin:'PROMPT_PROPOSAL'});
    for(const actorId of cue.actorIds)tuples.push({subject:id,predicate:'CUE_TARGETS',object:`entity:actor-${actorId}`,origin:'PROMPT_PROPOSAL'});
  }
  return {schema:SCENE_ONTOLOGY_VERSION,nodes,tuples};
}

export interface RenderableOntologyRecipeV1 {
  conceptId: string;
  renderable: boolean;
  semanticOnlyReason?: 'NON_RENDERABLE_SEMANTIC_CONCEPT' | 'UNMAPPED_CONCEPT';
  targetKind?: 'primitive' | 'prefab' | 'actor_template';
  recipeKey?: string;
}

const SEMANTIC_ONLY_PREFIXES = ['event.', 'observation.', 'evidence.', 'provenance.', 'time.', 'claim.', 'review.'];

export const RENDERABLE_ONTOLOGY_RECIPE_MAP_V1: Readonly<Record<string, { targetKind: 'primitive' | 'prefab' | 'actor_template'; recipeKey: string }>> = {
  'space.building.studio': { targetKind: 'prefab', recipeKey: 'house.studio.v1' },
  'space.building.house': { targetKind: 'prefab', recipeKey: 'house.four_bedroom.v1' },
  'space.structure.stair': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.table': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.chair': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.bed': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.sofa': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.counter': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.furniture.desk': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.fixture.sink': { targetKind: 'primitive', recipeKey: 'registry-v1:cylinder' },
  'object.fixture.light-fixture': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'object.landscape.shrub': { targetKind: 'primitive', recipeKey: 'registry-v1:cylinder' },
  'geometry.primitive.box': { targetKind: 'primitive', recipeKey: 'registry-v1:box' },
  'geometry.primitive.cylinder': { targetKind: 'primitive', recipeKey: 'registry-v1:cylinder' },
  'actor.representation.neutral-humanoid': { targetKind: 'actor_template', recipeKey: 'neutral-avatar-v1' },
};

/**
 * Maps ONLY renderable ontology concepts to existing primitive, prefab, or actor recipes.
 * Keeps events, claims, provenance, and time strictly as semantic data (never geometry).
 */
export function resolveRenderableOntologyRecipeV1(rawConceptId: string): RenderableOntologyRecipeV1 {
  const normalized = rawConceptId.startsWith('pa:') ? rawConceptId.slice(3) : rawConceptId;
  if (SEMANTIC_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return {
      conceptId: normalized,
      renderable: false,
      semanticOnlyReason: 'NON_RENDERABLE_SEMANTIC_CONCEPT',
    };
  }
  const mapped = RENDERABLE_ONTOLOGY_RECIPE_MAP_V1[normalized];
  if (!mapped) {
    return {
      conceptId: normalized,
      renderable: false,
      semanticOnlyReason: 'UNMAPPED_CONCEPT',
    };
  }
  return {
    conceptId: normalized,
    renderable: true,
    targetKind: mapped.targetKind,
    recipeKey: mapped.recipeKey,
  };
}

export interface CompiledAssemblyPlacementsAndTuplesV1 {
  schema: 'atlas.assembly-placements-tuples.v1';
  canonicalAuthority: false;
  writesPerformed: false;
  memoryBudgetMiB: number;
  maxInstances: number;
  placements: SceneRuntimeRecipeV1['placements'];
  tupleGraph: TupleGraph;
  animationCueBindings: { cueId: string; targetId: string; capability: 'door' | 'light' }[];
}

/**
 * Compile attached modular prefabAssemblies on a SceneRuntimeRecipeV1 into bounded
 * 3D placements + ontology linked tuples (PART_OF, HAS_GEOMETRY, CUE_TARGETS)
 * respecting Three.js scene memory (<=8 MiB active cell) and instance limits (<=256).
 */
export function compilePrefabAssemblyPlacementsAndTuplesV1(
  recipe: SceneRuntimeRecipeV1,
): CompiledAssemblyPlacementsAndTuplesV1 {
  const maxInstances = Math.min(256, recipe.quality.maxInstances);
  const memoryBudgetMiB = Math.min(8, recipe.streaming.activeSceneMemoryMiB);
  const assemblies = recipe.prefabAssemblies ?? [];

  const nodes: SceneNode[] = [];
  const tuples: SceneTuple[] = [];
  const placements: SceneRuntimeRecipeV1['placements'] = [];
  const animationCueBindings: { cueId: string; targetId: string; capability: 'door' | 'light' }[] = [];
  const seenRecipeNodes = new Set<string>();

  for (const assembly of assemblies) {
    const rootId = `assembly:${assembly.prefabId}`;
    nodes.push({
      id: rootId,
      kind: 'entity',
      conceptId: 'pa:space.building.house',
      origin: 'SYNTHETIC',
      caseId: recipe.caseId,
      sceneId: recipe.sceneId,
      recipeKey: assembly.prefabId,
    });

    for (const comp of assembly.components) {
      if (placements.length >= maxInstances) break;

      const entityId = `entity:${comp.objectId}`;
      const recipeNodeId = `recipe:${comp.recipeId}`;
      if (!seenRecipeNodes.has(recipeNodeId)) {
        seenRecipeNodes.add(recipeNodeId);
        nodes.push({
          id: recipeNodeId,
          kind: 'recipe',
          conceptId: `pa:geometry.primitive.${comp.primitiveKind === 'cylinder' ? 'cylinder' : 'box'}`,
          origin: 'SYNTHETIC',
          caseId: recipe.caseId,
          sceneId: recipe.sceneId,
          recipeKey: comp.recipeId,
        });
      }

      nodes.push({
        id: entityId,
        kind: 'entity',
        conceptId: comp.ontologyConceptId,
        origin: 'SYNTHETIC',
        caseId: recipe.caseId,
        sceneId: recipe.sceneId,
        recipeKey: comp.recipeId,
      });
      tuples.push({ subject: entityId, predicate: 'PART_OF', object: rootId, origin: 'SYNTHETIC' });
      tuples.push({ subject: entityId, predicate: 'HAS_GEOMETRY', object: recipeNodeId, origin: 'SYNTHETIC' });

      placements.push({
        placementId: `place:${comp.objectId}`,
        targetKind: 'primitive',
        targetId: comp.objectId,
        positionMeters: comp.position,
        rotationQuaternion: comp.rotationXyzw,
        scale: comp.scale,
      });

      if (comp.capability === 'door' || comp.capability === 'light') {
        const cueId = `cue:anim:${comp.objectId}`;
        nodes.push({
          id: cueId,
          kind: 'cue',
          conceptId: 'pa:event.cue.uncertainty',
          origin: 'PROMPT_PROPOSAL',
          caseId: recipe.caseId,
          sceneId: recipe.sceneId,
        });
        tuples.push({ subject: cueId, predicate: 'CUE_TARGETS', object: entityId, origin: 'PROMPT_PROPOSAL' });
        animationCueBindings.push({ cueId, targetId: comp.objectId, capability: comp.capability });
      }
    }
  }

  return {
    schema: 'atlas.assembly-placements-tuples.v1',
    canonicalAuthority: false,
    writesPerformed: false,
    memoryBudgetMiB,
    maxInstances,
    placements,
    tupleGraph: { schema: SCENE_ONTOLOGY_VERSION, nodes, tuples },
    animationCueBindings,
  };
}
