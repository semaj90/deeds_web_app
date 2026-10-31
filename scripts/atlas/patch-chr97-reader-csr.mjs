import fs from 'node:fs';

const file = 'sveltekit-frontend/src/lib/shared/chr97-reader.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = 'export interface ParsedCartridge {\r\n\theader: CartridgeHeader;\r\n\trunes: ParsedRune[];\r\n\ttensors: Float32Array[];\r\n\tmetadata: CartridgeMetadata;\r\n}';
const replacement1 = 'export interface CartridgeCsrGraph {\r\n\tnumNodes: number;\r\n\tnumEdges: number;\r\n\trowOffsets: Uint32Array;\r\n\tcolIndices: Uint32Array;\r\n}\r\n\r\nexport interface ParsedCartridge {\r\n\theader: CartridgeHeader;\r\n\trunes: ParsedRune[];\r\n\ttensors: Float32Array[];\r\n\tmetadata: CartridgeMetadata;\r\n\tgraph?: CartridgeCsrGraph;\r\n}';

if (!content.includes(target1)) {
  console.error('Target 1 not found!');
  process.exit(1);
}
content = content.replace(target1, replacement1);

const target2 = '\treturn { header, runes, tensors, metadata };';
const replacement2 = '\tconst graph = extractCartridgeCsrGraph(data, header);\r\n\treturn { header, runes, tensors, metadata, graph };';

if (!content.includes(target2)) {
  console.error('Target 2 not found!');
  process.exit(1);
}
content = content.replace(target2, replacement2);

const target3 = 'function fp16ToFloat32(fp16: number): number {';
const helperCode = [
  'export function extractCartridgeCsrGraph(data: Uint8Array, preParsedHeader?: CartridgeHeader): CartridgeCsrGraph {',
  '\tconst header = preParsedHeader ?? parseCartridgeHeader(data);',
  '\tconst numNodes = header.graphNodeCount;',
  '\tconst numEdges = header.graphNodeCount;',
  '',
  '\tif (numNodes === 0) {',
  '\t\treturn {',
  '\t\t\tnumNodes: 0,',
  '\t\t\tnumEdges: 0,',
  '\t\t\trowOffsets: new Uint32Array([0]),',
  '\t\t\tcolIndices: new Uint32Array(0),',
  '\t\t};',
  '\t}',
  '',
  '\tconst tensorStart = HEADER_SIZE + header.runeCount * RUNE_BLOCK_SIZE;',
  '\tconst graphStart = tensorStart + header.tensorSize;',
  '\tconst offsetsStart = graphStart;',
  '\tconst edgesStart = graphStart + (numNodes + 1) * 4;',
  '\tconst edgesEnd = edgesStart + numEdges * 4;',
  '',
  '\tconst offsetsCopy = new Uint8Array(data.subarray(offsetsStart, edgesStart));',
  '\tconst rowOffsets = new Uint32Array(offsetsCopy.buffer, offsetsCopy.byteOffset, numNodes + 1);',
  '',
  '\tconst edgesCopy = new Uint8Array(data.subarray(edgesStart, edgesEnd));',
  '\tconst colIndices = new Uint32Array(edgesCopy.buffer, edgesCopy.byteOffset, numEdges);',
  '',
  '\treturn {',
  '\t\tnumNodes,',
  '\t\tnumEdges,',
  '\t\trowOffsets,',
  '\t\tcolIndices,',
  '\t};',
  '}',
  '',
  'function fp16ToFloat32(fp16: number): number {'
].join('\r\n');

content = content.replace(target3, helperCode);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched chr97-reader.ts with extractCartridgeCsrGraph!');
