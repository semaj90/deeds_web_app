import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const machinesDir = path.join(process.cwd(), 'sveltekit-frontend', 'src', 'lib', 'machines');

async function inspectFile(filePath: string) {
  const rel = path.relative(process.cwd(), filePath);
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const keys = Object.keys(mod);
    for (const key of keys) {
      const val = (mod as any)[key];
      const hasLogic = !!(val && typeof val.logic === 'object');
      const hasGetInitial = !!(val && typeof val.getInitialSnapshot === 'function');
      const type = typeof val;
      console.log(`${rel} -> export ${key}: type=${type}, hasLogic=${hasLogic}, hasGetInitial=${hasGetInitial}`);
    }
  } catch (err: any) {
    console.warn(`Failed to import ${rel}:`, err && (err.message || String(err)));
  }
}

async function main() {
  if (!fs.existsSync(machinesDir)) {
    console.error('Machines dir not found:', machinesDir);
    process.exit(2);
  }
  const files = fs.readdirSync(machinesDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  for (const f of files) {
    await inspectFile(path.join(machinesDir, f));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
