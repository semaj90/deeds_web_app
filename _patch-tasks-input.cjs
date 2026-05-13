const fs = require('fs');
const f = '.vscode/tasks.json';
let txt = fs.readFileSync(f, 'utf8');

// Find the last closing of the inputs array
const closing = '    }\n  ]\n}';
const idx = txt.lastIndexOf(closing);
if (idx < 0) {
  // Try CRLF
  const closingCrlf = '    }\r\n  ]\r\n}';
  const idx2 = txt.lastIndexOf(closingCrlf);
  if (idx2 < 0) { console.error('NOT FOUND'); process.exit(1); }
  const inserted = '    },\r\n    {\r\n      "id": "hyperragQuery",\r\n      "type": "promptString",\r\n      "description": "HyperRAG dense search query — TurboVec ANN prefilter -> Qdrant multi-lane -> RRF -> CouchDB wiki enrichment",\r\n      "default": "context assembler retrieval kag pipeline"\r\n    }\r\n  ]\r\n}';
  fs.writeFileSync(f, txt.slice(0, idx2) + inserted + txt.slice(idx2 + closingCrlf.length));
  console.log('PATCHED (CRLF) at char', idx2);
} else {
  const inserted = '    },\n    {\n      "id": "hyperragQuery",\n      "type": "promptString",\n      "description": "HyperRAG dense search query — TurboVec ANN prefilter -> Qdrant multi-lane -> RRF -> CouchDB wiki enrichment",\n      "default": "context assembler retrieval kag pipeline"\n    }\n  ]\n}';
  fs.writeFileSync(f, txt.slice(0, idx) + inserted + txt.slice(idx + closing.length));
  console.log('PATCHED (LF) at char', idx);
}
