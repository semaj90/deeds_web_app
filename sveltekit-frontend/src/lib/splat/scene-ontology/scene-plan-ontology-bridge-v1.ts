/** Adapter from parent-atlas.prompt-scene-plan.v1 -> scene-local semantic graph.
 * Keeps primitive registry, mesh geometry, live arena, and case authority in their OWN modules.
 * Import into existing app, passing its ScenePlanV1 as a structural type.
 */
import type {SceneNode,SceneTuple,TupleGraph,SourceBinding} from './scene-ontology-linked-tuples-v1.js';
import {SCENE_ONTOLOGY_VERSION} from './scene-ontology-linked-tuples-v1.js';

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
