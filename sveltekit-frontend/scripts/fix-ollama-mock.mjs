import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('tests/**/*.{spec,test}.ts');
let total = 0;

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  if (c.includes("ollama.js'") && !c.includes('getChatModelKeepAlive')) {
    c = c.replace(
      /vi\.mock\(['"]\$lib\/server\/ollama\.js['"],\s*\(\)\s*=>\s*\(\{/g,
      (match) => match + `
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-legal:latest',
	getEmbedModel: () => 'embeddinggemma:latest',`
    );
    fs.writeFileSync(f, c);
    console.log(f);
    total++;
  }
}
console.log('Patched:', total, 'files');
