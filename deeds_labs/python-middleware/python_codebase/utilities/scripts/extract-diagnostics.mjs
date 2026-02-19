import fs from 'fs';
import path from 'node:path';

const inPath = path.resolve('.cache/sveltecheck.json');
const outPath = path.resolve('.cache/sveltecheck.diagnostics.json');

if (!fs.existsSync(inPath)) {
  console.error('Input not found:', inPath);
  process.exit(2);
}

const rs = fs.createReadStream(inPath, { encoding: 'utf8' });
const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });

let buffer = '';
let found = false;
let depth = 0;
let started = false;

rs.on('data', chunk => {
  if (found) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (!started) {
        if (ch === '[') { started = true; depth = 1; ws.write('['); }
      } else {
        ws.write(ch);
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            // finished
            ws.end();
            rs.destroy();
            return;
          }
        }
      }
    }
  } else {
    buffer += chunk;
    const idx = buffer.indexOf('"diagnostics"');
    if (idx !== -1) {
      // find the first '[' after the diagnostics key
      const after = buffer.slice(idx);
      const arrStart = after.indexOf('[');
      if (arrStart !== -1) {
        found = true;
        // write any chars after the '[' that belong to the array
        const startPos = idx + arrStart + 1; // position of first char after '['
        // write '[' as start
        ws.write('[');
        const rest = buffer.slice(startPos);
        // process rest as if chunk data
        for (let i = 0; i < rest.length; i++) {
          const ch = rest[i];
          ws.write(ch);
          if (!started) {
            if (ch === '[') { started = true; depth = 1; }
          } else {
            if (ch === '[') depth++;
            else if (ch === ']') {
              depth--;
              if (depth === 0) { ws.end(); rs.destroy(); return; }
            }
          }
        }
        buffer = null;
      } else {
        // keep accumulating
        if (buffer.length > 1e6) buffer = buffer.slice(-1e6);
      }
    } else {
      // keep last part to catch 'diagnostics' split across chunks
      if (buffer.length > 1e6) buffer = buffer.slice(-1e6);
    }
  }
});

rs.on('end', () => {
  if (!found) {
    console.error('diagnostics key not found in input');
    process.exit(3);
  }
});

rs.on('error', (e) => { console.error('read error', e); process.exit(4); });
ws.on('error', (e) => { console.error('write error', e); process.exit(5); });
