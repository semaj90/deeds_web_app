import * as THREE from 'three';
import {extractFrustumPlanes,intersectsFrustumAabb,type ClipSpace} from './mesh-culling.js';
import {unpackMesh} from './mesh-packer.js';

/** ATMP -> editable Three.js geometry. Decode ONCE on load; GLB remains portable interchange. */
export function geometryFromAtlasPacket(packet:Uint8Array):THREE.BufferGeometry{
 const m=unpackMesh(packet);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));
 g.setIndex(new THREE.BufferAttribute(m.indices,1));
 g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
 return g;
}

/** Turn on Three's built-in per-mesh frustum tests; no geometry is altered. */
export function enableAtlasGeometryCulling(root:THREE.Object3D):void{
 root.traverse((obj)=>{
  if(!(obj instanceof THREE.Mesh))return;
  obj.frustumCulled=true;
  // Skinned/instanced bounds can change with bones/instances; do not invent static bounds.
  if(obj instanceof THREE.SkinnedMesh || obj instanceof THREE.InstancedMesh)return;
  if(!obj.geometry.boundingSphere)obj.geometry.computeBoundingSphere();
 });
}

export interface VisibleAssetPlan { visibleIds:string[]; outsideFrustumIds:string[]; tested:number; conservativelyIncluded:number }
/**
 * Read-only scene visibility plan. No .visible mutations: avoids corrupting user visibility/picking.
 * Works with static Mesh objects. Skinned/instanced meshes remain visible unless a valid dynamic
 * world bound is supplied. Parent visibility is respected. This is not occlusion culling.
 */
export function planVisibleMeshAssets(root:THREE.Object3D,camera:THREE.Camera,clipSpace:ClipSpace='webgl'):VisibleAssetPlan{
 camera.updateMatrixWorld(true);root.updateMatrixWorld(true);
 const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const planes=extractFrustumPlanes(vp.elements,clipSpace), box=new THREE.Box3();
 const visibleIds:string[]=[], outsideFrustumIds:string[]=[];
 let tested=0,conservativelyIncluded=0;
 root.traverse((obj)=>{
  if(!(obj instanceof THREE.Mesh))return;
  let parent:THREE.Object3D|null=obj,authorVisible=true;
  while(parent){if(!parent.visible){authorVisible=false;break;}parent=parent.parent;}
  if(!authorVisible)return;
  const id=typeof obj.userData.atlasAssetId==='string' ? obj.userData.atlasAssetId : obj.uuid;
  if(obj instanceof THREE.SkinnedMesh || obj instanceof THREE.InstancedMesh){conservativelyIncluded++;visibleIds.push(id);return;}
  if(!obj.geometry.boundingBox)obj.geometry.computeBoundingBox();
  if(!obj.geometry.boundingBox){conservativelyIncluded++;visibleIds.push(id);return;}
  box.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
  tested++;
  const b:[number,number,number,number,number,number]=[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z];
  (intersectsFrustumAabb(b,planes)?visibleIds:outsideFrustumIds).push(id);
 });
 return {visibleIds,outsideFrustumIds,tested,conservativelyIncluded};
}
