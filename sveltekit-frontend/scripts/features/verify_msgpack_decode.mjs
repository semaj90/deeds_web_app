#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { decode } from '@msgpack/msgpack';

const root = path.resolve(process.cwd());
const cardsDir = path.join(root, '.cache', 'cards');

async function run() {
  try {
    const entries = await fs.readdir(cardsDir);
    const msgpacks = entries.filter(e => e.endsWith('.msgpack'));
    if (msgpacks.length === 0) {
      console.log('No .msgpack files found in', cardsDir);
      process.exit(2);
    }
    for (const f of msgpacks) {
      const id = f.replace('.msgpack','');
      const msgPath = path.join(cardsDir, f);
      const metaPath = path.join(cardsDir, `${id}.meta.json`);
      const packed = await fs.readFile(msgPath);
      const decoded = decode(packed);
      const metaRaw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(metaRaw);
      const ok = decoded.path === meta.path && decoded.content_hash === meta.content_hash;
      console.log(id, ok ? 'OK' : 'MISMATCH', 'path=', decoded.path, 'meta.path=', meta.path);
    }
    console.log('Verified', msgpacks.length, 'msgpack files.');
  } catch (err) {
    console.error('Verifier error:', err.message);
    process.exit(3);
  }
}

run();
