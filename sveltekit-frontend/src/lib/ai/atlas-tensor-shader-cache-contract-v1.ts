/** Pure cache descriptors: never an address, allocation, lease grant, or canonical registry. */
export type TensorDtypeV1 = 'f32'|'f16'|'int8'|'uint8';
export type TensorResidencyV1 = 'INDEXED_DB'|'OPFS'|'CPU_BUFFER'|'SHARED_CPU'|'WEBGPU'|'CUDA';
export type TensorDescriptorV1 = {
 packetKey:string;sourceRevision:string;representationRevision:string;
 encodingVersion:string;contentDigest:string;dtype:TensorDtypeV1;
 shape:number[];strides:number[];byteLength:number;ownerId:string;
 deviceGeneration:number;leaseGeneration:number;residency:TensorResidencyV1;
};
const sha=/^sha256:[a-f0-9]{64}$/;
const bpe:Record<TensorDtypeV1,number>={f32:4,f16:2,int8:1,uint8:1};
export type TensorDescriptorVerdictV1={ok:boolean;reason:string;contentKey:string|null;residencyKey:string|null};
export function inspectTensorDescriptorV1(d:TensorDescriptorV1):TensorDescriptorVerdictV1 {
 const reject=(reason:string):TensorDescriptorVerdictV1=>({ok:false,reason,contentKey:null,residencyKey:null});
 if(!d.packetKey||!d.sourceRevision||!d.representationRevision||!d.encodingVersion||!d.ownerId) return reject('IDENTITY_INCOMPLETE');
 if(!sha.test(d.contentDigest))return reject('DIGEST_UNVERIFIED');
 if(!(d.dtype in bpe)||!['INDEXED_DB','OPFS','CPU_BUFFER','SHARED_CPU','WEBGPU','CUDA'].includes(d.residency))return reject('ENCODING_INVALID');
 if(!Number.isSafeInteger(d.byteLength)||d.byteLength<1||!Number.isSafeInteger(d.deviceGeneration)||d.deviceGeneration<0||!Number.isSafeInteger(d.leaseGeneration)||d.leaseGeneration<1)return reject('LENGTH_OR_GENERATION_INVALID');
 if(!Array.isArray(d.shape)||d.shape.length<1||d.shape.length>8||!Array.isArray(d.strides)||d.strides.length!==d.shape.length)return reject('SHAPE_INVALID');
 let elems=1;for(const n of d.shape){if(!Number.isSafeInteger(n)||n<1||elems>Number.MAX_SAFE_INTEGER/n)return reject('SHAPE_INVALID');elems*=n;}
 // v1 accepts only densely packed row-major tensors: views/padding require a different contract.
 let expectedStride=1;
 for(let i=d.shape.length-1;i>=0;i--){if(d.strides[i]!==expectedStride)return reject('STRIDE_UNSUPPORTED');expectedStride*=d.shape[i];}
 const bytes=elems*bpe[d.dtype];if(!Number.isSafeInteger(bytes)||bytes!==d.byteLength)return reject('BYTE_LENGTH_MISMATCH');
 const contentKey=JSON.stringify([d.packetKey,d.sourceRevision,d.representationRevision,d.encodingVersion,d.contentDigest,d.dtype,d.shape,d.strides]);
 const residencyKey=JSON.stringify([contentKey,d.ownerId,d.residency,d.deviceGeneration,d.leaseGeneration]);
 return {ok:true,reason:'DESCRIPTOR_VALID_ONLY',contentKey,residencyKey};
}
export type ShaderPipelineDescriptorV1={shaderDigest:string;entryPoint:string;deviceId:string;deviceGeneration:number;layoutDigest:string;constants:Record<string,number>;features:string[]};
export function inspectShaderPipelineDescriptorV1(d:ShaderPipelineDescriptorV1){
 if(!sha.test(d.shaderDigest)||!sha.test(d.layoutDigest)||!d.deviceId||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(d.entryPoint)||!Number.isSafeInteger(d.deviceGeneration)||d.deviceGeneration<1)
 return {ok:false,reason:'PIPELINE_IDENTITY_INVALID',key:null};
 const entries=Object.entries(d.constants);
 if(entries.some(([k,v])=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)||!Number.isFinite(v))||d.features.some(f=>!f)||new Set(d.features).size!==d.features.length)
 return {ok:false,reason:'SPECIALIZATION_INVALID',key:null};
 const key=JSON.stringify([d.shaderDigest,d.entryPoint,d.deviceId,d.deviceGeneration,d.layoutDigest,entries.sort(([a],[b])=>a.localeCompare(b)),[...d.features].sort()]);
 return {ok:true,reason:'PIPELINE_KEY_ONLY',key};
}
