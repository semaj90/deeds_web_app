declare module 'cbor' {
 // Minimal encode/decode signatures used by the project
 export function encode(value: any): Uint8Array | Buffer;
 export function decode(data: Uint8Array | ArrayBuffer | Buffer): unknown;
 // Some builds import default
 const _default: { encode: typeof encode; decode: typeof decode };
 export default _default;
}
