#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const FRONT = path.join(REPO, "sveltekit-frontend");
const SCAN_DIRS = [
  path.join(FRONT, "src"),
  path.join(FRONT, "types"),
];

const BACKUP_DIR = path.join(__dirname, "backups", "fix-dts-surgical");
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function* walk(dir) {
  const q = [dir];
  while (q.length) {
    const d = q.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { q.push(p); }
      else { yield p; }
    }
  }
}

function maskStrings(txt) {
  const out = [];
  const map = [];
  let i = 0, q = null, esc = false, buf = "";

  const push = () => {
    map.push(buf);
    out.push(`__DTSMASK_${map.length - 1}__`);
    buf = "";
  };

  while (i < txt.length) {
    const c = txt[i];
    if (!q) {
      if (c === "'" || c === '"' || c === "`") { q = c; buf = c; i++; continue; }
      out.push(c); i++; continue;
    }
    // inside string
    buf += c;
    if (!esc && c === q) { q = null; push(); i++; continue; }
    esc = !esc && c === "\\";
    i++;
  }
  if (q) { // unterminated
    out.push(buf);
  }
  return { masked: out.join(""), map };
}

function unmaskStrings(txt, map) {
  return txt.replace(/__DTSMASK_(\d+)__/g, (_, i) => map[+i]);
}

function fixDts(text) {
  let t = text;

  // A) Index signature: [key, string] or [key ; string] -> [key: string]
  t = t.replace(
    /\[\s*([A-Za-z_$][\w$]*)\s*[,;]\s*(string|number|symbol)\s*\]/g,
    "[$1: $2]"
  );

  // Also handle readonly [K, string]
  t = t.replace(
    /readonly\s*\[\s*([A-Za-z_$][\w$]*)\s*[,;]\s*(string|number|symbol)\s*\]/g,
    "readonly [$1: $2]"
  );

  // B) Generics with colon instead of comma
  const genericTargets = [
    "Record", "Partial", "Required", "Readonly", "Pick", "Omit",
    "Map", "ReadonlyMap", "WeakMap",
    "Set", "ReadonlySet", "WeakSet",
    "Promise", "Array",
    "Partial<Record", "Readonly<Record", "Required<Record"
  ];

  for (const name of genericTargets) {
    const rx = new RegExp(`\\b${name}\\s*<\\s*([^>]*?)>`, "g");
    t = t.replace(rx, (m, inner) => {
      const fixed = inner
        .replace(/\b(string|number|boolean|any|unknown|symbol)\s*:\s*(?=[A-Za-z_{[(])/g, "$1, ")
        .replace(/\b([A-Za-z_$][\w$<>.?| &]+)\s*:\s*(?=[A-Za-z_{[(])/g, "$1, ");
      return m.replace(inner, fixed);
    });
  }

  // C) { [key, string]: any } in interfaces
  t = t.replace(
    /\{\s*\[\s*([A-Za-z_$][\w$]*)\s*[,;]\s*(string|number|symbol)\s*\]\s*:\s*/g,
    "{ [$1: $2]: "
  );

  // D) Record<key: string, …>
  t = t.replace(/Record\s*<\s*key\s*:\s*/g, "Record<key, ");

  // E) Trim extra spaces
  t = t.replace(/,\s{2,}/g, ", ").replace(/:\s{2,}/g, ": ");

  return t;
}

function processFile(abs) {
  const orig = fs.readFileSync(abs, "utf8");
  const { masked, map } = maskStrings(orig);
  const fixedMasked = fixDts(masked);
  if (fixedMasked === masked) return false;
  const candidate = unmaskStrings(fixedMasked, map);
  const rel = path.relative(REPO, abs);
  const backupPath = path.join(BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(abs, backupPath);
  fs.writeFileSync(abs, candidate, "utf8");
  return true;
}

let scanned = 0, changed = 0;
for (const base of SCAN_DIRS) {
  for (const file of walk(base)) {
    if (!file.endsWith(".d.ts")) continue;
    if (file.includes(path.sep + ".svelte-kit" + path.sep)) continue;
    if (file.includes(path.sep + "build" + path.sep)) continue;
    scanned++;
    try { if (processFile(file)) changed++; } catch {}
  }
}
console.log(JSON.stringify({ kind: "fix-dts-surgical", scanned, changed, backupDir: BACKUP_DIR }, null, 2));
