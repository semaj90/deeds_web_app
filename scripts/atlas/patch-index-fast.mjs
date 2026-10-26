import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('sveltekit-frontend/scripts/index-codebase-fast.mjs');
let content = fs.readFileSync(filePath, 'utf8');
const isCrlf = content.includes('\r\n');
const nl = isCrlf ? '\r\n' : '\n';

const oldBlock = `  // G5 — zod${nl}` +
  `  const hasZod = RE_ZOD.test(src);${nl}` +
  `  // G5b — does this route actually parse a body? (Zod is irrelevant for pure GETs)${nl}` +
  `  const parsesBody = /request\\.(?:json|formData|text|arrayBuffer)\\s*\\(\\s*\\)/.test(src);`;

const newBlock = `  // G5 & G5b — route handler analysis (parsesBody & Zod validation)${nl}` +
  `  let routeAnalysis = [];${nl}` +
  `  let parsesBody = false;${nl}` +
  `  let hasZod = false;${nl}` +
  `  if (isServerRoute) {${nl}` +
  `    const analysis = analyzeRouteHandlers(src, { rel });${nl}` +
  `    routeAnalysis = analysis.handlers;${nl}` +
  `    parsesBody = analysis.parsesBody;${nl}` +
  `    hasZod = analysis.hasZod;${nl}` +
  `  } else {${nl}` +
  `    hasZod = RE_ZOD.test(src);${nl}` +
  `    parsesBody = /request\\.(?:json|formData|text|arrayBuffer)\\s*\\(\\s*\\)/.test(src);${nl}` +
  `  }`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully replaced G5 extraction block');
} else {
  console.log('oldBlock not matched directly, searching lines');
  const lines = content.split(nl);
  const idx = lines.findIndex(l => l.includes('// G5b'));
  console.log('Found G5b at line:', idx);
  if (idx !== -1) {
    console.log('Line idx-2:', lines[idx - 2]);
    console.log('Line idx-1:', lines[idx - 1]);
    console.log('Line idx:', lines[idx]);
    console.log('Line idx+1:', lines[idx + 1]);
  }
}
