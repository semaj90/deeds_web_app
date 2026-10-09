/** Pure tensor cache descriptor validator. This does not own or materialize cached bytes. */
export type TensorResidencyV1='INDEXED_DB'|'OPFS'|'CPU_BUFFER'|'SHARED_CPU'|'WEBGPU'|'CUDA';
export type TensorCacheDescriptorV1={
 packetKey:string;sourceRevision:string;representationRevision:string;encodingVersion:string;contentDigest:string;
 dtype:'f32'|'f16'|'int8'|'uint8';shape:readonly number[];strides:readonly number[];byteLength:number;
 ownerId:string;deviceGeneration:number;leaseGeneration:number;residency:TensorResidencyV1;
};
const BPE={f32:4,f16:2,int8:1,uint8:1};
export function inspectTensorDescriptorV1(v:TensorCacheDescriptorV1,expected?:{sourceRevision?:string;representationRevision?:string;leaseGeneration?:number;deviceGeneration?:number}){
 const reasons:string[]=[];
 for(const key of ['packetKey','sourceRevision','representationRevision','encodingVersion','ownerId'] as const)
  if(typeof v[key]!=='string'||!v[key].trim())reasons.push('MISSING_'+key);
 if(!/^sha256:[0-9a-f]{64}$/.test(v.contentDigest))reasons.push('INVALID_CONTENT_DIGEST');
 if(!Object.hasOwn(BPE,v.dtype))reasons.push('INVALID_DTYPE');
 if(!Array.isArray(v.shape)||!v.shape.length||!v.shape.every(n=>Number.isSafeInteger(n)&&n>0))reasons.push('INVALID_SHAPE');
 if(!Array.isArray(v.strides)||v.strides.length!==v.shape.length||!v.strides.every(n=>Number.isSafeInteger(n)&&n>=0))reasons.push('INVALID_STRIDES');
 if(!Number.isSafeInteger(v.byteLength)||v.byteLength<=0)reasons.push('INVALID_BYTE_LENGTH');
 if(!Number.isSafeInteger(v.leaseGeneration)||v.leaseGeneration<0||!Number.isSafeInteger(v.deviceGeneration)||v.deviceGeneration<0)reasons.push('INVALID_GENERATION');
 if(!['INDEXED_DB','OPFS','CPU_BUFFER','SHARED_CPU','WEBGPU','CUDA'].includes(v.residency))reasons.push('INVALID_RESIDENCY');
 if(!reasons.length){
  // Contiguous canonical layout only. Strided views require separate verified bounds contract.
  let elements=1;for(const dim of v.shape)elements*=dim;
  if(!Number.isSafeInteger(elements)||elements*BPE[v.dtype]!==v.byteLength)reasons.push('BYTE_LENGTH_MISMATCH');
  let step=1;for(let i=v.shape.length-1;i>=0;i--){if(v.strides[i]!==step)reasons.push('NONCONTIGUOUS_LAYOUT');step*=v.shape[i];}
 }
 if(expected?.sourceRevision!==undefined&&expected.sourceRevision!==v.sourceRevision)reasons.push('STALE_SOURCE_REVISION');
 if(expected?.representationRevision!==undefined&&expected.representationRevision!==v.representationRevision)reasons.push('STALE_REPRESENTATION_REVISION');
 if(expected?.leaseGeneration!==undefined&&expected.leaseGeneration!==v.leaseGeneration)reasons.push('STALE_LEASE_GENERATION');
 if(expected?.deviceGeneration!==undefined&&expected.deviceGeneration!==v.deviceGeneration)reasons.push('STALE_DEVICE_GENERATION');
 return {status:reasons.length?'BLOCKED' as const:'DESCRIPTOR_VALID' as const,reasons};
}
