/** Converts trusted, authorized detector RECEIPTS to unreviewed spatial tuple proposals.
 * No model inference, no endpoint calls, no world coordinates, no direct DB writes.
 * The worker must already have checked source membership, revision, checksum, rights, model SHA.
 */
import type {SceneCatalog,SceneNode,SceneTuple,TupleGraph,SourceBinding} from './scene-ontology-linked-tuples-v1.js';
import {SCENE_ONTOLOGY_VERSION,chooseIllustrativeGeometry} from './scene-ontology-linked-tuples-v1.js';

export type VerifiedFrameDetections = {
  caseId:string;sceneId:string;source:SourceBinding;
  width:number;height:number;
  detections:readonly {label:string;score:number;box:readonly [number,number,number,number]}[];
};
export type ImageDetectionProposals={graph:TupleGraph;labelIndex:ReadonlyMap<string,readonly string[]>;unresolved:number};
export function createImageDetectionProposalsV1(input:VerifiedFrameDetections,catalog:SceneCatalog):ImageDetectionProposals {
  const {caseId,sceneId,source,width,height,detections}=input;
  if(source.sourceKind!=='EVIDENCE'||!source.evidenceId||!source.sourceRevision||!source.contentSha256 || !source.modelId || !source.modelArtifactSha256 || !source.runId)throw new Error('IMAGE_SOURCE_AND_MODEL_RECEIPTS_REQUIRED');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>32768||height>32768)throw new Error('SOURCE_DIMENSIONS_INVALID');
  if(detections.length>256)throw new Error('DETECTION_CAP_EXCEEDED');
  const nodes:SceneNode[]=[];const tuples:SceneTuple[]=[];
  const namespace=`${source.sourceId}:${source.sourceRevision.slice(7,19)}:${source.runId}`;
  if (!/^[a-zA-Z0-9_.:\/-]{1,120}$/.test(namespace)) throw new Error('IMAGE_NAMESPACE_INVALID');
  const sourceNode=`source:${namespace}`;
  const imageNode=`entity:image-plane:${namespace}`;
  const make=(id:string,kind:SceneNode['kind'],conceptId:string,origin:SceneNode['origin'],extra:Partial<SceneNode>={})=>nodes.push({id,kind,conceptId,caseId,sceneId,origin,...extra});
  make(sourceNode,'source','pa:observation.source.photo','SOURCE_OBSERVATION',{source});
  make(imageNode,'entity','pa:geometry.representation.source-image-plane','SOURCE_OBSERVATION');
  tuples.push({subject:imageNode,predicate:'DERIVED_FROM',object:sourceNode,origin:'SOURCE_OBSERVATION',source});
  const labelIndex=new Map<string,string[]>();let unresolved=0;
  for(let i=0;i<detections.length;i++){
    const d=detections[i];
    const pixel={width,height,box:[...d.box] as [number,number,number,number]};
    const pick=chooseIllustrativeGeometry({label:d.label,score:d.score,source,pixel},catalog);
    if(pick.status==='UNRESOLVED'){unresolved++;continue;}
    const obsId=`obs:${namespace}:${i}`, regionId=`region:${namespace}:${i}`, entityId=`entity:proxy-${namespace}:${i}`;
    make(obsId,'observation','pa:observation.model-output.object-detection','MODEL_PROPOSAL');
    make(regionId,'region','pa:observation.image-region.bounding-box','MODEL_PROPOSAL',{region:pixel});
    make(entityId,'entity',pick.semantic,'MODEL_PROPOSAL');
    tuples.push({subject:obsId,predicate:'DETECTED_IN',object:sourceNode,origin:'MODEL_PROPOSAL',confidence:d.score,source});
    tuples.push({subject:obsId,predicate:'HAS_PIXEL_REGION',object:regionId,origin:'MODEL_PROPOSAL',confidence:d.score,source});
    tuples.push({subject:obsId,predicate:'PROPOSES_PROXY',object:entityId,origin:'MODEL_PROPOSAL',confidence:d.score,source});
    const key=d.label.trim().toLowerCase();labelIndex.set(key,[...(labelIndex.get(key)??[]),entityId]);
  }
  return {graph:{schema:SCENE_ONTOLOGY_VERSION,nodes,tuples},labelIndex,unresolved};
}
