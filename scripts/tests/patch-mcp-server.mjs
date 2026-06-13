import fs from 'node:fs';

const filePath = 'src/mcp/trace-mcp-server.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = 'byte_start, byte_end, sha256, created_at';
const replacement = 'byte_start, byte_end, sha256, metadata, created_at';

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully patched trace-mcp-server.ts');
} else {
  console.error('Target not found in trace-mcp-server.ts');
}
