/** Atlas Mesh Packet ATMP v1: little-endian, 64-byte header, U16 quantized XYZ, U16/U32 indices.
 * This is an INTERNAL mesh cache; GLB is the portable interchange/export format.
 * Header offsets: magic[0..4], version(u16)@4, flags(u16)@6, vertexCount(u32)@8,
 * indexCount(u32)@12, minXYZ(f32x3)@16, extentXYZ(f32x3)@28,
 * positionsOffset(u32)@40, indicesOffset(u32)@44, bytes(u32)@48, reserved[52..64].
 * flags bit0: U32 indices; padding between arrays to 4-byte boundary.
 */
export const ATMP_VERSION = 1;
const HEADER = 64, MAX_VERTICES = 1_000_000, MAX_INDICES = 4_000_000;
export interface DecodedMesh {positions: Float32Array; indices: Uint16Array|Uint32Array; bounds: [number,number,number,number,number,number]}
export function packMesh(positions: Float32Array, indices: Uint16Array|Uint32Array, maxBytes = 8*1024*1024): Uint8Array {
  if (!(positions instanceof Float32Array) || !(indices instanceof Uint16Array || indices instanceof Uint32Array))
    throw new TypeError('Expected Float32Array XYZ and Uint16Array/Uint32Array triangles');
  if (positions.length%3 || indices.length%3 || positions.length===0 || indices.length===0)
    throw new RangeError('XYZ and indexed-triangle counts must be nonzero multiples of 3');
  const vc=positions.length/3, ic=indices.length;
  if(vc>MAX_VERTICES || ic>MAX_INDICES || vc===0) throw new RangeError('Mesh exceeds vertex/index limits');
  if(!Number.isSafeInteger(maxBytes) || maxBytes<HEADER || maxBytes>128*1024*1024) throw new RangeError('Invalid byte budget');
  const index32 = vc>65535; // Canonical output; input width may differ.
  const posOff=HEADER, idxOff=(posOff+vc*6+3)&~3;
  const bytes=idxOff+ic*(index32?4:2);
  if(bytes>maxBytes) throw new RangeError(`Mesh packet ${bytes} bytes exceeds ${maxBytes} byte budget`);
  const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){
    const x=positions[i], j=i%3;
    if(!Number.isFinite(x)) throw new TypeError('Non-finite vertex');
    mins[j]=Math.min(mins[j],x);maxs[j]=Math.max(maxs[j],x);
  }
  for(let i=0;i<ic;i++) if(indices[i]>=vc) throw new RangeError(`Index out of range at ${i}`);
  const out = new Uint8Array(bytes), dv=new DataView(out.buffer);
  out.set([65,84,77,80],0); // ATMP
  dv.setUint16(4,ATMP_VERSION,true); dv.setUint16(6,index32?1:0,true);
  dv.setUint32(8,vc,true); dv.setUint32(12,ic,true);
  for(let j=0;j<3;j++) {dv.setFloat32(16+j*4,mins[j],true);dv.setFloat32(28+j*4,maxs[j]-mins[j],true);}
  dv.setUint32(40,posOff,true);dv.setUint32(44,idxOff,true);dv.setUint32(48,bytes,true);
  for(let i=0;i<vc;i++) for(let j=0;j<3;j++){
    const extent=maxs[j]-mins[j];
    const q=extent===0?0:Math.max(0,Math.min(65535,Math.round((positions[i*3+j]-mins[j])/extent*65535)));
    dv.setUint16(posOff+i*6+j*2,q,true);
  }
  for(let i=0;i<ic;i++) {
    if(index32) dv.setUint32(idxOff+i*4,indices[i],true);
    else dv.setUint16(idxOff+i*2,indices[i],true);
  }
  return out;
}
export function unpackMesh(packet: Uint8Array): DecodedMesh {
  if(!(packet instanceof Uint8Array) || packet.byteLength<HEADER) throw new TypeError('Invalid ATMP packet');
  const v=new DataView(packet.buffer,packet.byteOffset,packet.byteLength);
  if(packet[0]!==65||packet[1]!==84||packet[2]!==77||packet[3]!==80||v.getUint16(4,true)!==ATMP_VERSION)
    throw new RangeError('Unsupported ATMP magic/version');
  const flags=v.getUint16(6,true),vc=v.getUint32(8,true),ic=v.getUint32(12,true);
  const po=v.getUint32(40,true),io=v.getUint32(44,true),size=v.getUint32(48,true);
  if((flags&~1)!==0 || vc===0||vc>MAX_VERTICES||ic===0||ic>MAX_INDICES||ic%3!==0||
     size!==packet.byteLength||po!==HEADER||io!==((po+vc*6+3)&~3)||
     io+ic*((flags&1)?4:2)!==size || Boolean(flags&1)!==(vc>65535))
    throw new RangeError('Malformed ATMP structure');
  const mins=[v.getFloat32(16,true),v.getFloat32(20,true),v.getFloat32(24,true)];
  const extent=[v.getFloat32(28,true),v.getFloat32(32,true),v.getFloat32(36,true)];
  if([...mins,...extent].some(x=>!Number.isFinite(x))||extent.some(x=>x<0)) throw new RangeError('Invalid bounds');
  const positions=new Float32Array(vc*3);
  for(let i=0;i<vc;i++) for(let j=0;j<3;j++) positions[i*3+j]=mins[j]+extent[j]*(v.getUint16(po+i*6+j*2,true)/65535);
  const indices = (flags&1)?new Uint32Array(ic):new Uint16Array(ic);
  for(let i=0;i<ic;i++) {
    const index=flags&1?v.getUint32(io+i*4,true):v.getUint16(io+i*2,true);
    if(index>=vc) throw new RangeError('Index outside vertex range');
    indices[i]=index;
  }
  return {positions,indices,bounds:[mins[0],mins[1],mins[2],mins[0]+extent[0],mins[1]+extent[1],mins[2]+extent[2]]};
}
