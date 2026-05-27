#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { encode } from '@msgpack/msgpack';

const root = path.resolve(process.cwd());
const cacheDir = path.join(root, '.cache', 'cards');
await fs.mkdir(cacheDir, { recursive: true });

const reportPath = path.join(root, '.tmp', 'missing_features_classified.json');
const packReportPath = path.join(root, '.tmp', 'pack_msgpack_report.json');

async function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

try {
  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);
  const results = [];
  for (const item of report.items) {
    const abs = path.join(root, item.path);
    try {
      const stat = await fs.stat(abs);
      const content = await fs.readFile(abs, 'utf8');
      const contentHash = await hashContent(content);
      const id = crypto.createHash('sha1').update(item.path + '|' + contentHash).digest('hex');
      const schemaVersion = '1.0.0';
      const sourceRef = item.path;
      const msg = { 
        path: item.path, 
        sourceRef,
        area: item.area, 
        mtime: item.mtime, 
        content_hash: contentHash, 
        schema_version: schemaVersion,
        content 
      };
      const packed = encode(msg);
      const outFile = path.join(cacheDir, `${id}.msgpack`);
      await fs.writeFile(outFile, packed);
      const meta = { 
        id, 
        path: item.path, 
        sourceRef,
        area: item.area, 
        mtime: item.mtime, 
        content_hash: contentHash, 
        schema_version: schemaVersion,
        msgpack: path.relative(root, outFile).replace(/\\/g,'/') 
      };
      await fs.writeFile(path.join(cacheDir, `${id}.meta.json`), JSON.stringify(meta, null, 2), 'utf8');
      results.push(meta);
    } catch (err) {
      results.push({ path: item.path, error: err.message });
    }
  }
  await fs.writeFile(packReportPath, JSON.stringify({ packed: results.length, items: results }, null, 2), 'utf8');
  console.log(`Packed ${results.length} cards to .cache/cards. Report: ${path.relative(root, packReportPath)}`);
} catch (err) {
  console.error('Run classify_agents first:', err.message);
  process.exit(2);
}
