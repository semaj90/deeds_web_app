import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { assembleACEContext } = await import('../../src/lib/server/ace/context-assembler.ts');
  console.log('Calling assembleACEContext with smoke options...');
  try {
    const ctx = await assembleACEContext({
      query: 'smoke assemble test for authority persistence',
      userId: 'smoke-user',
      enableCodebaseContext: true,
      filePath: 'src/lib/server/cache/ace-context-pack-cache.ts',
      includeResearch: false,
      maxTokens: 512,
      sectionTypes: [],
      statsOut: {},
    });
    console.log('assembleACEContext returned; context.cachePlanner.cacheKey=', ctx.cachePlanner?.cacheKey ?? '(none)');
    console.log('authority on final context:', (ctx as any).authority ?? null);
  } catch (err) {
    console.error('assembleACEContext failed:', err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
