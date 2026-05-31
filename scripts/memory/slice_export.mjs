import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = { input: null, output: null, start: 0, end: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--start') out.start = Number(argv[++i]);
    else if (a === '--end') out.end = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('Usage: node slice_export.mjs --input <file> --output <file> --start <n> --end <m>');
    process.exit(1);
  }
  const raw = await readFile(args.input, 'utf8');
  const arr = JSON.parse(raw);
  const sliced = arr.slice(args.start, args.end ?? undefined);
  await writeFile(args.output, JSON.stringify(sliced, null, 2), 'utf8');
  console.log('wrote', args.output, sliced.length);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
