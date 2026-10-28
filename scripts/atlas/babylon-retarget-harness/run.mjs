import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const clip = process.argv[2] || 'point_audience';
const bundle = readFileSync('../.tmp/atlas/babylon-harness/bundle.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:5173/demos/icons', { waitUntil: 'load', timeout: 90000 });
await page.addScriptTag({ content: bundle });
let r; try { r = await page.evaluate(async ([c, k]) => await (window).runHarness(c, k), [(process.argv[3] || '/models/courtroom/character_alice.glb'), `/models/courtroom/${clip}.glb`]); r.shots.forEach((d, i) => writeFileSync(`../.tmp/atlas/babylon-harness/rt-${clip}-${i}.png`, Buffer.from(d.split(',')[1], 'base64'))); delete r.shots; } catch (e) { r = { error: String(e.message).slice(0, 400) }; }
await browser.close();
console.log(JSON.stringify(r));
