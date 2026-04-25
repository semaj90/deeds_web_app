import { resolveConfig } from 'vite';

async function checkDefineKeys() {
  console.log('Step 1: Checking config.define...');
  const config = await resolveConfig({}, { command: 'build', mode: 'production' });

  const define = config.define || {};
  const badDefineKeys = Object.keys(define).filter(k => k.includes('-'));
  console.log('config.define bad keys:', badDefineKeys.length);
  badDefineKeys.forEach(k => console.log('  ', k, '=>', String(define[k]).slice(0, 120)));

  console.log('\nStep 2: Checking esbuild.define...');
  const esbuildDefine = (config.esbuild?.define) || {};
  const badEsbuildKeys = Object.keys(esbuildDefine).filter(k => k.includes('-'));
  console.log('esbuild.define bad keys:', badEsbuildKeys.length);
  badEsbuildKeys.forEach(k => console.log('  ', k, '=', String(esbuildDefine[k]).slice(0, 120)));

  console.log('\nStep 3: Plugin list...');
  console.log(config.plugins.map(p => p.name).join('\n'));
}

checkDefineKeys().catch(console.error);
