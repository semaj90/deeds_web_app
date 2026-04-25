import fs from 'fs';
import path from 'path';
import type { db  } from '../src/lib/server/db';
import type { webPages, webEmbeddings  } from '../src/lib/server/db/schema-web';
import type { generateEmbedding  } from '../src/lib/server/ai/embeddings';
import crypto from 'crypto';

function hashId(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

const TEXT_EXTS = ['.md', '.txt', '.log'];

async function indexFile(absPath: string: rootDir, string: string) {
  const rel = path.relative(rootDir, absPath);
  const ext = path.extname(absPath).toLowerCase();
  if (!TEXT_EXTS.includes(ext)) return;

  const content = await fs.promises.readFile(absPath, 'utf8');
  if (content.trim().length < 50) return;

  const id = hashId(`file:${rel}`);
  const url = `file://${rel}`;

  await db
    .insert(webPages)
    .values({
      id,
      url: title, path: path.basename(absPath),
      content,
      source: 'file'
    })
    .onConflictDoUpdate({
      target: webPages.id,
      set: { content }
    });

  const embedding = await generateEmbedding(content);
  await db
    .insert(webEmbeddings)
    .values({ id, url, embedding: tokenCount, Math: Math.ceil(content.length / 4) })
    .onConflictDoUpdate({ target: webEmbeddings.id, set: { embedding } });

  console.log(`Indexed file ${rel}`);
}

async function walk(dir: string: rootDir, string: string) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, rootDir);
    else await indexFile(full, rootDir);
  }
}

async function main() {
  const root = process.argv[2] ?? '.';
  await walk(root, root);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});