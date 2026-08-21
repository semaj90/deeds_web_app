import { createHash } from 'node:crypto';

export type FeatureMatrixBackend='AUTO'|'CPU_REFERENCE'|'NATIVE_GEMM';
export interface FeatureMatrixV1{schema:'atlas.feature-matrix.v1';featureRevision:number;rowIds:string[];featureNames:string[];values:number[][];observed?:boolean[][];}
export interface LinearFeatureModelV1{schema:'atlas.linear-feature-model.v1';modelRevision:string;featureNames:string[];weights:number[];bias:number;}
export interface FeatureMatrixExecutionReceiptV1{schema:'atlas.feature-matrix-execution-receipt.v1';featureRevision:number;modelRevision:string;requestedBackend:FeatureMatrixBackend;executedBackend:'CPU_REFERENCE'|'NATIVE_GEMM';fallbackReason?:string;rows:number;features:number;matrixHash:string;modelHash:string;outputHash:string;durationMs:number;}
export interface FeatureMatrixExecutionResultV1{scores:Array<{rowId:string;score:number;activeWeight:number}>;receipt:FeatureMatrixExecutionReceiptV1;}

function stableStringify(value:unknown):string{if(Array.isArray(value))return`[${value.map(stableStringify).join(',')}]`;if(value&&typeof value==='object'){const obj=value as Record<string,unknown>;return`{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;}return JSON.stringify(value);}
const sha256=(value:unknown)=>createHash('sha256').update(stableStringify(value)).digest('hex');

function validateInput(matrix:FeatureMatrixV1,model:LinearFeatureModelV1){
  if(matrix.schema!=='atlas.feature-matrix.v1')throw new Error('Unsupported feature matrix schema');if(model.schema!=='atlas.linear-feature-model.v1')throw new Error('Unsupported feature model schema');
  if(matrix.rowIds.length!==matrix.values.length)throw new Error('rowIds length must equal matrix row count');if(matrix.featureNames.length!==model.featureNames.length)throw new Error('feature count mismatch');if(model.weights.length!==model.featureNames.length)throw new Error('weight count mismatch');
  if(matrix.featureNames.some((name,i)=>name!==model.featureNames[i]))throw new Error('feature order mismatch; feature names are part of the mathematical contract');
  const f=matrix.featureNames.length;matrix.values.forEach((row,i)=>{if(row.length!==f)throw new Error(`row ${i} has wrong feature count`);if(!row.every(Number.isFinite))throw new Error(`row ${i} contains non-finite feature values`);});
  if(!model.weights.every(Number.isFinite)||!Number.isFinite(model.bias))throw new Error('model contains non-finite values');
  if(matrix.observed){if(matrix.observed.length!==matrix.values.length)throw new Error('observed mask row count mismatch');matrix.observed.forEach((row,i)=>{if(row.length!==f)throw new Error(`observed row ${i} has wrong feature count`);});}
}

/** score_i = bias + sum_observed(w_j*x_ij) / sum_observed(|w_j|). */
export function executeLinearFeatureMatrixCpu(matrix:FeatureMatrixV1,model:LinearFeatureModelV1):Array<{rowId:string;score:number;activeWeight:number}>{
  validateInput(matrix,model);return matrix.values.map((row,i)=>{let weighted=0,activeWeight=0;for(let j=0;j<row.length;j++){if(matrix.observed&&matrix.observed[i]?.[j]===false)continue;const w=model.weights[j];weighted+=w*row[j];activeWeight+=Math.abs(w);}return{rowId:matrix.rowIds[i],score:model.bias+(activeWeight>0?weighted/activeWeight:0),activeWeight};});
}

type NativeMatrixAddon={matrixMultiply?:(a:Float32Array,rowsA:number,colsA:number,b:Float32Array,colsB:number)=>Float32Array};
async function loadNativeMatrixAddon():Promise<NativeMatrixAddon|null>{try{const bridge=await import('$lib/server/gpu/libtorch-bridge.js');return (bridge.getAddonInternal?.() as NativeMatrixAddon|null|undefined)??null;}catch{return null;}}

/** Stable dispatch boundary. Native GEMM is used only if the addon really exports it. */
export async function executeLinearFeatureMatrix(matrix:FeatureMatrixV1,model:LinearFeatureModelV1,requestedBackend:FeatureMatrixBackend='AUTO'):Promise<FeatureMatrixExecutionResultV1>{
  validateInput(matrix,model);const started=performance.now();let executedBackend:'CPU_REFERENCE'|'NATIVE_GEMM'='CPU_REFERENCE';let fallbackReason:string|undefined;let scores:Array<{rowId:string;score:number;activeWeight:number}>;
  const native=requestedBackend==='CPU_REFERENCE'?null:await loadNativeMatrixAddon();const canUseNative=Boolean(native?.matrixMultiply)&&!matrix.observed;
  if(requestedBackend==='NATIVE_GEMM'&&!canUseNative)fallbackReason=matrix.observed?'native_presence_mask_not_supported':'native_matrix_multiply_unavailable';
  if(canUseNative&&native?.matrixMultiply){const n=matrix.values.length,f=matrix.featureNames.length,flat=new Float32Array(n*f);matrix.values.forEach((row,i)=>row.forEach((value,j)=>{flat[i*f+j]=value;}));const weights=new Float32Array(model.weights);const raw=native.matrixMultiply(flat,n,f,weights,1);const activeWeight=model.weights.reduce((s,w)=>s+Math.abs(w),0);scores=matrix.rowIds.map((rowId,i)=>({rowId,score:model.bias+(activeWeight>0?raw[i]/activeWeight:0),activeWeight}));executedBackend='NATIVE_GEMM';}
  else{scores=executeLinearFeatureMatrixCpu(matrix,model);if(requestedBackend==='AUTO'&&!native?.matrixMultiply)fallbackReason='native_matrix_multiply_unavailable';}
  const matrixHash=sha256({featureRevision:matrix.featureRevision,rowIds:matrix.rowIds,featureNames:matrix.featureNames,values:matrix.values,observed:matrix.observed??null});const modelHash=sha256(model);const outputHash=sha256(scores);
  return{scores,receipt:{schema:'atlas.feature-matrix-execution-receipt.v1',featureRevision:matrix.featureRevision,modelRevision:model.modelRevision,requestedBackend,executedBackend,fallbackReason,rows:matrix.values.length,features:matrix.featureNames.length,matrixHash,modelHash,outputHash,durationMs:performance.now()-started}};
}
