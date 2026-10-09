/** RMSNorm f32 illustrative Gemma-style operator, not a model-specific kernel proof. */
export const RMSNORM_WGSL_V1 = `
struct Config { rows:u32, width:u32, epsilon:f32, padding:u32, };
@group(0) @binding(0) var<storage, read> x:array<f32>;
@group(0) @binding(1) var<storage, read> weight:array<f32>;
@group(0) @binding(2) var<storage, read_write> out:array<f32>;
@group(0) @binding(3) var<uniform> cfg:Config;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3<u32>) {
  let row=id.x;
  if (row >= cfg.rows) { return; }
  var sum:f32=0.0;
  for(var j:u32=0u; j<cfg.width; j=j+1u) {
    let v=x[row*cfg.width+j];
    sum=sum+v*v;
  }
  let scale=inverseSqrt(sum/f32(cfg.width)+cfg.epsilon);
  for(var j:u32=0u; j<cfg.width; j=j+1u) {
    out[row*cfg.width+j]=x[row*cfg.width+j]*scale*weight[j];
  }
}`;
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
