import {cullAabbs} from './mesh-culling.js';
/** Browser fallback hierarchy: optional Emscripten instance -> tested TypeScript fallback.
 * The factory must be supplied by the application's lazy dynamic import of wasm/dist/atlas_cull.js.
 * Avoid bundling WASM inside SSR. Native .node modules NEVER run in browser.
 */
interface CullModule {
 HEAPF32: Float32Array; HEAPU8: Uint8Array;
 _malloc(size:number):number; _free(ptr:number):void;
 _atlas_cull_aabbs(boundsPtr:number,count:number,planesPtr:number,outPtr:number):number;
}
export function cullWithOptionalWasm(bounds:Float32Array,planes:Float32Array,wasm?:CullModule):Uint8Array{
 if(!wasm)return cullAabbs(bounds,planes);
 // Validate FIRST, including non-finite values, before forwarding to WASM.
 if(bounds.length%6||planes.length!==24 || !bounds.every(Number.isFinite) || !planes.every(Number.isFinite))
  throw new RangeError('Invalid WASM bounds or planes');
 for(let i=0;i<bounds.length;i+=6)if(bounds[i]>bounds[i+3]||bounds[i+1]>bounds[i+4]||bounds[i+2]>bounds[i+5])throw new RangeError('Invalid AABB');
 const bp=wasm._malloc(bounds.byteLength),pp=wasm._malloc(planes.byteLength),op=wasm._malloc(bounds.length/6);
 if(!bp||!pp||!op){if(bp)wasm._free(bp);if(pp)wasm._free(pp);if(op)wasm._free(op);throw new Error('WASM memory allocation failed');}
 try {
  wasm.HEAPF32.set(bounds,bp/4);wasm.HEAPF32.set(planes,pp/4);
  const rc=wasm._atlas_cull_aabbs(bp,bounds.length/6,pp,op);
  if(rc!==0)throw new Error(`WASM culling failed (${rc})`);
  return wasm.HEAPU8.slice(op,op+bounds.length/6);
 } finally {wasm._free(bp);wasm._free(pp);wasm._free(op);}
}
