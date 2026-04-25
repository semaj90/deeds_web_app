import fs from 'fs';

const filePath = 'src/lib/adapters/webasm-ai-adapter.ts';
let content = fs.readFileSync(filePath, 'utf8');

// The file is missing the closing part of buildPrompt
const closing = `
