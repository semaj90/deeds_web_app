import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createActor } from 'xstate';

const machinesDir = path.join(process.cwd(), 'sveltekit-frontend', 'src', 'lib', 'machines');

async function testFile(filePath: string) {
  const rel = path.relative(process.cwd(), filePath);
  console.log('\n--- Testing', rel);
  try {
  // import() in Node ESM requires a file:// URL for absolute paths on Windows
  const mod = await import(pathToFileURL(filePath).href);
    const keys = Object.keys(mod);
    for (const key of keys) {
      if (/Machine$/.test(key) || /machine$/.test(key)) {
        const val = (mod as any)[key];
        if (val && typeof val === 'object') {
          try {
            let actor: any;
            try {
              actor = createActor(val as any);
            } catch (createErr: any) {
              // If createActor fails due to missing logic/getInitialSnapshot, attempt lightweight adapter
              const errMsg = createErr && (createErr.message || String(createErr));
              if (errMsg && /getInitialSnapshot|logic/.test(errMsg)) {
                const m = val as any;
                if (m && typeof m === 'object' && !m.logic && typeof m.getInitialSnapshot === 'function') {
                  const adapted = { ...m, logic: {
                    getInitialSnapshot: m.getInitialSnapshot.bind(m),
                    getPersistedSnapshot: typeof m.getPersistedSnapshot === 'function' ? m.getPersistedSnapshot.bind(m) : undefined,
                    restoreSnapshot: typeof m.restoreSnapshot === 'function' ? m.restoreSnapshot.bind(m) : undefined,
                  } };
                  actor = createActor(adapted as any);
                } else {
                  throw createErr;
                }
              } else {
                throw createErr;
              }
            }

            console.log(`Created actor for ${key} from ${rel}. start present?`, typeof (actor as any).start === 'function');
            try {
              (actor as any).start();
              console.log(`Started actor for ${key} ok`);
            } catch (err) {
              console.error(`Error starting actor for ${key}:`, err && (err.stack || err.message || err));
            }
          } catch (err) {
            console.error(`Error creating actor for ${key}:`, err && (err.stack || err.message || err));
          }
        }
      }
    }
  } catch (err) {
    console.error('Import error for', rel, err && (err.stack || err.message || err));
  }
}

async function main() {
  if (!fs.existsSync(machinesDir)) {
    console.error('Machines dir not found:', machinesDir);
    process.exit(2);
  }
  const files = fs.readdirSync(machinesDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  for (const f of files) {
    await testFile(path.join(machinesDir, f));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
