#!/usr/bin/env node
import fetch from 'node-fetch';

const ports = [5173, 5174, 5175, 5176, 5177];

async function isOk(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function detect() {
  for (const p of ports) {
    // Prefer checking the vector-search status endpoint; fallback to root
    if (await isOk(`http://localhost:${p}/api/ai/vector-search`)) return p;
    if (await isOk(`http://localhost:${p}/`)) return p;
  }
  return null;
}

const port = await detect();
if (!port) {
  console.error('No frontend port detected on', ports.join(','));
  process.exit(2);
}
console.log(String(port));
