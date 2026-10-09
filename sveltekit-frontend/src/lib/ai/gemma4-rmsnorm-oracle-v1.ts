/** RMSNorm f32 illustrative Gemma-style operator, not a model-specific kernel proof. */
export const RMSNORM_WGSL_V1_ASSET_V1 = '/atlas-kernels/rmsnorm-f32-v1.wgsl';
export const RMSNORM_FIXTURE_V1 = Object.freeze({
 rows:2,width:4,epsilon:1e-5,
 values:[1,2,3,4,-4,-3,-2,-1],
 weights:[1,.5,2,1.25],
 atol:2e-5, rtol:1e-5,
});
export function rmsNormCpuF32V1(values:readonly number[],weights:readonly number[],rows:number,width:number,epsilon:number) {
 if (!Number.isSafeInteger(rows)||rows<1||!Number.isSafeInteger(width)||width<1||
     rows*width!==values.length||weights.length!==width) throw Error('INVALID_RMSNORM_SHAPE');
 if (!Number.isFinite(epsilon)||epsilon<=0||![...values,...weights].every(Number.isFinite))
   throw Error('INVALID_RMSNORM_INPUT');
 const out:number[]=[];
 for(let row=0;row<rows;row++){
   let squareSum=Math.fround(0);
   for(let j=0;j<width;j++){
     const v=Math.fround(values[row*width+j]);
     squareSum=Math.fround(squareSum+Math.fround(v*v));
   }
   const scale=Math.fround(1/Math.sqrt(Math.fround(Math.fround(squareSum/width)+Math.fround(epsilon))));
   for(let j=0;j<width;j++){
     const v=Math.fround(values[row*width+j]);
     out.push(Math.fround(Math.fround(v*scale)*Math.fround(weights[j])));
   }
 }
 return out;
}
export function compareRmsNormV1(reference:readonly number[],actual:readonly number[],atol:number,rtol:number){
 if(reference.length===0||reference.length!==actual.length||![atol,rtol].every(v=>Number.isFinite(v)&&v>=0))
   return {pass:false,maxAbsError:null};
 let max=0;
 for(let i=0;i<reference.length;i++){
   if(!Number.isFinite(reference[i])||!Number.isFinite(actual[i]))return {pass:false,maxAbsError:null};
   const delta=Math.abs(actual[i]-reference[i]);max=Math.max(max,delta);
   if(delta>atol+rtol*Math.abs(reference[i]))return {pass:false,maxAbsError:max};
 }
 return {pass:true,maxAbsError:max};
}
