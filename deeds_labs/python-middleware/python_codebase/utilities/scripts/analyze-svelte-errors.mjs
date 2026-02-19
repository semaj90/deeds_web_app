import fs from "fs";
import { createInterface } from "readline";
import { createReadStream } from "fs";
import path from "path";

const LOG_PATH = process.argv[2] || "svelte-check.log";
const TOP_N = Number(process.argv[3] || 1000);
const OUT_DIR = path.resolve("svelte-check-errors-index");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function parseRecord(line) {
  const noAnsi = stripAnsi(line);
  
  // Try to match the timestamp and the rest of the line
  const match = noAnsi.match(/^(\d+)\s+(.*)$/);
  if (!match) {
    // Fallback for lines without a timestamp, or if the format is completely different
    const lvl = noAnsi.match(/\b(error|warning)\b/i)?.[1]?.toLowerCase();
    if (lvl) {
        const fm = noAnsi.match(/^(.*?):(\d+):(\d+)/);
        const msg = noAnsi.replace(/^.*?-\s*/, "").replace(/^\s*\b(error|warning)\b\s*:*/i, "").trim();
        return {
            file: fm?.[1],
            line: fm ? Number(fm[2]) : undefined,
            column: fm ? Number(fm[3]) : undefined,
            level: lvl,
            code: undefined,
            message: msg,
            raw: noAnsi,
        };
    }
    return null;
  }

  const timestamp = Number(match[1]);
  const restOfLine = match[2];

  // Log the restOfLine to debug
  console.log("DEBUG: restOfLine:", restOfLine);

  // Now try to parse the restOfLine
  // Pattern: ERROR "file":line:col "Message"
  let m = restOfLine.match(/^(ERROR|WARNING)\s+\"(.*?)\"\s+(\d+):(\d+)\s+\"(.*)\"$/);
  if (m) {
    return {
      timestamp: timestamp,
      level: m[1].toLowerCase(),
      file: m[2],
      line: Number(m[3]),
      column: Number(m[4]),
      message: m[5].trim(),
      raw: noAnsi,
    };
  }

  // Fallback: file:line:col - error TS1234: Message
  m = restOfLine.match(/^(.*?):(\d+):(\d+)\s*-\s*(error|warning)\s*([A-Z]*\d*:)\s*(.*)$/i);
  if (m) {
    return {
      timestamp: timestamp,
      file: m[1],
      line: Number(m[2]),
      column: Number(m[3]),
      level: m[4].toLowerCase(),
      code: m[5]?.replace(/:$/, ""),
      message: m[6].trim(),
      raw: noAnsi,
    };
  }

  // Fallback: file:line:col - error: Message
  m = restOfLine.match(/^(.*?):(\d+):(\d+)\s*-\s*(error|warning)\s*:?\s*(.*)$/i);
  if (m) {
    return {
      timestamp: timestamp,
      file: m[1],
      line: Number(m[2]),
      column: Number(m[3]),
      level: m[4].toLowerCase(),
      code: undefined,
      message: m[5].trim(),
      raw: noAnsi,
    };
  }

  return null;
}

function langExtract(message) {
  // Extract TS codes, module imports, path aliases
  const tsCodes = [...message.matchAll(/\bTS\d{3,5}\b/g)].map((m) => m[0]);
  const modules = [...message.matchAll(/(?:module|package) ['\"]([^'\"]+)['\"]/gi)].map((m) => m[1]);
  const aliases = [...message.matchAll(/\$[a-zA-Z]+\/[\w\-\.\/]+/g)].map((m) => m[0]);
  const idents = [...message.matchAll(/['\"]([A-Za-z_][\w\.]*)['\"]/g)].map((m) => m[1]).slice(0, 5);
  return { tsCodes, modules, aliases, idents };
}

async function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`Log file not found: ${LOG_PATH}`);
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const rl = createInterface({ input: createReadStream(LOG_PATH, { encoding: "utf8" }) });

  const byMessage = new Map(); // msg -> {count, level, code, examples:Set(file), entities}
  const byFile = new Map(); // file -> {count, items:[{message, level, code, line, column}]}

  for await (const line of rl) {
    if (!line) continue;
    console.log("RAW LINE:", line); // Debug print
    const rec = parseRecord(line);
    if (!rec) continue;

    const msgKey = rec.message.replace(/\s+/g, " ").trim();
    const ent = langExtract(msgKey);

    const t = byMessage.get(msgKey) || { count: 0, level: rec.level, code: rec.code, examples: new Set(), entities: ent };
    t.count += 1;
    if (rec.file) t.examples.add(rec.file);
    byMessage.set(msgKey, t);

    const fkey = rec.file || "<unknown>";
    const f = byFile.get(fkey) || { count: 0, items: [] };
    f.count += 1;
    if (f.items.length < 100) {
      f.items.push({ message: rec.message, level: rec.level, code: rec.code, line: rec.line, column: rec.column });
    }
    byFile.set(fkey, f);
  }

  // Top N by message
  const topMessages = [...byMessage.entries()]
    .map(([message, v]) => ({ message, level: v.level, code: v.code, count: v.count, exampleFiles: [...v.examples].slice(0, 5), entities: v.entities }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  // Top N files by count
  const topFiles = [...byFile.entries()]
    .map(([file, v]) => ({ file, count: v.count, items: v.items }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  // Write outputs
  fs.writeFileSync(path.join(OUT_DIR, "top-messages.json"), JSON.stringify(topMessages, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "top-files.json"), JSON.stringify(topFiles, null, 2));

  // Text summaries
  const msgTxt = topMessages.map((x, i) => `${String(i + 1).padStart(4)}. (${x.count}) ${x.message}`).join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "top-messages.txt"), msgTxt + "\n");

  const fileTxt = topFiles.map((x, i) => `${String(i + 1).padStart(4)}. (${x.count}) ${x.file}`).join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "top-files.txt"), fileTxt + "\n");

  console.log(`Indexed ${byMessage.size} unique messages across ${byFile.size} files.`);
  console.log(`Wrote top ${TOP_N} messages and files to ${OUT_DIR}`);
}

main();
