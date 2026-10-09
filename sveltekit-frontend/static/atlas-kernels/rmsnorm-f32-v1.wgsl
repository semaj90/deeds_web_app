struct Config { rows:u32, width:u32, epsilon:f32, padding:u32, };
@group(0) @binding(0) var<storage, read> x:array<f32>;
@group(0) @binding(1) var<storage, read> weight:array<f32>;
@group(0) @binding(2) var<storage, read_write> out:array<f32>;
@group(0) @binding(3) var<uniform> cfg:Config;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3<u32>) {
 let row=id.x; if(row>=cfg.rows){return;}
 var sum:f32=0.0;
 for(var j:u32=0u;j<cfg.width;j=j+1u){let v=x[row*cfg.width+j];sum=sum+v*v;}
 let scale=inverseSqrt(sum/f32(cfg.width)+cfg.epsilon);
 for(var j:u32=0u;j<cfg.width;j=j+1u){out[row*cfg.width+j]=x[row*cfg.width+j]*scale*weight[j];}
}
