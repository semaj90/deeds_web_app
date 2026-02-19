import path from 'path';
import { pathToFileURL } from 'url';
import util from 'util';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/inspect-machine.ts <relative-path-to-machine>');
    process.exit(2);
  }
  const filePath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  console.log('Inspecting', filePath);
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const keys = Object.keys(mod);
    console.log('Export keys:', keys);
    for (const k of keys) {
      const v = (mod as any)[k];
      console.log(`\n--- Export: ${k}`);
      console.log('Type:', typeof v);
      if (v && typeof v === 'object') {
        console.log('Prototype:', Object.getPrototypeOf(v) && Object.getPrototypeOf(v).constructor && Object.getPrototypeOf(v).constructor.name);
        console.log('Has logic:', !!(v as any).logic);
        if ((v as any).logic) {
          console.log('logic keys:', Object.keys((v as any).logic));
          console.log('getInitialSnapshot type:', typeof (v as any).logic.getInitialSnapshot);
        }
        console.log('Own keys:', Object.keys(v).slice(0, 50));
        console.log('Inspect dump (depth 2):\n', util.inspect(v, { depth: 2, colors: true }));
      } else {
        console.log('Value:', util.inspect(v, { depth: 1, colors: true }));
      }
    }
  } catch (err: any) {
    console.error('Import/inspect error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

main();
