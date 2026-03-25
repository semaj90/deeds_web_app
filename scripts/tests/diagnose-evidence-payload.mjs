#!/usr/bin/env node
/**
 * Diagnose what the /evidence page is loading — find the 20MB payload source
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:5173';

const browser = await chromium.launch();
const page = await browser.newPage();
const resources = [];

page.on('response', async (res) => {
  const url = res.url();
  const size = parseInt(res.headers()['content-length'] || '0', 10);
  const type = res.headers()['content-type'] || '';
  resources.push({ url: url.replace(BASE, ''), size, type: type.split(';')[0] });
});

console.log(`Navigating to ${BASE}/evidence ...`);
try {
  await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(8000); // Let CSR + lazy imports settle
} catch (e) {
  console.log('Nav warning:', e.message.slice(0, 120));
}

// Sort by size descending
resources.sort((a, b) => b.size - a.size);
const totalKB = resources.reduce((s, r) => s + r.size, 0) / 1024;
console.log(`\nTotal resources: ${resources.length}`);
console.log(`Total size: ${totalKB.toFixed(0)}KB (${(totalKB / 1024).toFixed(1)}MB)\n`);

console.log('Top 30 by size:');
resources.slice(0, 30).forEach((r) => {
  const kb = (r.size / 1024).toFixed(0).padStart(8);
  console.log(`${kb}KB  ${r.type.padEnd(30)} ${r.url.slice(0, 120)}`);
});

// Group by content-type
const byType = {};
resources.forEach((r) => {
  const t = r.type || 'unknown';
  if (!(t in byType)) byType[t] = { count: 0, size: 0 };
  byType[t].count++;
  byType[t].size += r.size;
});

console.log('\nBy content-type:');
Object.entries(byType)
  .sort((a, b) => b[1].size - a[1].size)
  .forEach(([t, v]) => {
    console.log(`  ${(v.size / 1024).toFixed(0).padStart(8)}KB  ${String(v.count).padStart(4)} files  ${t}`);
  });

// Group by path prefix
const byPrefix = {};
resources.forEach((r) => {
  const parts = r.url.split('/').filter(Boolean);
  const prefix = '/' + (parts.slice(0, 3).join('/') || 'root');
  if (!(prefix in byPrefix)) byPrefix[prefix] = { count: 0, size: 0 };
  byPrefix[prefix].count++;
  byPrefix[prefix].size += r.size;
});

console.log('\nBy path prefix:');
Object.entries(byPrefix)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 20)
  .forEach(([p, v]) => {
    console.log(`  ${(v.size / 1024).toFixed(0).padStart(8)}KB  ${String(v.count).padStart(4)} files  ${p}`);
  });

// Check for WASM / ONNX / large binaries
const bigFiles = resources.filter(r => r.size > 500 * 1024);
if (bigFiles.length > 0) {
  console.log(`\nFiles > 500KB (${bigFiles.length}):`);
  bigFiles.forEach(r => {
    console.log(`  ${(r.size / 1024 / 1024).toFixed(1)}MB  ${r.url.slice(0, 130)}`);
  });
}

await browser.close();
process.exit(0);
