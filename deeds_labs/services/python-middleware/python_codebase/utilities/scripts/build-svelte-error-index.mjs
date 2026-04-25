import fs from "fs";
import path from "path";

const LOG_PATH = process.argv[2] || "svelte-check.log";

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function parseLine(line) {
  const noAnsi = stripAnsi(line);
  // Try pattern: file:line:col - error TS####: message
  let m = noAnsi.match(/^(.*?):(\d+):(\d+)\s*-\s*(error|warning)\s*(?:[A-Z]*\d*:)\s*(.*)$/i);
  if (m) {
    return {
      file: m[1],
      line: Number(m[2]),
      column: Number(m[3]),
      level: m[4].toLowerCase(),
      message: m[5].trim(),
      raw: noAnsi
    };
  }

  // Fallback: detect level anywhere and attempt to split file prefix
  m = noAnsi.match(/\b(error|warning)\b/i);
  if (m) {
    const level = m[1].toLowerCase();
    // Attempt to split file prefix if colon-positions appear
    const fm = noAnsi.match(/^(.*?):(\d+):(\d+)/);
    const message = noAnsi.replace(/^.*?-\s*/,'').replace(/^\s*\b(error|warning)\b\s*:*/i,'').trim();
    return {
      file: fm ? fm[1] : undefined,
      line: fm ? Number(fm[2]) : undefined,
      column: fm ? Number(fm[3]) : undefined,
      level,
      message,
      raw: noAnsi
    };
  }
  return null;
}

function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`Log file not found: ${LOG_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(LOG_PATH, "utf8");
  const lines = raw.split(/\r?\n/);

  const byType = new Map(); // message -> {count, examples: Set(files)}
  const byFile = new Map(); // file -> {count, items: [{level,message,line,column}]}

  for (const line of lines) {
    if (!line) continue;
    if (!/\berror\b|\bwarning\b/i.test(line)) continue;
    const rec = parseLine(line);
    if (!rec) continue;

    // byType
    const key = rec.message || rec.raw;
    let t = byType.get(key);
    if (!t) t = { count: 0, examples: new Set(), level: rec.level };
    t.count += 1;
    if (rec.file) t.examples.add(rec.file);
    byType.set(key, t);

    // byFile
    const fileKey = rec.file || "<unknown>";
    let f = byFile.get(fileKey);
    if (!f) f = { count: 0, items: [] };
    f.count += 1;
    f.items.push({ level: rec.level, message: rec.message, line: rec.line, column: rec.column });
    byFile.set(fileKey, f);
  }

  const typeArr = [...byType.entries()].map(([message, v]) => ({
    message,
    level: v.level,
    count: v.count,
    exampleFiles: [...v.examples].slice(0, 5)
  })).sort((a,b)=>b.count-a.count);

  const fileArr = [...byFile.entries()].map(([file, v]) => ({
    file,
    count: v.count,
    items: v.items.slice(0, 50)
  })).sort((a,b)=>b.count-a.count);

  fs.writeFileSync("svelte-errors-by-type.json", JSON.stringify(typeArr, null, 2));
  fs.writeFileSync("svelte-errors-by-file.json", JSON.stringify(fileArr, null, 2));

  console.log(`Wrote svelte-errors-by-type.json (${typeArr.length} types)`);
  console.log(`Wrote svelte-errors-by-file.json (${fileArr.length} files)`);
}

main();

